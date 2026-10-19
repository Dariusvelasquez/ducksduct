/* Search and AI-assistant visibility, generated at build time. No dependencies.
 * Pure functions: given the brand config they return { 'path': 'file text' } for the build to write, and head tags for index.html.
 * What gets written: crawlable pages (how it works, FAQ, accuracy and limits), robots.txt, sitemap.xml, llms.txt, llms-full.txt,
 * and the meta / Open Graph / JSON-LD tags for the app page. Absolute URLs (canonical, sitemap, social cards) need brand.site.url. */

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot', 'Meta-ExternalAgent', 'Amazonbot', 'DuckAssistBot', 'cohere-ai'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const DEFAULT_FAQ = [
  ['What is it?', 'A browser-based HVAC duct layout and sizing tool. You look up a property or draw a floor plan, place the condenser, air handler, supply outlets and return intakes, and see per-room need against delivered BTU and CFM, duct sizes, tonnage and square feet per ton, for the existing system and a proposed one, side by side.'],
  ['Is this a Manual J load calculation?', 'No. Room load is floor area times a BTU-per-square-foot factor, adjusted for ceiling height and sun exposure. It is a presentation estimate. A full ACCA Manual J load calculation should be done before final equipment selection.'],
  ['Do I need to install anything or create an account?', 'No. It runs in the browser on a phone, tablet or computer. It can be installed to the home screen and keeps working with no signal. Address lookups and map pictures need a connection.'],
  ['Where is my data stored?', 'Jobs are saved in your own browser on your own device and are not uploaded to a server. A floor-plan image you load for tracing stays in memory. Address lookups send the address to OpenStreetMap and public county GIS services. Jobs can be exported to a file as a backup.'],
  ['Which property records can it look up?', 'It finds the address and building outline from OpenStreetMap. Parcel records come from public property-appraiser services: Hillsborough County (folio, beds, baths, stories, heated square feet, year built), Sarasota County (parcel ID, living area, year built), Pasco County (parcel ID) and the Florida statewide parcel layer (parcel ID) for Pinellas and elsewhere in Florida. Verify folio numbers on the property appraiser site.'],
  ['Can I use my own floor plan?', 'Yes. Load a floor-plan image such as a listing screenshot or a photo of a sketch, set the scale on a wall of known length, and let it detect rooms or trace them by hand. You can also build a starting plan from square footage.'],
  ['Can I show the result to a customer?', 'Yes. The customer presentation shows the existing and proposed layouts side by side and can be printed or saved as PDF. A picture of the plan can be shared from a phone.'],
];

const HOW = [
  ['1. Start with the property', 'Type an address to find the building outline and county record, load the example home, enter the size, or load a floor-plan image and set its scale. Rooms can be detected from the image or drawn.'],
  ['2. Place the equipment', 'Add the condenser, air handler, supply outlets, return intakes, splitters and mini-split heads. Everything is draggable. Duct bends can be dragged, equipment rotated and duplicated, and every change can be undone.'],
  ['3. Read the sizing', 'Each room shows the load it needs against the airflow and BTU it is getting, with duct diameters, tonnage and square feet per ton. A sizing table, equipment matching and a parts list are included.'],
  ['4. Compare and present', 'Build the existing system, copy it to the proposed scenario, change it, and show both side by side to the customer. Print it, save a PDF or share a picture.'],
  ['5. Capture on site', 'Attach photos with GPS and time, drop pins, record tape measurements and job notes, and set ceiling height and sun exposure per room.'],
];

const LIMITS = [
  'Room load is area times a BTU-per-square-foot factor, scaled for ceiling height and sun exposure. It is not an ACCA Manual J.',
  'Airflow is 400 CFM per ton, split across outlets by damper weight. Duct diameter uses a fixed 700 fpm velocity. It is not a Manual D friction-rate design.',
  'Tonnage read from a model number is a pattern match and can be wrong. Verify it on the nameplate.',
  'The starting floor plan is a typical layout scaled to the building, not a survey of the real house. Edit it to match.',
  'Parcel records come from public county services that can change or be unavailable. Verify against the property appraiser.',
];

function siteOf(brand) {
  const s = brand.site || {}, co = brand.company || {};
  const url = (s.url || '').replace(/\/+$/, '');
  return {
    url,
    name: brand.name,
    org: co.name || brand.name,
    tagline: s.tagline || 'HVAC duct layout and sizing in the browser',
    description: s.description || 'Draw an HVAC duct layout over a building plan, compare room load against delivered airflow, size ducts and equipment, and present the existing and proposed systems side by side. Works on phones, offline.',
    keywords: s.keywords || ['HVAC duct layout', 'duct sizing', 'AC replacement proposal', 'BTU per room', 'HVAC design software', 'floor plan duct design'],
    areas: s.areas || ['Florida'],
    faq: (s.faq && s.faq.length ? s.faq : DEFAULT_FAQ),
    how: (s.how && s.how.length ? s.how : HOW),
    limits: (s.limits && s.limits.length ? s.limits : LIMITS),
    phone: co.phone || '', email: co.email || '', license: co.license || '', website: co.website || '',
    image: s.image || 'assets/icon-512.png',
    today: s.lastmod || new Date().toISOString().slice(0, 10),
  };
}

