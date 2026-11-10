/* Connects push-lib to the real world: private Vercel Blob storage and the web-push sender. */
'use strict';
const lib = require('./push-lib');
let service;

async function getService() {
  if (service) return service;
  const blob = await import('@vercel/blob');
  const wp = await import('web-push'); const webpush = wp.default || wp;
  const store = {
    // Always read the latest copy (no CDN cache) and remember its ETag.
    async read() {
      let r; try { r = await blob.get(lib.STATE_PATH, { access: 'private', useCache: false }); }
      catch (e) { if (e && (e.name === 'BlobNotFoundError' || /not found/i.test(e.message || ''))) return { state: null, etag: null }; throw e; }
      if (!r || r.statusCode !== 200 || !r.stream) return { state: null, etag: null };
      let state = null; try { state = JSON.parse(await new Response(r.stream).text()); } catch (e) { state = null; }
      return { state, etag: (r.blob && r.blob.etag) || null };
    },
    // etag given: only if unchanged. no etag and allowOverwrite: replace. neither: create only (fails if it already exists).
    async write(state, etag, allowOverwrite) {
      try {
        await blob.put(lib.STATE_PATH, JSON.stringify(state), Object.assign({ access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: !!(etag || allowOverwrite), cacheControlMaxAge: 60 }, etag ? { ifMatch: etag } : {}));
        return true;
      } catch (e) {
        if (e && (e.name === 'BlobPreconditionFailedError' || /already exists|precondition/i.test(e.message || ''))) return false;
        throw e;
      }
    }
  };
  service = lib.createPush({ store, webpush });
  return service;
}

const METHODS = { config: ['GET'], status: ['GET', 'POST'], tick: ['GET', 'POST'], subscribe: ['POST'], unsubscribe: ['POST'], sync: ['POST'], test: ['POST'] };

async function run(action, req, res) {
  const cors = lib.corsHeaders(req.headers && req.headers.origin);
  Object.keys(cors).forEach(k => res.setHeader(k, cors[k]));
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
  const send = (status, json) => { res.statusCode = status; res.end(JSON.stringify(json)); };
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (!METHODS[action].includes(req.method)) return send(405, { error: 'Method not allowed' });
  try {
    const svc = await getService();
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { return send(400, { error: 'Bad request' }); } }
    const out = await svc[action]({ headers: req.headers || {}, body: body || {}, query: req.query || {} });
    return send(out.status, out.json);
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    if (status >= 500) console.error('push', action, e && e.stack || e);
    return send(status, { error: status >= 500 ? 'Something went wrong on the server' : e.message });
  }
}
module.exports = { run };
