import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { setImmediate as yieldLoop } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { createSortKey, reconcileSorted } from '@qpv-systems/core-reconcile';
import { sourceRows } from './rows.mjs';
import { makeRules } from './rules.mjs';

export const MAX_UPLOAD_BYTES = 3_000_000;

export class PortalWorkspace {
  constructor({
    maxUploadBytes = MAX_UPLOAD_BYTES,
    maxRows = 2_000_000,
    maxJobBytes = 1024 * 1024 * 1024,
    log = console.log,
  } = {}) {
    if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1)
      throw new Error('maxUploadBytes must be a positive safe integer.');
    this.maxUploadBytes = Math.min(maxUploadBytes, MAX_UPLOAD_BYTES);
    this.maxRows = maxRows;
    this.maxJobBytes = maxJobBytes;
    this.log = log;
    this.sessions = new Map();
    this.activeJob = undefined;
    this.uploads = 0;
  }
  async init() {
    this.parent = resolve(tmpdir());
    this.root = await mkdtemp(join(this.parent, 'reconciliation-portal-'));
    return this;
  }
  async session(id) {
    let session = this.sessions.get(id);
    if (!session) {
      if (this.sessions.size >= 8)
        throw Object.assign(
          new Error('The playground is busy. Try again after a session expires.'),
          { status: 503 },
        );
      id = randomUUID();
      const folder = join(this.root, id);
      await mkdir(folder);
      session = {
        id,
        folder,
        sources: new Map(),
        jobs: new Map(),
        uploading: 0,
        touched: Date.now(),
      };
      this.sessions.set(id, session);
    }
    session.touched = Date.now();
    return session;
  }
  source(session, id) {
    const source = session.sources.get(id);
    if (!source)
      throw Object.assign(new Error('Source not found in your session. Upload it again.'), {
        status: 404,
      });
    return source;
  }
  job(session, id) {
    const job = session.jobs.get(id);
    if (!job) throw Object.assign(new Error('Run not found in your session.'), { status: 404 });
    return job;
  }
  async upload(session, request, options) {
    const name = String(options.name ?? '');
    const format = name.toLowerCase().endsWith('.xlsx')
      ? 'xlsx'
      : name.toLowerCase().endsWith('.csv')
        ? 'csv'
        : undefined;
    if (!format) throw new Error('Upload a .csv or .xlsx file. Legacy .xls is unsupported.');
    if (name.length > 200 || !['left', 'right'].includes(options.side))
      throw new Error('Invalid file name or source side.');
    if (session.uploading >= 2 || this.uploads >= 2)
      throw Object.assign(
        new Error('Upload limit reached. Clear this session or wait for the active upload.'),
        { status: 429 },
      );
    const headerRow = Number(options.headerRow ?? 1);
    if (!Number.isSafeInteger(headerRow) || headerRow < 1 || headerRow > 1000)
      throw new Error('Header row must be between 1 and 1000.');
    const delimiter = options.delimiter ?? ',';
    if (![',', ';', '\t', '|'].includes(delimiter)) throw new Error('Unsupported CSV delimiter.');
    const suppliedSheet = options.sheet ?? '1';
    const sheet = /^\d+$/.test(suppliedSheet) ? Number(suppliedSheet) : suppliedSheet;
    if ((typeof sheet === 'number' && (sheet < 1 || sheet > 128)) || suppliedSheet.length > 100)
      throw new Error('Invalid Excel sheet name or index.');
    const declaredSize = Number(request.headers['content-length'] ?? 0);
    const sizeError = () =>
      Object.assign(
        new Error(
          `File exceeds the ${this.maxUploadBytes.toLocaleString('en-US')} byte upload limit (maximum 3 MB per file).`,
        ),
        { status: 413 },
      );
    if (declaredSize > this.maxUploadBytes) throw sizeError();
    const id = randomUUID();
    const path = join(session.folder, `${id}.${format}`);
    const hash = createHash('sha256');
    let size = 0;
    const counter = new Transform({
      transform: (chunk, _encoding, callback) => {
        size += chunk.length;
        if (size > this.maxUploadBytes) {
          callback(sizeError());
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    session.uploading++;
    this.uploads++;
    const forwardError = (error) => counter.destroy(error);
    request.on('error', forwardError);
    request.once('close', () => request.off('error', forwardError));
    try {
      // Keep the HTTP request outside pipeline so an oversize stream can receive HTTP 413.
      request.pipe(counter);
      await pipeline(counter, createWriteStream(path, { flags: 'wx' }));
      if (!size) throw new Error('File is empty.');
      const digest = hash.digest('hex');
      const source = {
        id,
        path,
        name,
        format,
        size,
        digest,
        sourceId: `${options.side}:${digest}:${format}:sheet-${sheet}:header-${headerRow}:delimiter-${JSON.stringify(delimiter)}`,
        sheet,
        headerRow,
        delimiter,
        tempDirectory: session.folder,
        maxUploadBytes: this.maxUploadBytes,
      };
      const previous = Array.from(session.sources.values()).find(
        (item) => item.sourceId === source.sourceId,
      );
      if (previous) {
        await rm(path, { force: true });
        this.log(`[portal] duplicate upload reused immutable source ${previous.id}`);
        return this.publicSource(previous);
      }
      if (session.sources.size >= 8)
        throw Object.assign(
          new Error(
            'Eight source snapshots are already stored. Clear this session to upload new data.',
          ),
          { status: 429 },
        );
      const preview = [];
      for await (const row of sourceRows(source, undefined, (columns) => {
        source.columns = columns;
      })) {
        preview.push(row);
        if (preview.length === 5) break;
      }
      if (!source.columns) throw new Error('No column headers found.');
      source.preview = preview;
      session.sources.set(id, source);
      this.log(
        `[portal] uploaded ${options.side} ${size} bytes (${format}), session=${session.id}`,
      );
      return this.publicSource(source);
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    } finally {
      request.unpipe(counter);
      if (!request.complete) request.resume();
      session.uploading--;
      this.uploads--;
      session.touched = Date.now();
    }
  }
  publicSource(source) {
    const { id, name, format, size, digest, sourceId, columns, preview } = source;
    return { id, name, format, size, digest, sourceId, columns, preview, previewOnly: true };
  }
  start(session, body) {
    if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(body.requestId))
      throw new Error('Provide a requestId for safe submission retries.');
    const previous = session.jobs.get(body.requestId);
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw Object.assign(new Error('requestId was already used with different inputs.'), {
          status: 409,
        });
      return previous;
    }
    if (this.activeJob)
      throw Object.assign(
        new Error('One reconciliation is already running. Wait for it to finish.'),
        { status: 409 },
      );
    if (session.jobs.size >= 3)
      throw new Error(
        'This session has reached three runs. Clear the session to start another batch.',
      );
    if (typeof body.batchId !== 'string' || !body.batchId.trim() || body.batchId.length > 100)
      throw new Error('Provide a batch ID of at most 100 characters.');
    if (typeof body.leftComplete !== 'boolean' || typeof body.rightComplete !== 'boolean')
      throw new Error('Explicit source completeness flags are required.');
    const sources = {
      left: this.source(session, body.leftId),
      right: this.source(session, body.rightId),
    };
    const config = makeRules(body.rules, sources);
    const job = {
      id: body.requestId,
      fingerprint,
      batchId: body.batchId,
      ruleVersion: config.version,
      processedAt: new Date().toISOString(),
      state: 'staging',
      phase: 'left',
      stagedLeft: 0,
      stagedRight: 0,
      processed: 0,
      started: Date.now(),
      path: join(session.folder, `${body.requestId}.sqlite`),
      controller: new AbortController(),
      input: body,
      sources: { left: sources.left.sourceId, right: sources.right.sourceId },
      logs: [],
      preview: [],
    };
    session.jobs.set(job.id, job);
    this.activeJob = job;
    this.process(session, job, sources, config)
      .finally(() => {
        if (this.activeJob === job) this.activeJob = undefined;
      })
      .catch((error) => this.log(`[portal] job cleanup: ${error.message}`));
    return job;
  }
  publicJob(job) {
    const {
      id,
      batchId,
      ruleVersion,
      processedAt,
      state,
      phase,
      stagedLeft,
      stagedRight,
      processed,
      summary,
      error,
      sources,
      logs,
      preview,
    } = job;
    return {
      id,
      batchId,
      ruleVersion,
      rules: job.input.rules,
      processedAt,
      state,
      phase,
      stagedLeft,
      stagedRight,
      processed,
      summary,
      error,
      sources,
      logs,
      preview,
      durationMs: (job.finished ?? Date.now()) - job.started,
      completeness: { left: job.input.leftComplete, right: job.input.rightComplete },
    };
  }
  note(job, message) {
    job.logs.push({ time: new Date().toISOString(), message });
    if (job.logs.length > 30) job.logs.shift();
    this.log(`[portal][${job.id}] ${message}`);
  }
  async budget(job) {
    if ((await stat(job.path)).size > this.maxJobBytes)
      throw new Error('Run exceeded the disk budget. Reduce file size or increase MAX_JOB_BYTES.');
  }
  async process(session, job, sources, config) {
    let db,
      transaction = false;
    const flush = async () => {
      db.exec('COMMIT');
      transaction = false;
      await this.budget(job);
      session.touched = Date.now();
      await yieldLoop();
      job.controller.signal.throwIfAborted();
      db.exec('BEGIN');
      transaction = true;
    };
    try {
      db = new DatabaseSync(job.path);
      db.exec(
        'PRAGMA journal_mode=DELETE; PRAGMA cache_size=-2048; PRAGMA temp_store=FILE; CREATE TABLE rows(side TEXT, row_id TEXT, sort_key BLOB, payload TEXT, PRIMARY KEY(side,row_id)); CREATE INDEX matching ON rows(side,sort_key,row_id); CREATE TABLE events(seq INTEGER PRIMARY KEY, kind TEXT, status TEXT, payload TEXT); CREATE TABLE statuses(seq INTEGER,status TEXT,PRIMARY KEY(seq,status)); CREATE INDEX status_lookup ON statuses(status,seq);',
      );
      const insert = db.prepare('INSERT INTO rows VALUES(?,?,?,?)');
      for (const side of ['left', 'right']) {
        job.phase = side;
        this.note(job, `Staging ${side} source on disk.`);
        const key = createSortKey({
          name: config.keys[0].name,
          selectors: side === 'left' ? config.keys[0].internal : config.keys[0].partner,
        });
        db.exec('BEGIN');
        transaction = true;
        let count = 0;
        for await (const row of sourceRows(sources[side], job.controller.signal)) {
          if (++count > this.maxRows)
            throw new Error(`${side} exceeded the ${this.maxRows} row limit.`);
          let encoded;
          try {
            encoded = key(row.data);
          } catch {
            throw new Error(
              `${side} source, physical row ${row.line}: a matching identifier is missing or invalid. Correct the row and upload again.`,
            );
          }
          // SQLite BLOB byte order must match JavaScript's UTF-16 code-unit order.
          const sortKey = Buffer.from(encoded, 'utf16le').swap16();
          insert.run(side, row.id, sortKey, JSON.stringify(row));
          job[side === 'left' ? 'stagedLeft' : 'stagedRight'] = count;
          if (count % 1000 === 0) await flush();
        }
        db.exec('COMMIT');
        transaction = false;
        await this.budget(job);
        await yieldLoop();
      }
      // Check payload size on disk before a duplicate group enters JS memory.
      const heavyGroup = db
        .prepare(
          'SELECT sum(length(CAST(payload AS BLOB))) AS bytes FROM rows GROUP BY sort_key HAVING sum(length(CAST(payload AS BLOB))) > ? LIMIT 1',
        )
        .get(4 * 1024 * 1024);
      if (heavyGroup)
        throw new Error(
          'One matching group exceeds the 4 MiB payload budget. Reduce record size or split the business batch by stable keys.',
        );
      job.state = 'running';
      job.phase = 'matching';
      this.note(job, 'Calling reconcileSorted() with indexed, sorted cursors.');
      const cursor = (side) => {
        const statement = db.prepare(
          'SELECT payload FROM rows WHERE side=? ORDER BY sort_key,row_id',
        );
        return (function* () {
          for (const row of statement.iterate(side)) yield JSON.parse(row.payload);
        })();
      };
      const output = db.prepare('INSERT INTO events VALUES(?,?,?,?)');
      const status = db.prepare('INSERT INTO statuses VALUES(?,?)');
      let seq = 0;
      db.exec('BEGIN');
      transaction = true;
      for await (const event of reconcileSorted({
        batchId: job.batchId,
        runId: job.id,
        processedAt: job.processedAt,
        config,
        left: {
          sourceId: sources.left.sourceId,
          complete: job.input.leftComplete,
          rows: cursor('left'),
        },
        right: {
          sourceId: sources.right.sourceId,
          complete: job.input.rightComplete,
          rows: cursor('right'),
        },
        maxGroupRows: 1000,
        signal: job.controller.signal,
      })) {
        job.controller.signal.throwIfAborted();
        output.run(++seq, event.type, event.entry?.status ?? null, JSON.stringify(event));
        if (event.type === 'entry') {
          job.processed++;
          for (const value of event.entry.statuses) status.run(seq, value);
          if (job.preview.length < 3) {
            job.preview.push(event);
            this.log(`[package output][${job.id}] ${JSON.stringify(event, null, 2)}`);
          }
        }
        if (event.type === 'complete') job.summary = event.summary;
        if (seq % 1000 === 0) {
          await flush();
          this.note(job, `${job.processed.toLocaleString('en-US')} result entries persisted.`);
        }
      }
      db.exec('COMMIT');
      transaction = false;
      await this.budget(job);
      if (!job.summary) throw new Error('Core did not emit a complete event.');
      job.state = 'complete';
      this.note(
        job,
        `Completed: ${job.summary.matchedPairs} matched, ${job.summary.nonMatchedEntries} non-matched.`,
      );
      this.log(
        `[package output][${job.id}] ${JSON.stringify({ type: 'complete', batchId: job.batchId, runId: job.id, summary: job.summary }, null, 2)}`,
      );
    } catch (error) {
      if (transaction) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* retain original failure */
        }
      }
      job.state = job.controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = error.message;
      delete job.summary;
      this.note(
        job,
        `${job.state}: ${error.message}. Partial results are provisional and cannot be exported.`,
      );
    } finally {
      db?.close();
      job.finished = Date.now();
      session.touched = Date.now();
    }
  }
  openResults(job) {
    if (job.state !== 'complete')
      throw Object.assign(
        new Error('Results are available only after a successful complete event.'),
        { status: 409 },
      );
    const db = new DatabaseSync(job.path, { readOnly: true });
    db.exec('PRAGMA cache_size=-2048;');
    return db;
  }
  async clear(session) {
    if (
      session.uploading ||
      (this.activeJob && session.jobs.get(this.activeJob.id) === this.activeJob)
    )
      throw Object.assign(
        new Error('Cancel the active run and wait for it to stop before clearing.'),
        { status: 409 },
      );
    const target = resolve(session.folder);
    if (dirname(target) !== this.root || basename(target) !== session.id)
      throw new Error('Session cleanup ownership check failed.');
    await rm(target, { recursive: true, force: true });
    this.sessions.delete(session.id);
  }
  async expire() {
    for (const session of this.sessions.values())
      if (
        Date.now() - session.touched > 30 * 60_000 &&
        !session.uploading &&
        !(this.activeJob && session.jobs.get(this.activeJob.id) === this.activeJob)
      )
        await this.clear(session);
  }
  async close() {
    this.activeJob?.controller.abort(new Error('Server is shutting down.'));
    while (this.activeJob || this.uploads) await yieldLoop();
    if (
      dirname(this.root) !== this.parent ||
      !basename(this.root).startsWith('reconciliation-portal-')
    )
      throw new Error('Workspace cleanup ownership check failed.');
    await rm(this.root, { recursive: true, force: true });
  }
}