const abs = (S, p) => (S.url ? S.url + '/' + p.replace(/^\.?\//, '') : '');

function organization(S) {
  const o = { '@type': 'Organization', name: S.org };
  if (S.url) { o['@id'] = S.url + '/#org'; o.url = S.website || S.url; }
  if (S.phone || S.email) o.contactPoint = { '@type': 'ContactPoint', contactType: 'sales', ...(S.phone && { telephone: S.phone }), ...(S.email && { email: S.email }) };
  if (S.areas.length) o.areaServed = S.areas;
  return o;
}

function appSchema(S) {
  const a = {
    '@type': 'SoftwareApplication', name: S.name, description: S.description, applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any device with a web browser', browserRequirements: 'Requires JavaScript',
    featureList: ['Duct layout over a building plan or map', 'Per-room BTU and CFM, existing against proposed', 'Duct, tonnage and equipment sizing', 'Floor-plan image room detection', 'Customer presentation, print and share picture', 'Photos with GPS, measurements and notes', 'Installable, works offline'],
    publisher: organization(S),
  };
  if (S.url) { a.url = S.url + '/'; a.image = abs(S, S.image); }
  return a;
}

function faqSchema(S) {
  return { '@type': 'FAQPage', mainEntity: S.faq.map(([q, an]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: an } })) };
}

const ld = (...nodes) => `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': nodes })}</script>`;

/* Tags to put in <head> of the app page (index.html). */
function headTags(brand) {
  const S = siteOf(brand), t = [];
  t.push(`<meta name="description" content="${esc(S.description)}">`);
  t.push(`<meta name="keywords" content="${esc(S.keywords.join(', '))}">`);
  t.push('<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">');
  t.push(`<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(S.name)}"><meta property="og:title" content="${esc(S.name + ': ' + S.tagline)}"><meta property="og:description" content="${esc(S.description)}">`);
  t.push('<meta name="twitter:card" content="summary">');
  if (S.url) t.push(`<link rel="canonical" href="${S.url}/"><meta property="og:url" content="${S.url}/"><meta property="og:image" content="${abs(S, S.image)}">`);
  t.push('<link rel="alternate" type="text/plain" href="llms.txt" title="Summary for AI assistants">');
  t.push(ld(appSchema(S), { '@type': 'WebSite', name: S.name, ...(S.url && { url: S.url + '/' }) }));
  return t.join('\n');
}

/* Readable summary for people and crawlers that do not run JavaScript; goes at the top of <body>. */
function noscriptBlock(brand) {
  const S = siteOf(brand);
  return `<noscript><div style="max-width:42em;margin:2em auto;padding:0 1em;font:16px/1.5 system-ui,sans-serif;color:#e6eefb"><h2>${esc(S.name)}: ${esc(S.tagline)}</h2><p>${esc(S.description)}</p><p>This tool needs JavaScript. Read more: <a href="how-it-works/">how it works</a>, <a href="faq/">questions and answers</a>, <a href="accuracy/">accuracy and limits</a>.</p></div></noscript>`;
}

const PAGE_CSS = 'body{margin:0;background:#fff;color:#16202e;font:17px/1.6 system-ui,sans-serif}main{max-width:44em;margin:0 auto;padding:1.5em 1em 3em}nav{background:#14263d;padding:.7em 1em}nav a{color:#e6eefb;margin-right:1.2em;text-decoration:none;font-weight:600}h1{font-size:1.8em;line-height:1.2}h2{font-size:1.25em;margin-top:1.8em}a{color:#0b63c4}.cta{display:inline-block;background:#3fa7ff;color:#04111f;padding:.6em 1.1em;border-radius:6px;font-weight:700;text-decoration:none}footer{border-top:1px solid #d5dde8;margin-top:3em;padding-top:1em;font-size:.85em;color:#53627a}';

const PAGES = [
  { path: 'how-it-works/', title: 'How it works', nav: 'How it works' },
  { path: 'faq/', title: 'Questions and answers', nav: 'FAQ' },
  { path: 'accuracy/', title: 'Accuracy and limits', nav: 'Accuracy' },
];

function bodyOf(S, key) {
  if (key === 'how-it-works/') return `<h1>How ${esc(S.name)} works</h1><p>${esc(S.description)}</p>` + S.how.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join('');
  if (key === 'faq/') return `<h1>${esc(S.name)}: questions and answers</h1>` + S.faq.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join('');
  return `<h1>What the numbers are, and are not</h1><p>${esc(S.name)} is built for fast, clear before-and-after proposals. These are its limits.</p><ul>` + S.limits.map((l) => `<li>${esc(l)}</li>`).join('') + `</ul><p>Every proposal carries this disclaimer: ${esc(S.disclaimer)}</p>`;
}

