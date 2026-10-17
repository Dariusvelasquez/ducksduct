# White-label HVAC layout designer

Static web app: draw duct layouts over a building plan, compare condenser output to room size, and present before/after to customers. See **HANDOFF.md** to deploy and rebrand, `docs/` for the acceptance checklist and agreement outline.

Quick start: `npm test`, `npm run build`, `npm run serve`.

---

# DuctLayout

Browser-based HVAC duct layout and sizing tool. Open `index.html` (no build step, no dependencies).

- Address lookup: geocoding (Nominatim) and building outline (OpenStreetMap/Overpass). Parcel/folio via a Regrid API token, or type it in.
- HVAC-only blueprint: building outline, room zones, condenser, air handler, outlets, intakes, splitters, mini-split heads, supply/return/refrigerant lines. All equipment is draggable; outlets and intakes are labeled.
- Current AC model number is parsed for nominal tonnage (verify on the nameplate).
- Per-room need vs. delivered BTU/CFM, duct sizing, tons and sq ft per ton, for Existing and Proposed scenarios.
- Customer presentation view (side by side, printable).

Estimates use an area-based BTU/sqft rule of thumb, not Manual J.

Paper (default, hand-drawn-sketch style) and blueprint themes; No A/C rooms, removed walls, flex duct, duct diameter overrides, grille sizes, scuttle and note markers.

## Parcel data (Tampa Bay)
No API key needed for these counties; the lookup queries public property-appraiser GIS services straight from the browser:
- Hillsborough: folio #, beds, baths, stories, heated sq ft, year built (HC_ParcelsPublic).
- Sarasota: parcel ID, living area, year built (2023 vintage layer).
- Pasco (incl. New Port Richey): parcel ID matched by house number from the Pasco PA layer; no living area published.
- Pinellas (incl. Dunedin) and anywhere else in Florida: parcel ID only (Florida DOR statewide parcels). When the geocoded point misses the lot, the nearest parcel is chosen and flagged "approximate".
Regrid token remains an optional fallback for other states.

## Tracing and cross-check
- Upload a floor-plan image (listing floor plan screenshot, photo of a sketch), set the scale on a wall of known length, then trace rooms and walls with the Draw room / Draw wall tools. The image is held in memory only.
- Cross-check: type the listing's sq ft / beds / baths (Zillow and Realtor.com links open the address; there is no public Zillow API and scraping it violates their terms) and compare against the county record and the drawn rooms. "Scale" resizes the drawing to a chosen source.

## Example job
The "Demo job (from sketch)" button (demo builds only, from `private/`) loads a real layout recreated from a hand sketch (After scenario). Scale assumed (~27 ft wide) from the OpenStreetMap building outline; Existing is a placeholder (same layout, 3 ton). Verify against the listing sq ft with Cross-check > Scale.
