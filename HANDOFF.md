# Handoff guide

A static web app (HTML, CSS, JavaScript). No server, database or build dependencies. Node 18+ is only needed to run the build, the tests and the preview server.

## 1. Deploy in 10 minutes
```
npm run build        # writes dist/
npm run serve        # preview at http://localhost:8080
```
Upload the contents of `dist/` to any static host: Netlify or Cloudflare Pages (drag and drop the folder), AWS S3 + CloudFront, GitHub Pages, or the company's existing web host. Use HTTPS. Put it on a subdomain such as `design.yourcompany.com`.

`npm run build:single` also writes `dist/index.single.html`, one self-contained file that can be emailed or opened from a USB stick.

## 2. Rebrand (no code changes)
Edit `config.js`: name, logo (`assets/logo.png` or a data URL), accent colour, company name / phone / email / licence number, proposal disclaimer, default BTU per sq ft, which buttons show. To keep a separate branding file: `node tools/build.js --config=my-brand.js`.
Change `storageKey` per brand so two installs on one domain never share saved jobs.

## 3. How it works
| File | Role |
|---|---|
| `index.html`, `style.css` | Layout and styling |
| `app.js` | Drawing, drag-and-drop, tracing, auto layout, presentation, UI |
| `hvac.js` | Calculation engine (pure functions, unit tested) |
| `lookup.js` | Address, building outline and parcel lookups |
| `config.js` | White-label settings |
| `tools/` | build, preview server, export |

Saved jobs live in the user's browser (`localStorage`). They are not shared between people or devices. Uploaded floor-plan images are kept in memory only.

## 4. Outside data the app depends on
| Source | Used for | Notes |
|---|---|---|
| OpenStreetMap Nominatim | Address to coordinates | Public server. Read its usage policy before commercial use. For real volume, switch `geocode()` in `lookup.js` to a paid geocoder. |
| OpenStreetMap Overpass | Building outline | Public servers, sometimes slow or unavailable. Manual rectangle entry is the fallback. Credit OpenStreetMap contributors. |
| Hillsborough PA, Sarasota (2023 layer), Pasco PA, Florida DOR statewide parcels | Parcel / folio, and for Hillsborough and Sarasota living area | Public ArcGIS endpoints. They can change or move without notice. The URLs are constants at the top of the parcel section of `lookup.js`. Pinellas has no queryable layer, so it gets the parcel ID only. |
| Regrid (optional) | Parcels outside these counties | User supplies their own token, stored in their browser. |

The build adds a Content-Security-Policy that allows the app to contact only these hosts. If you add a data source, add its host to the `connect` list in `tools/build.js`.

## 5. What the numbers are, and are not
- Room load = area x BTU per sq ft (default 30), scaled for ceiling height and sun exposure. **This is a presentation estimate, not an ACCA Manual J.** Do not size equipment from it alone.
- Airflow is 400 CFM per ton, split across outlets by damper weight. Duct diameter uses a fixed 700 fpm velocity, not Manual D friction-rate design.
- Model-number tonnage is read by a pattern match and can be wrong. Verify on the nameplate.
- Parcel data is a convenience. Verify folio numbers on the property appraiser's site.
The default disclaimer says this on every proposal. Keep wording at least this strong.

## 6. Tests
`npm test` runs the calculation tests. Before each release also click through `docs/ACCEPTANCE-CHECKLIST.md`.

## 7. Suggested next steps
1. Real Manual J engine (or integration with the company's current load software).
2. Accounts and cloud-saved jobs, shareable customer links.
3. Equipment catalogue with AHRI-matched models and good / better / best pricing.
4. Server-side PDF proposals with signature.
5. PDF floor-plan input, non-rectangular rooms, tablet polish.
6. Paid geocoder behind a small proxy.
