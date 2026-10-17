# Handoff agreement: points to settle

This is a checklist of topics, not legal advice. Have a lawyer draft and review the actual agreement.

1. **Assignment or licence.** Assignment (buyer owns the code outright) or a licence (you keep ownership). Say whether you may reuse the generic code for other customers. An exclusive assignment should cost materially more than a non-exclusive licence.
2. **Scope.** The delivered source, the build output, the docs in this repo, and nothing else. List any open-source or third-party components.
3. **Payment.** For example 50% at signing, 50% at acceptance (see `ACCEPTANCE-CHECKLIST.md`). Define when the work counts as accepted and what happens if the buyer does not respond.
4. **Warranty and support.** A fixed bug-fix period (for example 30 to 60 days) for defects against the checklist. After that, an hourly rate or a monthly retainer. Define response times.
5. **No warranty on engineering results.** The tool produces preliminary estimates, not a Manual J. The buyer is responsible for engineering judgment, permits and code compliance. Add a limit on liability, and a note that the buyer should confirm its own insurance (errors and omissions) covers use of the tool.
6. **Third-party data.** Parcel, geocoding and map data come from public sources under their own terms and can change. The buyer is responsible for complying with those terms and for any paid services it adds. Credit OpenStreetMap.
7. **Customer data.** Jobs are stored in each user's browser. If the buyer adds accounts or a database later, they own privacy and security for that data.
8. **Confidentiality, and what is not included.** No real customer addresses or job data in the delivered source. Confirm this before handing over, and deliver the export zip (`npm run export`), never the git repository, since git history can contain earlier data.
9. **Name and branding.** The buyer rebrands freely; you keep no brand rights.
10. **Governing law, termination, and who signs.**
