#!/usr/bin/env node
/* Creates a clean copy of the source for the buyer in handoff/<name>/ (and a .zip if `zip` is installed).
 * Excludes git history, private/ (if present), dist/ and handoff/ itself. Run: npm run export */
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), ctx);
const slug = (ctx.window.BRAND.name || 'hvac-designer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const out = path.join(root, 'handoff', slug + '-source');
const skip = new Set(['.git', 'private', 'dist', 'handoff', 'node_modules']);
fs.rmSync(path.join(root, 'handoff'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const e of fs.readdirSync(root)) if (!skip.has(e)) fs.cpSync(path.join(root, e), path.join(out, e), { recursive: true });
console.log('Clean source copy:', path.relative(root, out));
try { cp.execSync(`cd "${path.join(root, 'handoff')}" && zip -qr "${slug}-source.zip" "${slug}-source"`); console.log('Zip:', `handoff/${slug}-source.zip`); }
catch (e) { console.log('`zip` not found: compress the folder yourself.'); }
