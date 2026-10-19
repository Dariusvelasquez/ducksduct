const test = require('node:test');
const assert = require('node:assert');
const { buildSeo, AI_BOTS } = require('../tools/seo.js');

const brand = { name: 'DuctLayout', company: { name: 'Acme Air', phone: '555-0100' }, disclaimer: 'Not a Manual J.', site: { url: 'https://design.example.com/', areas: ['Tampa Bay'] } };

test('writes robots, sitemap, llms files and the content pages', () => {
  const { files, warnings } = buildSeo(brand);
  for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'faq/index.html', 'how-it-works/index.html', 'accuracy/index.html']) assert.ok(files[f], f);
  assert.deepStrictEqual(warnings, []);
});

test('robots.txt allows every AI crawler and names the sitemap', () => {
  const r = buildSeo(brand).files['robots.txt'];
  for (const b of AI_BOTS) assert.match(r, new RegExp(`User-agent: ${b}\\nAllow: /`));
  assert.doesNotMatch(r, /Disallow: \//);
  assert.match(r, /Sitemap: https:\/\/design\.example\.com\/sitemap\.xml/);
});

test('sitemap uses absolute URLs without doubled slashes', () => {
  const s = buildSeo(brand).files['sitemap.xml'];
  assert.match(s, /<loc>https:\/\/design\.example\.com\/<\/loc>/);
  assert.match(s, /<loc>https:\/\/design\.example\.com\/faq\/<\/loc>/);
  assert.doesNotMatch(s, /\.com\/\//);
});

test('head tags carry description, canonical and valid JSON-LD', () => {
  const { head } = buildSeo(brand);
  assert.match(head, /name="description"/);
  assert.match(head, /rel="canonical" href="https:\/\/design\.example\.com\/"/);
  const ld = JSON.parse(head.match(/ld\+json">(.*?)<\/script>/s)[1]);
  assert.ok(ld['@graph'].some((n) => n['@type'] === 'SoftwareApplication'));
});

test('FAQ page has FAQPage structured data matching the visible text', () => {
  const html = buildSeo(brand).files['faq/index.html'];
  const ld = JSON.parse(html.match(/ld\+json">(.*?)<\/script>/s)[1]);
  const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.ok(faq.mainEntity.length > 3);
  for (const q of faq.mainEntity) assert.ok(html.includes(q.name.replace(/&/g, '&amp;')));
});

test('without a site url nothing absolute is written and a warning is returned', () => {
  const b = { ...brand, site: {} };
  const { files, head, warnings } = buildSeo(b);
  assert.ok(!files['sitemap.xml']);
  assert.doesNotMatch(head, /canonical/);
  assert.strictEqual(warnings.length, 1);
});

test('brand text is escaped in pages and JSON-LD cannot close the script tag', () => {
  const { files, head } = buildSeo({ ...brand, name: 'A</script><b>&Co', site: { url: 'https://x.test' } });
  assert.doesNotMatch(head, /<\/script><b>/);
  assert.doesNotMatch(files['faq/index.html'], /<b>&Co/);
});
