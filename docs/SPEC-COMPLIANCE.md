# Compliance with the client's written spec

| Requirement | Status | Notes |
|---|---|---|
| Phone app, field use | Built | Installable web app (PWA), works offline once opened. Android Chrome: Install app. iPad/iPhone Safari: Share > Add to Home Screen. Large touch targets, pinch zoom, bottom tabs on phones. |
| Android first, iPad | Built, not tested on real devices | Tested in desktop Chromium emulation and offline mode only. Test on the crew's actual phones and iPad. |
| Address to parcel | Built | Hillsborough, Sarasota, Pasco, statewide FDOR. Pinellas gives parcel ID only. Regrid optional with the user's own token. |
| Building footprint, GeoJSON | Built | OpenStreetMap footprint; estimate from record sq ft when absent (flagged as an estimate). Export GeoJSON of building, rooms, equipment. Microsoft footprints are not used. |
| Footprint sq ft | Built | Shown and used as one of the sizing bases. Multi-story homes: the plan draws one floor. |
| Map base | Built | Standard tile URL in `config.js` (default OpenStreetMap, for trying only; use a provider with proper terms for production). Plain SVG overlay, not Mapbox GL / MapLibre. |
| Canvas: drag and drop components | Built | Condenser, air handler, outlets, intakes, splitters, mini-split heads, scuttles, notes. |
| Draw / reroute ducts, bends | Built | Bend points on ducts, flex, rotate, duplicate, undo/redo. |
| Swap sizes | Built | Tonnage, duct diameters, catalog matching. |
| Annotations | Built | Notes, photo pins. |
| Sizing lookup table | Built | Home age x insulation, tonnage suggestion. Table values are rules of thumb: replace with the company's own. |
| Equipment matching, live parts list and quote | Built with placeholder data | The catalog and prices are samples. Load the company's catalog and prices in `config.js`. Not a Manual J. |
| Field capture: photos, GPS, timestamp | Built | EXIF or device GPS; stored on the device. |
| Manual tape measurements | Built | |
| Share / screenshot | Built | PNG with plans, summaries, disclaimer; Web Share on phones. |
| Jobber | App side built, live connection NOT built | See `docs/JOBBER.md`. Copy notes works today. |
| Optional LiDAR (RoomPlan) | File import built, scanner app NOT built | See `docs/ROOMPLAN.md`. |
| Customer before/after | Built | Presentation view. |

Known gaps: no accounts or cloud sync (jobs live on the device; export files to move them), multi-story, sample prices, public map and lookup servers with their own usage terms.
