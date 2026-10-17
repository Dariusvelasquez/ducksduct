#!/usr/bin/env node
/* Builds the deployable site into dist/. No dependencies.
 *   node tools/build.js            production build (no real-job examples)
 *   node tools/build.js --demo     also include private/ examples and turn them on
 *   node tools/build.js --config=my-brand.js   use a different branding file than config.js
 *   node tools/build.js --single   additionally write dist/index.single.html (everything inlined, one file)
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
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

let examples = 'window.EXAMPLES = window.EXAMPLES || {};\n';
let config = readConfig();
if (args.has('--demo')) {
  for (const f of fs.readdirSync(path.join(root, 'private')).filter((f) => f.endsWith('.js'))) examples += read('private/' + f) + '\n';
  config += '\nwindow.BRAND.features.examples = true;\n';
}

// Hosts the app talks to. Anything else is blocked by the Content-Security-Policy below.
const connect = ['https://nominatim.openstreetmap.org', 'https://overpass-api.de', 'https://overpass.kumi.systems',
  'https://maps.hillsboroughcounty.org', 'https://services1.arcgis.com', 'https://gis.fdacs.gov', 'https://maps.pascopa.com', 'https://app.regrid.com'];
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${connect.join(' ')}; object-src 'none'; base-uri 'none'; form-action 'none'`;

let html = read('index.html')
  .replace(/<title>.*?<\/title>/, `<title>${brand.name.replace(/[<>&]/g, '')}</title>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);

const files = { 'style.css': read('style.css'), 'hvac.js': read('hvac.js'), 'lookup.js': read('lookup.js'), 'app.js': read('app.js'), 'config.js': config, 'examples.js': examples };
fs.writeFileSync(path.join(dist, 'index.html'), html);
for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dist, f), c);
if (fs.existsSync(path.join(root, 'assets'))) fs.cpSync(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });

if (args.has('--single')) {
  const body = html.match(/<body>([\s\S]*?)<script src="config.js">/)[1];
  const js = ['config.js', 'hvac.js', 'lookup.js', 'examples.js', 'app.js'].map((f) => files[f]).join('\n');
  if (/<\/script/i.test(js)) throw new Error('inline script contains </script');
  fs.writeFileSync(path.join(dist, 'index.single.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${brand.name}</title><style>${files['style.css']}</style></head><body>${body}<script>${js}</script></body></html>`);
}
console.log('Built dist/ for "' + brand.name + '"' + (args.has('--demo') ? ' (demo: includes private examples)' : '') + ':', fs.readdirSync(dist).join(', '));
