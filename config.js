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
  },
  // Map under the plan. tileUrl is a standard {z}/{x}/{y} tile URL. The default is OpenStreetMap's public street map,
  // fine for trying things out; check its tile usage policy before relying on it. For satellite imagery use a provider
  // you have an account with, for example (check each provider's current terms and URL format):
  //   Mapbox:   https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}?access_token=YOUR_TOKEN
  //   MapTiler: https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=YOUR_KEY
  // Set tileUrl to '' to turn the map off. The attribution text is shown on the plan whenever the map is.
  map: { tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '\u00a9 OpenStreetMap contributors', maxZoom: 19 },
  storageKey: 'ductlayout.v2',        // change per brand so two installs on one domain do not share saved jobs
  poweredBy: '',                      // optional small line at the bottom of proposals, e.g. 'Software by ...'
};
