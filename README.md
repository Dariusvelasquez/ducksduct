# DuctLayout

Browser-based HVAC duct layout and sizing tool. Open `index.html` (no build step, no dependencies).

- Address lookup: geocoding (Nominatim) and building outline (OpenStreetMap/Overpass). Parcel/folio via a Regrid API token, or type it in.
- HVAC-only blueprint: building outline, room zones, condenser, air handler, outlets, intakes, splitters, mini-split heads, supply/return/refrigerant lines. All equipment is draggable; outlets and intakes are labeled.
- Current AC model number is parsed for nominal tonnage (verify on the nameplate).
- Per-room need vs. delivered BTU/CFM, duct sizing, tons and sq ft per ton, for Existing and Proposed scenarios.
- Customer presentation view (side by side, printable).

Estimates use an area-based BTU/sqft rule of thumb, not Manual J.
