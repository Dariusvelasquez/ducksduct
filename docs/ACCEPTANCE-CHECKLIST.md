# Acceptance checklist

Run on the deployed URL, on a laptop and on a tablet. Tick each item; note the date and who tested.

- [ ] Header shows the company name and logo; accent colour correct; browser tab title correct.
- [ ] "Sample home" loads a plan with equipment, ducts and a results table.
- [ ] Drag the condenser, air handler, an outlet and an intake; ducts follow; results update.
- [ ] Connect a new outlet with the Supply duct tool; airflow and duct size appear. Delete it with Del.
- [ ] Add a splitter between the air handler and two outlets; airflow splits.
- [ ] Untick A/C on a room; it hatches "NO A/C" and drops out of required load.
- [ ] Look up a Hillsborough address: folio, beds, baths and heated sq ft fill in. Repeat for a Sarasota, a Pasco and a Pinellas address (Pinellas: parcel ID only).
- [ ] Lookup failure shows a readable message. When the map server is down, the parcel still fills, a rectangle is estimated from the record sq ft (Hillsborough, Sarasota), or the sq-ft form opens (Pasco, Pinellas). "Build from sq ft" works.
- [ ] Click a wall to select it; Delete (key or button) removes it. The walls table updates.
- [ ] Upload a floor-plan image, set the scale on a known wall, draw a room and a wall over it.
- [ ] Enter a listing sq ft in Cross-check; the difference is flagged; Scale resizes the drawing.
- [ ] Existing vs Proposed tabs hold separate layouts; "Copy existing to proposed" works.
- [ ] Customer presentation shows company contact line, both plans, the room table, and the disclaimer. Print / save PDF produces a clean page.
- [ ] Reload the page: the job is still there. Clear browser data: the app still starts.
- [ ] Save a job; Blank plan; Open it again: rooms, equipment, ducts and floor-plan image are back.
- [ ] Edit after opening: the label shows "unsaved changes". Press Load example home: it asks before replacing. Cancel keeps the work.
- [ ] Save as new makes a second job; Copy and Delete (with confirmation) work.
- [ ] Export file, Blank plan, Import file: the job is restored. Importing a random .json file is rejected without changing the work.
- [ ] `npm test` passes.

Accepted by: ______________________  Date: ____________
