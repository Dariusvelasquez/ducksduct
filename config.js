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
  storageKey: 'ductlayout.v2',        // change per brand so two installs on one domain do not share saved jobs
  poweredBy: '',                      // optional small line at the bottom of proposals, e.g. 'Software by ...'
};
