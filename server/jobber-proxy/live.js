/* LIVE Jobber calls. INCOMPLETE ON PURPOSE.
 *
 * What is known (from public Jobber integration guides, not checked against Jobber's own docs): Jobber uses OAuth 2.0
 * (authorize at https://api.getjobber.com/api/oauth/authorize, token exchange at https://api.getjobber.com/api/oauth/token) and
 * one GraphQL endpoint, https://api.getjobber.com/api/graphql, called with POST, a Bearer access token and an
 * X-JOBBER-GRAPHQL-VERSION header naming a current API version.
 *
 * What is NOT known and must be filled in by someone with a Jobber developer account (Developer Center, "Test in
 * Playground"): the GraphQL query that searches jobs, the mutation that adds a note to a job, and how a file (photo) is
 * attached to a note. Until then these two functions refuse, so nothing is guessed. Fill in findJobs and addNote, keep the
 * return shapes, and the rest of the app works unchanged. */
const NOT_DONE = 'Live Jobber access is not set up yet. Complete server/jobber-proxy/live.js (see docs/JOBBER.md).';

module.exports = {
  connected: () => false,
  // return [{ id, title, client, address, status }] for jobs matching the search text
  async findJobs(/* q */) { throw new Error(NOT_DONE); },
  // add payload.note to the job as a note, attach payload.photos[] and payload.picture, return { ok: true, noteId, attachments }
  async addNote(/* jobId, payload */) { throw new Error(NOT_DONE); },
};
