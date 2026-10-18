# Jobber integration

**Status: the app side is built and tested against a mock. The live Jobber connection is NOT built.** Jobber's developer documentation could not be read when this was made, so the three Jobber calls (search jobs, add a note, attach a photo) were not written rather than guessed. They need someone with a Jobber developer account.

## How it fits together
```
Phone / iPad app  --HTTPS + access key-->  sync server (server/jobber-proxy)  --OAuth + GraphQL-->  Jobber
```
Jobber's secrets must never sit in a web page, so the app talks to a small server you run. The server holds the Jobber login and does the Jobber calls.

## What works today
- App: panel "Jobber" in Setup. Search jobs, link one to the design (the link is saved with the job), **Send to Jobber** sends a note (sizing, systems, equipment, measurements, photo list, notes), every photo with GPS and time, a PNG picture of existing and proposed layouts, the measurements, and the design data.
- **Copy notes** works with no server: it copies the same note text so it can be pasted into a Jobber job by hand.
- Server in **mock mode** (`ACCESS_KEY=secret MOCK=1 node server/jobber-proxy/server.js`) fakes three jobs and records what it receives (`GET /_mock/synced`). This is how the whole flow was tested (`tests/jobber.test.js`, browser test).

## What you must do to go live
1. Create an app in Jobber's Developer Center. Note the client id and secret and set the redirect address.
2. Fill in `findJobs()` and `addNote()` in `server/jobber-proxy/live.js`: the GraphQL job search query, the note-creation mutation, and the way a file is attached to a note. Use Jobber's "Test in Playground". Keep the return shapes in the comments. Add the OAuth sign-in (authorize at `https://api.getjobber.com/api/oauth/authorize`, token exchange at `https://api.getjobber.com/api/oauth/token`, one GraphQL endpoint `https://api.getjobber.com/api/graphql` with an `X-JOBBER-GRAPHQL-VERSION` header). These URLs came from public integration guides, not checked against Jobber's own documents.
3. Host the server over HTTPS (any small Node host). Set `ACCESS_KEY` (give crew members this key), `ALLOW_ORIGIN` (the app's address), `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`. Store the Jobber tokens in a database or secret store, not in a file in the repo.
4. Put the server address in `config.js` as `jobber: { proxyUrl: 'https://...' }` and rebuild. The build adds that address to the page's security policy; without it the panel only offers **Copy notes**.
5. Test with a Jobber test account first. Check how Jobber displays a note with several attachments, and its file size limits (the server accepts 40 MB per request; photos are already reduced to 1600 px).

## Limits
- One shared access key, not per-user accounts. Fine for a small crew; add real sign-in before wider use.
- Sending twice adds a second note; there is no de-duplication.
- Hide the panel with `features.jobber: false`.
