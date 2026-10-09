import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PortalWorkspace, MAX_UPLOAD_BYTES } from './workspace.mjs';
import { csvCell } from './rows.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const allStatuses = new Set([
  'MATCHED',
  'MISSING_INTERNAL',
  'MISSING_PARTNER',
  'AMOUNT_MISMATCH',
  'FEE_MISMATCH',
  'STATUS_MISMATCH',
  'TYPE_MISMATCH',
  'CURRENCY_MISMATCH',
  'FIELD_MISMATCH',
  'PENDING_RECHECK',
  'MANUAL_REVIEW',
]);
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON request.');
  }
}
function filter(url) {
  const status = url.searchParams.get('status') || 'ALL';
  const search = url.searchParams.get('search') || '';
  if (status !== 'ALL' && status !== 'NON_MATCHED' && !allStatuses.has(status))
    throw new Error('Unknown result status.');
  if (search.length > 200) throw new Error('Search must be at most 200 characters.');
  let where = "kind='entry'";
  const params = [];
  if (status === 'NON_MATCHED') where += " AND status!='MATCHED'";
  else if (status !== 'ALL') {
    where += ' AND EXISTS(SELECT 1 FROM statuses s WHERE s.seq=events.seq AND s.status=?)';
    params.push(status);
  }
  if (search) {
    where += " AND payload LIKE ? ESCAPE '\\'";
    params.push(
      `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`,
    );
  }
  return { where, params, status, search };
}
async function write(res, chunk) {
  if (res.destroyed) throw new Error('Download closed.');
  if (!res.write(chunk))
    await new Promise((done, reject) => {
      const cleanup = () => {
        res.off('drain', drain);
        res.off('close', closed);
        res.off('error', failed);
      };
      const drain = () => {
        cleanup();
        done();
      };
      const closed = () => {
        cleanup();
        reject(new Error('Download closed.'));
      };
      const failed = (error) => {
        cleanup();
        reject(error);
      };
      res.once('drain', drain);
      res.once('close', closed);
      res.once('error', failed);
    });
}