function page(S, brand, pg) {
  const depth = '../', canon = abs(S, pg.path);
  const desc = pg.path === 'faq/' ? S.faq.slice(0, 3).map((x) => x[1]).join(' ').slice(0, 155) : pg.path === 'accuracy/' ? 'How room load, airflow and duct sizes are estimated, and where the estimate stops. Not a Manual J load calculation.' : S.description;
  const nodes = [organization(S), { '@type': 'WebPage', name: pg.title + ' | ' + S.name, description: desc, ...(canon && { url: canon }) }];
  if (pg.path === 'faq/') nodes.push(faqSchema(S));
  const contact = [S.phone, S.email, S.license].filter(Boolean).map(esc).join(' &middot; ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'">
<title>${esc(pg.title)} | ${esc(S.name)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
${canon ? `<link rel="canonical" href="${canon}">` : ''}
<meta property="og:type" content="article"><meta property="og:site_name" content="${esc(S.name)}"><meta property="og:title" content="${esc(pg.title + ' | ' + S.name)}"><meta property="og:description" content="${esc(desc)}">
<link rel="alternate" type="text/plain" href="${depth}llms.txt" title="Summary for AI assistants">
${ld(...nodes)}
<style>${PAGE_CSS}</style></head><body>
<nav><a href="${depth}">${esc(S.name)}</a>${PAGES.map((p) => `<a href="${depth}${p.path}">${esc(p.nav)}</a>`).join('')}</nav>
<main>${bodyOf(S, pg.path)}<p><a class="cta" href="${depth}">Open ${esc(S.name)}</a></p>
<footer>${esc(S.org)}${contact ? ' &middot; ' + contact : ''}<br>Last updated ${S.today}</footer></main></body></html>
`;
}

function llmsTxt(S) {
  const link = (p, d) => `- [${d[0]}](${abs(S, p) || p}): ${d[1]}`;
  return [`# ${S.name}`, '', `> ${S.description}`, '',
    `${S.name} is a web app (nothing to install, no account) used by HVAC contractors and estimators to lay out ducts, size equipment and present existing against proposed systems. It is an estimate tool, not a Manual J load calculation.`, '',
    `Service area for property lookups: ${S.areas.join(', ')}.`, '',
    '## Docs', '',
    link('', [S.name + ' app', 'the tool itself']),
    link('how-it-works/', ['How it works', 'the workflow from property to customer presentation']),
    link('faq/', ['Questions and answers', 'data, privacy, lookups, offline use']),
    link('accuracy/', ['Accuracy and limits', 'what the numbers are and are not']),
    '', '## Optional', '', link('llms-full.txt', ['Full text', 'every page above in one file']), ''].join('\n');
}

function llmsFull(S, brand) {
  const out = [`# ${S.name}`, '', `> ${S.description}`, '', '## How it works', ''];
  S.how.forEach(([h, p]) => out.push(`### ${h}`, '', p, ''));
  out.push('## Questions and answers', '');
  S.faq.forEach(([q, a]) => out.push(`### ${q}`, '', a, ''));
  out.push('## Accuracy and limits', '', ...S.limits.map((l) => '- ' + l), '', `Disclaimer on every proposal: ${S.disclaimer}`, '');
  const contact = [S.phone, S.email, S.license, S.website].filter(Boolean);
  if (contact.length) out.push('## Contact', '', `${S.org}: ${contact.join(', ')}`, '');
  return out.join('\n');
}

function robotsTxt(S) {
  const rules = ['User-agent: *', 'Allow: /', ''];
  AI_BOTS.forEach((b) => rules.push(`User-agent: ${b}`, 'Allow: /', ''));
  if (S.url) rules.push(`Sitemap: ${S.url}/sitemap.xml`, '');
  return rules.join('\n');
}

function sitemapXml(S) {
  const urls = [''].concat(PAGES.map((p) => p.path));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${abs(S, u) || S.url + '/'}</loc><lastmod>${S.today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

/* All generated files for dist/. Without brand.site.url the sitemap and canonical/social URLs are left out (a warning is returned). */
function buildSeo(brand) {
  const S = siteOf(brand);
  S.disclaimer = brand.disclaimer || '';
  const files = { 'robots.txt': robotsTxt(S), 'llms.txt': llmsTxt(S), 'llms-full.txt': llmsFull(S, brand) };
  PAGES.forEach((p) => { files[p.path + 'index.html'] = page(S, brand, p); });
  const warnings = [];
  if (S.url) files['sitemap.xml'] = sitemapXml(S);
  else warnings.push('config.js site.url is empty: no sitemap.xml, canonical or social-card URLs were written. Set it to the public address, e.g. https://design.example.com');
  return { files, head: headTags(brand), noscript: noscriptBlock(brand), pages: PAGES.map((p) => p.path), warnings };
}

module.exports = { buildSeo, headTags, noscriptBlock, siteOf, AI_BOTS, PAGES };
