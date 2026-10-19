# Handoff guide

A static web app (HTML, CSS, JavaScript). No server, database or build dependencies. Node.js is needed only on a developer's computer, to run the build, the tests and the preview server. The deployed site is plain static files and runs no Node at all.

**Node version:** use **Node 24 (current LTS)**, or Node 22 at minimum. Node 18 and 20 are end of life and no longer get security fixes, and Node 22 leaves maintenance in April 2027. This project was tested on Node 22 and Node 24 and has no npm dependencies, so a newer LTS should also work. Check nodejs.org/en/about/previous-releases for the current schedule before installing.

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
| `layout.js` | Starting floor plan: a split-bedroom ranch scaled to the footprint (pure functions, unit tested). Edit the `BASE` and `OUTLINE` tables to change the default house. |
| `lookup.js` | Address, building outline and parcel lookups |
| `geo.js`, `sizing.js`, `exif.js`, `media.js`, `detect.js` | Map maths, sizing table / catalog / quote, photo GPS reader, photo storage (IndexedDB), floor-plan image detection |
| `jobber.js`, `roomplan.js` | Jobber sync client, LiDAR scan import (see `docs/JOBBER.md`, `docs/ROOMPLAN.md`) |
| `server/jobber-proxy/` | Optional sync server (mock works, live part to be completed) |
| `sw.js`, `manifest.webmanifest`, `assets/` | Installable app and offline support (generated into `dist/` by the build) |
| `config.js` | White-label settings |
| `tools/` | build, preview server, export |

### Saving work
- **Autosave:** the job being worked on is saved continuously in the browser (`localStorage`) and restored on reload. The floor-plan image is not part of autosave.
- **Jobs list:** Save keeps a named job (including its floor-plan image when it fits), Save as new makes a separate copy for revisions, and jobs can be reopened, copied and deleted.
- **Export / Import file:** downloads a `.ductjob.json` file containing the whole job and image. Use it as a backup or to move a job to another computer.
- **Protection:** replacing the current work (example, blank plan, open, import) asks first if it has unsaved changes.
- **Limits:** jobs are stored per browser and per computer, are never shared between people, and are lost if browser data is cleared. Browsers allow roughly 5 MB, so large images may not fit in the jobs list (Export always works). Changing `storageKey` in `config.js` hides jobs saved under the old key. For shared, cloud-saved jobs the app needs a backend with accounts (see section 7).

## 4. Outside data the app depends on
| Source | Used for | Notes |
|---|---|---|
| OpenStreetMap Nominatim | Address to coordinates | Public server. Read its usage policy before commercial use. For real volume, switch `geocode()` in `lookup.js` to a paid geocoder. |
| OpenStreetMap Overpass | Building outline | Public servers, sometimes slow or unavailable. Manual rectangle entry is the fallback. Credit OpenStreetMap contributors. |
| Hillsborough PA, Sarasota (2023 layer), Pasco PA, Florida DOR statewide parcels | Parcel / folio, and for Hillsborough and Sarasota living area | Public ArcGIS endpoints. They can change or move without notice. The URLs are constants at the top of the parcel section of `lookup.js`. Pinellas has no queryable layer, so it gets the parcel ID only. |
| Regrid (optional) | Parcels outside these counties | User supplies their own token, stored in their browser. |

The build adds a Content-Security-Policy that allows the app to contact only these hosts. If you add a data source, add its host to the `connect` list in `tools/build.js`.

**About the starting floor plan.** "Load example home", the rectangle option, "Build from sq ft" and the lookup fallback all place rooms with `layout.js`. It follows the common split-bedroom pattern (master suite at one end, secondary bedrooms and hall bath at the other, great room, kitchen and dining between, kitchen, laundry and baths sharing plumbing walls) with typical room sizes. It is a starting point to edit with the Edit rooms tool, not a survey of the real house. A real building outline from a lookup is kept as the outline, but the rooms are still the template scaled into its bounding box.

**Map tiles.** `config.js` `map.tileUrl` is the picture source under the plan. The default is OpenStreetMap's public map, which has a usage policy and is meant for light use. For production use a provider you have an account with (Mapbox, MapTiler, Esri World Imagery, and so on), check its terms for caching and for saving images, and set `map.attribution`. The picture export needs the provider to allow cross-origin image requests.

**Phones and offline.** The build writes a service worker. On https (or localhost) the app installs to the home screen and the app and any map tiles already viewed work with no signal. Saved jobs and photos live on the device. Lookups need signal. Updating: deploy a new build; the app picks it up the next time it is opened with a connection.

**Sizing and prices.** The sizing table, catalog and prices in `config.js` are samples. Replace them with the company's before use, then turn on `features.showPrices` if prices should appear in the customer presentation.

**Not built.** Live Jobber connection, the LiDAR scanning app, accounts and cloud sync, multi-story plans. See `docs/SPEC-COMPLIANCE.md`.

## 5. What the numbers are, and are not
- Room load = area x BTU per sq ft (default 30), scaled for ceiling height and sun exposure. **This is a presentation estimate, not an ACCA Manual J.** Do not size equipment from it alone.
- Airflow is 400 CFM per ton, split across outlets by damper weight. Duct diameter uses a fixed 700 fpm velocity, not Manual D friction-rate design.
- Model-number tonnage is read by a pattern match and can be wrong. Verify on the nameplate.
- Parcel data is a convenience. Verify folio numbers on the property appraiser's site.
The default disclaimer says this on every proposal. Keep wording at least this strong.

## 6. Tests
`npm test` runs the unit tests (calculation, layout, detection, map, sizing, photo GPS, Jobber client and mock server, scan import). Before each release also click through `docs/ACCEPTANCE-CHECKLIST.md`.

## 7. Suggested next steps
1. Real Manual J engine (or integration with the company's current load software).
2. Accounts and cloud-saved jobs, shareable customer links.
3. Equipment catalogue with AHRI-matched models and good / better / best pricing.
4. Server-side PDF proposals with signature.
5. PDF floor-plan input, non-rectangular rooms, tablet polish.
6. Paid geocoder behind a small proxy.
