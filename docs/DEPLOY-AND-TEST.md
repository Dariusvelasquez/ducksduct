# Deploy and test

## A. Fastest: open the single file (2 minutes, no install)
1. Get `index.single.html` (build it with `npm run build:single`, it appears in `dist/`).
2. Double-click it, or drag it into Chrome. Address and county lookups work from a local file.
3. Saved jobs stay in that browser on that computer.

## B. Run the real build on your computer
1. Install Node.js 24 LTS from nodejs.org (22 also works; 18 and 20 are end of life, so do not use them). Node is only needed on your computer to build and test, not on the web host.
2. Unzip the source, open a terminal in the folder.
3. `npm test` (all tests should pass), then `npm run build`, then `npm run serve`.
4. Open http://localhost:8080.

## C. Put it on the internet (what the client will have)
Pick one. All take the contents of the `dist/` folder.
- **Netlify:** go to app.netlify.com/drop, drag the `dist` folder onto the page. You get a link immediately. Add a custom domain later under Domain settings.
- **Cloudflare Pages:** Workers & Pages > Create > Pages > Upload assets, upload `dist`.
- **Their own host:** upload the files in `dist/` to the web root of any static host (cPanel, S3 + CloudFront, GitHub Pages). Use HTTPS.
After any change: `npm run build` again and re-upload `dist/`.

## D. What to test
Work through `docs/ACCEPTANCE-CHECKLIST.md`. Specifically try real addresses in Hillsborough, Pinellas, Pasco and Sarasota. Expect: Hillsborough fills folio, beds, baths, heated sq ft; Sarasota fills parcel and living area; Pasco fills the parcel; Pinellas fills the parcel only and may show "approximate". If the outline lookup fails, use the rectangle option.

## E. Rebranding for a test
Edit `config.js`, run `npm run build`, reload. See HANDOFF.md.