export async function createPortal(options = {}) {
  const workspace = await new PortalWorkspace(options).init();
  const timer = setInterval(
    () => workspace.expire().catch((error) => workspace.log(`[portal] cleanup: ${error.message}`)),
    60_000,
  );
  timer.unref();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (path.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (
          req.headers['sec-fetch-site'] === 'cross-site' ||
          (origin &&
            (options.publicOrigin
              ? origin !== options.publicOrigin
              : new URL(origin).host !== req.headers.host))
        )
          throw Object.assign(new Error('Cross-origin requests are not allowed.'), { status: 403 });
        if (path === '/api/health' && req.method === 'GET') {
          json(res, 200, { ok: true, package: '@qpv-systems/core-reconcile', version: '0.1.0' });
          return;
        }
        const cookieId = req.headers.cookie
          ?.split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('portal_session='))
          ?.slice(15);
        const session = await workspace.session(cookieId);
        if (session.id !== cookieId)
          res.setHeader(
            'Set-Cookie',
            `portal_session=${session.id}; HttpOnly; SameSite=Strict; Path=/${options.secureCookies ? '; Secure' : ''}`,
          );
        if (path === '/api/session' && req.method === 'GET') {
          json(res, 200, {
            maxUploadBytes: workspace.maxUploadBytes,
            maxRows: workspace.maxRows,
            retentionMinutes: 30,
            sources: Array.from(session.sources.values(), (s) => workspace.publicSource(s)),
            jobs: Array.from(session.jobs.values(), (j) => workspace.publicJob(j)),
          });
          return;
        }
        if (path === '/api/session' && req.method === 'DELETE') {
          await workspace.clear(session);
          res.setHeader(
            'Set-Cookie',
            'portal_session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/',
          );
          json(res, 200, { cleared: true });
          return;
        }
        if (path === '/api/sources' && req.method === 'POST') {
          json(
            res,
            201,
            await workspace.upload(session, req, Object.fromEntries(url.searchParams)),
          );
          return;
        }
        if (path === '/api/runs' && req.method === 'POST') {
          json(res, 202, workspace.publicJob(workspace.start(session, await bodyJson(req))));
          return;
        }
        const match = /^\/api\/runs\/([a-zA-Z0-9-]{1,64})(?:\/(results|export|cancel))?$/.exec(
          path,
        );
        if (match) {
          const job = workspace.job(session, match[1]);
          const action = match[2];
          if (!action && req.method === 'GET') {
            json(res, 200, workspace.publicJob(job));
            return;
          }
          if (action === 'cancel' && req.method === 'POST') {
            if (['staging', 'running'].includes(job.state))
              job.controller.abort(new Error('Cancelled by user.'));
            json(res, 202, workspace.publicJob(job));
            return;
          }
          if (req.method === 'GET' && ['results', 'export'].includes(action)) {
            const { where, params, status, search } = filter(url);
            const db = workspace.openResults(job);
            try {
              if (action === 'results') {
                const offset = Number(url.searchParams.get('offset') ?? 0);
                const limit = Number(url.searchParams.get('limit') ?? 20);
                if (
                  !Number.isSafeInteger(offset) ||
                  offset < 0 ||
                  offset > 4_000_000 ||
                  !Number.isSafeInteger(limit) ||
                  limit < 1 ||
                  limit > 50
                )
                  throw new Error('Invalid page bounds.');
                const total = db
                  .prepare(`SELECT count(*) AS total FROM events WHERE ${where}`)
                  .get(...params).total;
                const rows = db
                  .prepare(
                    `SELECT seq,payload FROM events WHERE ${where} ORDER BY seq LIMIT ? OFFSET ?`,
                  )
                  .all(...params, limit, offset)
                  .map((r) => ({ seq: r.seq, event: JSON.parse(r.payload) }));
                json(res, 200, { total, offset, limit, rows });
                return;
              }
              const format = url.searchParams.get('format') ?? 'ndjson';
              if (!['ndjson', 'csv', 'json'].includes(format))
                throw new Error('Choose CSV, JSON or NDJSON.');
              const metadata = {
                batchId: job.batchId,
                runId: job.id,
                ruleVersion: job.ruleVersion,
                rules: job.input.rules,
                processedAt: job.processedAt,
                sources: job.sources,
                completeness: { left: job.input.leftComplete, right: job.input.rightComplete },
                summary: job.summary,
                filter: { status, search },
                complete: true,
              };
              res.writeHead(200, {
                'Content-Type':
                  format === 'csv'
                    ? mime['.csv']
                    : format === 'json'
                      ? mime['.json']
                      : 'application/x-ndjson; charset=utf-8',
                'Content-Disposition': `attachment; filename="reconciliation-${job.id}.${format}"`,
                'Cache-Control': 'no-store',
              });
              if (format === 'json')
                await write(res, JSON.stringify(metadata).slice(0, -1) + ',"entries":[');
              if (format === 'csv')
                await write(
                  res,
                  '\uFEFF' +
                    [
                      'status',
                      'statuses',
                      'result_key',
                      'left_id',
                      'left_line',
                      'right_id',
                      'right_line',
                      'matched_by',
                      'issues',
                      'left_data',
                      'right_data',
                    ]
                      .map(csvCell)
                      .join(',') +
                    '\r\n',
                );
              // NDJSON contains the unmodified core events, followed by core's completion event.
              const query = format === 'ndjson' ? `(${where}) OR kind!='entry'` : where;
              let first = true;
              for (const record of db
                .prepare(`SELECT payload FROM events WHERE ${query} ORDER BY seq`)
                .iterate(...params)) {
                const event = JSON.parse(record.payload);
                if (format === 'ndjson') await write(res, record.payload + '\n');
                else if (format === 'json') {
                  await write(res, (first ? '' : ',') + JSON.stringify(event.entry));
                  first = false;
                } else {
                  const e = event.entry;
                  await write(
                    res,
                    [
                      e.status,
                      e.statuses.join(';'),
                      e.resultKey,
                      e.internal?.id,
                      e.internal?.line,
                      e.partner?.id,
                      e.partner?.line,
                      e.matchedBy.join(';'),
                      JSON.stringify(e.issues),
                      JSON.stringify(e.internal?.data ?? null),
                      JSON.stringify(e.partner?.data ?? null),
                    ]
                      .map(csvCell)
                      .join(',') + '\r\n',
                  );
                }
              }
              if (format === 'json') await write(res, ']}');
              res.end();
              return;
            } finally {
              db.close();
            }
          }
        }
        throw Object.assign(new Error('API route not found.'), { status: 404 });
      }
      if (!['GET', 'HEAD'].includes(req.method))
        throw Object.assign(new Error('Method not allowed.'), { status: 405 });
      const asset =
        path === '/'
          ? 'public/index.html'
          : ['/app.mjs', '/styles.css'].includes(path)
            ? `public${path}`
            : /^\/samples\/(catalog\.json|(?:bank|commission|orders|inventory|invoices|payroll)-(?:left|right)\.(?:csv|xlsx))$/.test(
                  path,
                )
              ? `public${path}`
              : undefined;
      if (!asset) throw Object.assign(new Error('Not found.'), { status: 404 });
      const file = join(root, asset);
      const info = await stat(file);
      res.writeHead(200, {
        'Content-Type': mime[extname(file)],
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') res.end();
      else {
        const stream = createReadStream(file);
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      }
    } catch (error) {
      if (error.status === 413 && !req.complete) {
        // Drain without buffering so closing a socket with unread data does not
        // reset the connection before the client receives the error response.
        const drainTimeout = setTimeout(() => req.destroy(), 5_000);
        drainTimeout.unref();
        const clearDrainTimeout = () => clearTimeout(drainTimeout);
        req.once('end', clearDrainTimeout);
        req.once('close', clearDrainTimeout);
        req.resume();
      }
      if (!res.headersSent && !res.destroyed)
        json(res, error.status ?? 400, { error: error.message });
      else if (!res.destroyed) res.destroy();
    }
  });
  server.requestTimeout = 10 * 60_000;
  return {
    server,
    workspace,
    async close() {
      clearInterval(timer);
      server.closeAllConnections();
      await new Promise((done, reject) =>
        server.close((error) =>
          error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : done(),
        ),
      );
      await workspace.close();
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const number = (name, fallback) => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} must be a positive integer.`);
    return value;
  };
  const portal = await createPortal({
    maxUploadBytes: number('MAX_UPLOAD_BYTES', MAX_UPLOAD_BYTES),
    maxRows: number('MAX_ROWS', 2_000_000),
    maxJobBytes: number('MAX_JOB_BYTES', 1024 * 1024 * 1024),
    publicOrigin: process.env.PUBLIC_ORIGIN,
    secureCookies: process.env.COOKIE_SECURE === '1',
  });
  portal.server.listen(number('PORT', 4173), process.env.HOST ?? '127.0.0.1', () =>
    console.log(
      `Reconciliation Portal: http://${process.env.HOST ?? '127.0.0.1'}:${portal.server.address().port}`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      portal
        .close()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error.message);
          process.exit(1);
        });
    });
}
