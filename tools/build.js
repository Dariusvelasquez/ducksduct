#!/usr/bin/env node
/* Builds the deployable site into dist/. No dependencies.
 *   node tools/build.js            production build
 *   node tools/build.js --config=my-brand.js   use a different branding file than config.js
 *   node tools/build.js --single   additionally write dist/index.single.html (everything inlined, one file)
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { buildSeo } = require('./seo.js');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist');
const argv = process.argv.slice(2), args = new Set(argv);
const cfgArg = argv.find((a) => a.startsWith('--config='));   // --config=path/to/brand-config.js
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const readConfig = () => (cfgArg ? fs.readFileSync(path.resolve(cfgArg.slice(9)), 'utf8') : read('config.js'));

const ctx = { window: {} };
vm.runInNewContext(readConfig(), ctx);
const brand = ctx.window.BRAND;
if (!brand || !brand.name) throw new Error('config.js must define window.BRAND with a name');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

let config = readConfig();

// Hosts the app talks to. Anything else is blocked by the Content-Security-Policy below.
const connect = ['https://nominatim.openstreetmap.org', 'https://overpass-api.de', 'https://overpass.kumi.systems',
  'https://maps.hillsboroughcounty.org', 'https://services1.arcgis.com', 'https://gis.fdacs.gov', 'https://maps.pascopa.com', 'https://app.regrid.com'];
// the map tile server named in config.js must be allowed to send images (and to be fetched when exporting a picture)
let tileOrigin = '';
try { if (brand.map && brand.map.tileUrl) tileOrigin = new URL(brand.map.tileUrl.replace(/\{[a-z]\}/g, '0')).origin; } catch (e) {}
// the Jobber sync server (brand.jobber.proxyUrl in config.js) must be allowed too; with none set the Jobber panel is hidden
let jobberOrigin = '';
try { if (brand.jobber && brand.jobber.proxyUrl) jobberOrigin = new URL(brand.jobber.proxyUrl).origin; } catch (e) {}
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${tileOrigin}; connect-src 'self' ${connect.concat(tileOrigin || [], jobberOrigin || []).join(' ')}; object-src 'none'; base-uri 'none'; form-action 'none'`;

const seo = buildSeo(brand);
const siteTitle = (brand.name + (brand.site && brand.site.tagline ? ': ' + brand.site.tagline : ': HVAC duct layout and sizing')).replace(/[<>&"]/g, '');
let html = read('index.html')
  .replace(/<title>.*?<\/title>/, `<title>${siteTitle}</title>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n${seo.head}`)
  .replace('<body>', `<body>\n${seo.noscript}`);

const files = { 'style.css': read('style.css'), 'hvac.js': read('hvac.js'), 'layout.js': read('layout.js'), 'geo.js': read('geo.js'), 'sizing.js': read('sizing.js'), 'exif.js': read('exif.js'), 'media.js': read('media.js'), 'detect.js': read('detect.js'), 'jobber.js': read('jobber.js'), 'roomplan.js': read('roomplan.js'), 'lookup.js': read('lookup.js'), 'app.js': read('app.js'), 'config.js': config };
fs.writeFileSync(path.join(dist, 'index.html'), html);
for (const [f, c] of Object.entries(seo.files)) { fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true }); fs.writeFileSync(path.join(dist, f), c); }
seo.warnings.forEach((w) => console.warn('WARNING: ' + w));
for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dist, f), c);
if (fs.existsSync(path.join(root, 'assets'))) fs.cpSync(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });

// installable app: a manifest carrying the brand name, and a service worker that knows every file to keep offline
const manifest = JSON.parse(read('manifest.webmanifest'));
manifest.name = brand.name; manifest.short_name = brand.name.length > 12 ? brand.name.slice(0, 12).trim() : brand.name;
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
const listFiles = (dir, rel) => fs.readdirSync(dir).flatMap((f) => (fs.statSync(path.join(dir, f)).isDirectory() ? listFiles(path.join(dir, f), rel + f + '/') : [rel + f]));
const shell = ['./'].concat(listFiles(dist, '').filter((f) => f !== 'sw.js' && f !== 'index.single.html'));
fs.writeFileSync(path.join(dist, 'sw.js'), read('sw.js').replace('__BUILD__', Date.now().toString(36)).replace('__SHELL__', JSON.stringify(shell)));

if (args.has('--single')) {
  const body = html.match(/<body>([\s\S]*?)<script src="config.js">/)[1];
  const js = ['config.js', 'hvac.js', 'layout.js', 'geo.js', 'sizing.js', 'exif.js', 'media.js', 'detect.js', 'jobber.js', 'roomplan.js', 'lookup.js', 'app.js'].map((f) => files[f]).join('\n');
  if (/<\/script/i.test(js)) throw new Error('inline script contains </script');
  fs.writeFileSync(path.join(dist, 'index.single.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${siteTitle}</title><style>${files['style.css']}</style></head><body>${body}<script>${js}</script></body></html>`);
}
console.log('Built dist/ for "' + brand.name + '"' + ':', fs.readdirSync(dist).join(', '));
