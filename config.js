/*
 * White-label configuration. Edit this file (or replace it before building) to rebrand the app.
 * Nothing else in the code needs to change. See HANDOFF.md.
 */
window.BRAND = {
  name: 'DuctLayout',                 // shown in the header, browser tab and proposals
  logo: '',                           // '' = text only. Or a data: URL, or a file in assets/ e.g. 'assets/logo.png'
  accent: '#3fa7ff',                  // buttons and highlights (the text on accent buttons is dark, so pick a mid or light colour)
  company: {                          // printed at the top of the customer presentation
    name: '',
    phone: '',
    email: '',
    license: '',                      // e.g. 'FL CAC1234567'
    website: '',
  },
  disclaimer: 'Preliminary sizing estimate from room area and a rule-of-thumb BTU/sqft factor, not an ACCA Manual J load calculation. Confirm with a full load calculation before final equipment selection.',
  defaults: { btuPerSqft: 30, theme: 'paper' },   // theme: 'paper' or 'blueprint'
  features: {
    sample: true,                     // "Load example home" button (an imaginary house)
    lookup: true,                     // address / county parcel lookup (needs internet access to the data servers)
    print: true,                      // Print / save PDF button in the presentation
    jobber: true,                     // Jobber panel (send notes and photos to a Jobber job)
    scan: true,                       // LiDAR room-scan import panel
    showPrices: false,                // show the estimated price in the customer presentation (turn on only after the catalog holds real prices)
  },
  // Jobber sync server (see docs/JOBBER.md). Leave proxyUrl empty to let each user type it in. Set features.jobber false to hide the panel.
  jobber: { proxyUrl: '' },
  // Map under the plan. tileUrl is a standard {z}/{x}/{y} tile URL. The default is OpenStreetMap's public street map,
  // fine for trying things out; check its tile usage policy before relying on it. For satellite imagery use a provider
  // you have an account with, for example (check each provider's current terms and URL format):
  //   Mapbox:   https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}?access_token=YOUR_TOKEN
  //   MapTiler: https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=YOUR_KEY
  // Set tileUrl to '' to turn the map off. The attribution text is shown on the plan whenever the map is.
  map: { tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '\u00a9 OpenStreetMap contributors', maxZoom: 19 },
  // Sizing table: cooling BTU per sq ft of living area by home age, scaled by how good the envelope is. These are
  // rule-of-thumb STARTING VALUES for a hot-humid climate, not ACCA Manual J data. Edit them to the company's own experience.
  sizing: {
    era: [
      { id: 'pre1980', label: 'Before 1980', from: 0, btuPerSqft: 34 },
      { id: '1980', label: '1980 to 2000', from: 1980, btuPerSqft: 30 },
      { id: '2001', label: '2001 to 2015', from: 2001, btuPerSqft: 26 },
      { id: '2016', label: '2016 or newer', from: 2016, btuPerSqft: 22 },
    ],
    envelope: [
      { id: 'poor', label: 'Poor (little insulation, old windows)', mult: 1.12 },
      { id: 'avg', label: 'Average', mult: 1.0 },
      { id: 'good', label: 'Good (well insulated, low-E windows)', mult: 0.9 },
    ],
    defaultEra: '1980', defaultEnvelope: 'avg',
  },
  // Equipment and parts catalog behind the matching and the quote list. SAMPLE generic items and SAMPLE prices: replace
  // them with real models and the company's price book. Prices are per item unless a unit (ft) is given.
  catalog: {
    condensers: [
      { id: 'c15', label: 'Condenser 1.5 ton', tons: 1.5, price: 1250 }, { id: 'c2', label: 'Condenser 2 ton', tons: 2, price: 1450 },
      { id: 'c25', label: 'Condenser 2.5 ton', tons: 2.5, price: 1700 }, { id: 'c3', label: 'Condenser 3 ton', tons: 3, price: 1950 },
      { id: 'c35', label: 'Condenser 3.5 ton', tons: 3.5, price: 2200 }, { id: 'c4', label: 'Condenser 4 ton', tons: 4, price: 2450 },
      { id: 'c5', label: 'Condenser 5 ton', tons: 5, price: 2900 },
    ],
    airHandlers: [
      { id: 'a15', label: 'Air handler 1.5 ton', tons: 1.5, price: 700 }, { id: 'a2', label: 'Air handler 2 ton', tons: 2, price: 780 },
      { id: 'a25', label: 'Air handler 2.5 ton', tons: 2.5, price: 880 }, { id: 'a3', label: 'Air handler 3 ton', tons: 3, price: 980 },
      { id: 'a35', label: 'Air handler 3.5 ton', tons: 3.5, price: 1080 }, { id: 'a4', label: 'Air handler 4 ton', tons: 4, price: 1180 },
      { id: 'a5', label: 'Air handler 5 ton', tons: 5, price: 1380 },
    ],
    heads: [
      { id: 'h9', label: 'Mini-split head 9k BTU', btu: 9000, price: 520 }, { id: 'h12', label: 'Mini-split head 12k BTU', btu: 12000, price: 600 },
      { id: 'h18', label: 'Mini-split head 18k BTU', btu: 18000, price: 780 }, { id: 'h24', label: 'Mini-split head 24k BTU', btu: 24000, price: 950 },
      { id: 'h30', label: 'Mini-split head 30k BTU', btu: 30000, price: 1150 }, { id: 'h36', label: 'Mini-split head 36k BTU', btu: 36000, price: 1350 },
    ],
    parts: {
      register: { default: 38, 4: 30, 5: 33, 6: 36, 7: 40, 8: 44, 10: 52 },
      grille: { default: 55, '20x20': 55, '24x24': 70, '20x25': 62 },
      ductPerFt: { default: 6, 4: 3.2, 5: 3.8, 6: 4.5, 7: 5.2, 8: 6, 10: 7.5, 12: 9, 14: 11 },
      plenum: { label: 'Plenum / splitter box', price: 85 }, lineSet: { label: 'Refrigerant line set (ft)', price: 7.5 },
      pad: { label: 'Equipment pad', price: 95 }, disconnect: { label: 'Electrical disconnect', price: 70 },
      drainKit: { label: 'Drain and float switch kit', price: 45 }, filterRack: { label: 'Filter rack and filter', price: 60 }, thermostat: { label: 'Thermostat', price: 85 },
    },
    labor: { rate: 85, condenser: 3, ahu: 4, head: 2.5, register: 0.5, plenum: 0.75, ductPerFt: 0.06, lineSetPerFt: 0.05 },   // rate = $/hour, others = hours each (per ft where noted)
    markupPct: 25, taxPct: 7,
  },
  storageKey: 'ductlayout.v2',        // change per brand so two installs on one domain do not share saved jobs
  poweredBy: '',                      // optional small line at the bottom of proposals, e.g. 'Software by ...'
};
