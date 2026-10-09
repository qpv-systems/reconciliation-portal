import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPortal } from '../server/index.mjs';

async function usingPortal(run, options = {}) {
  const portal = await createPortal({ log: () => {}, ...options });
  portal.server.listen(0, '127.0.0.1');
  await new Promise((resolve) => portal.server.once('listening', resolve));
  const base = `http://127.0.0.1:${portal.server.address().port}`;
  let cookie = '';
  const request = async (path, options = {}) => {
    const res = await fetch(base + path, {
      ...options,
      headers: { ...options.headers, ...(cookie ? { cookie } : {}) },
    });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return res;
  };
  const get = async (path) => {
    const res = await request(path);
    assert.equal(res.status, 200, await res.clone().text());
    return res.json();
  };
  const upload = async (side, body, name = side + '.csv', extra = {}) => {
    const url = new URLSearchParams({ side, name, ...extra });
    const res = await request('/api/sources?' + url, { method: 'POST', body });
    assert.equal(res.status, 201, await res.clone().text());
    return res.json();
  };
  const start = async (left, right, rules, extra = {}) => {
    const input = {
      requestId: crypto.randomUUID(),
      batchId: 'test-batch',
      leftId: left.id,
      rightId: right.id,
      leftComplete: true,
      rightComplete: true,
      rules,
      ...extra,
    };
    const res = await request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.equal(res.status, 202, await res.clone().text());
    return { input, job: await res.json() };
  };
  const wait = async (id) => {
    for (let i = 0; i < 200; i++) {
      const job = await get('/api/runs/' + id);
      if (!['running', 'staging'].includes(job.state)) return job;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Run timeout');
  };
  try {
    await run({ portal, base, request, get, upload, start, wait });
  } finally {
    const path = portal.workspace.root;
    await portal.close();
    await assert.rejects(stat(path), { code: 'ENOENT' });
  }
}
const rules = {
  keys: [{ left: 'id', right: 'id' }],
  comparisons: [
    {
      name: 'amount',
      left: 'amount',
      right: 'amount',
      kind: 'decimal',
      status: 'AMOUNT_MISMATCH',
      tolerance: '0',
      missing: 'pending',
    },
  ],
};

test('Unsorted CSV preserves decimals, matches refund rows, and exports every core event', async () =>
  usingPortal(async ({ upload, start, wait, get, request }) => {
    const left = await upload('left', 'id,amount\nR,-10.25\nB,9007199254740993.01\nA,12.50\nL,6\n');
    const right = await upload(
      'right',
      'id,amount\nB,9007199254740993.01\nR,-10.25\nA,12.51\nP,7\n',
    );
    const { job } = await start(left, right, rules);
    const done = await wait(job.id);
    assert.equal(done.state, 'complete', done.error);
    assert.equal(done.summary.matchedPairs, 2);
    assert.equal(done.summary.nonMatchedEntries, 3);
    const page = await get(`/api/runs/${job.id}/results?limit=1`);
    assert.equal(page.total, 5);
    assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0].event.entry.issues[0].difference, '-0.01');
    const ndjson = await (await request(`/api/runs/${job.id}/export?format=ndjson`)).text();
    const events = ndjson.trim().split('\n').map(JSON.parse);
    assert.equal(events.filter((e) => e.type === 'entry').length, 5);
    assert.equal(events.at(-1).type, 'complete');
    const json = await get(`/api/runs/${job.id}/export?format=json&status=MATCHED`);
    assert.equal(json.entries.length, 2);
    assert.equal(
      json.entries.find((e) => e.internal.data.id === 'B').internal.data.amount,
      '9007199254740993.01',
    );
  }));

test('Duplicate keys are not paired; incomplete sources remain pending', async () =>
  usingPortal(async ({ upload, start, wait, get }) => {
    const left = await upload('left', 'id,amount\nA,1\nA,1\nL,2\nP,\n');
    const right = await upload('right', 'id,amount\nA,1\nR,2\nP,\n');
    const { job } = await start(left, right, rules, { leftComplete: false, rightComplete: false });
    const done = await wait(job.id);
    assert.equal(done.state, 'complete', done.error);
    assert.equal(done.summary.matchedPairs, 0);
    assert.equal(done.summary.manualReviewEntries, 3);
    assert.equal(done.summary.byStatus.MISSING_INTERNAL, undefined);
    assert.equal(done.summary.byStatus.MISSING_PARTNER, undefined);
    assert.equal(done.summary.pendingEntries, 3);
    const page = await get(`/api/runs/${job.id}/results?status=MANUAL_REVIEW`);
    assert.equal(page.total, 3);
  }));

test('Invalid rows fail with a line reference; provisional outputs cannot be exported; retry uses new history', async () =>
  usingPortal(async ({ upload, start, wait, request }) => {
    const left = await upload('left', 'id,amount\nA,1\nB,2\nC,3\nD,4\nE,5\n,6\n');
    const right = await upload('right', 'id,amount\nA,1\n');
    const { job, input } = await start(left, right, rules);
    const done = await wait(job.id);
    assert.equal(done.state, 'failed');
    assert.match(done.error, /physical row 7/);
    assert.equal((await request(`/api/runs/${job.id}/export`)).status, 409);
    const repeated = await request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.equal((await repeated.json()).id, job.id);
    const changed = await request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, rightComplete: false }),
    });
    assert.equal(changed.status, 409);
    const fixed = await upload('left', 'id,amount\nA,1\n');
    const retry = await start(fixed, right, rules);
    assert.notEqual(retry.job.id, job.id);
    assert.equal((await wait(retry.job.id)).summary.matchedPairs, 1);
  }));

test('One worker, duplicate submission idempotency, cancellation, and session isolation', async () =>
  usingPortal(async ({ upload, start, request, wait, base }) => {
    const csv =
      'id,amount\n' + Array.from({ length: 5000 }, (_, i) => `ID${i},1`).join('\n') + '\n';
    const left = await upload('left', csv);
    const right = await upload('right', csv);
    const { job, input } = await start(left, right, rules);
    const same = await request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.equal((await same.json()).id, job.id);
    const concurrent = await request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, requestId: crypto.randomUUID() }),
    });
    assert.equal(concurrent.status, 409);
    assert.equal((await fetch(base + `/api/runs/${job.id}`)).status, 404);
    await request(`/api/runs/${job.id}/cancel`, { method: 'POST' });
    const done = await wait(job.id);
    assert.equal(done.state, 'cancelled');
    assert.equal((await request(`/api/runs/${job.id}/results`)).status, 409);
  }));

test('Six domain presets work with CSV and XLSX through the installed npm adapter', async () =>
  usingPortal(async ({ get, upload, start, wait, request }) => {
    const catalog = await get('/samples/catalog.json');
    assert.equal(catalog.length, 6);
    for (const template of catalog) {
      for (const format of ['csv', 'xlsx']) {
        const sources = [];
        for (const side of ['left', 'right'])
          sources.push(
            await upload(
              side,
              await readFile(
                fileURLToPath(
                  new URL(`../public/samples/${template.id}-${side}.${format}`, import.meta.url),
                ),
              ),
              `${template.id}-${side}.${format}`,
            ),
          );
        const { job } = await start(sources[0], sources[1], {
          keys: template.keys,
          comparisons: template.comparisons,
        });
        const done = await wait(job.id);
        assert.equal(done.state, 'complete', `${template.id} ${format}: ${done.error}`);
        assert.ok(done.summary.matchedPairs > 0);
        assert.ok(done.summary.nonMatchedEntries > 0);
        if (template.id === 'inventory' || template.id === 'payroll')
          assert.equal(template.keys.length, 2);
        assert.equal((await request('/api/session', { method: 'DELETE' })).status, 200);
      }
    }
  }));

test('CSV multiline fields, BOM, semicolon delimiter, physical lines and spreadsheet-safe exports', async () =>
  usingPortal(async ({ upload, start, wait, request }) => {
    const csv = '\uFEFFid;amount;note\r\nA;1;"line one\nline two"\r\nB;2;" =SUM(1,2)"\r\n';
    const left = await upload('left', csv, 'left.csv', { delimiter: ';' });
    const right = await upload('right', csv, 'right.csv', { delimiter: ';' });
    assert.equal(left.preview[0].line, 3);
    assert.equal(left.preview[0].data.note, 'line one\nline two');
    const { job } = await start(left, right, rules);
    assert.equal((await wait(job.id)).summary.matchedPairs, 2);
    const exported = await (await request(`/api/runs/${job.id}/export?format=csv`)).text();
    assert.ok(exported.includes('left_line'));
    assert.ok(exported.includes('line one\\nline two'));
  }));

test('Malformed files, invalid rules, cross-origin writes, path traversal and upload limits are rejected', async () =>
  usingPortal(
    async ({ upload, start, request }) => {
      for (const csv of ['id,id\nA,B\n', 'id,amount\nA,1,extra\n'])
        assert.equal(
          (await request('/api/sources?side=left&name=bad.csv', { method: 'POST', body: csv }))
            .status,
          400,
        );
      const left = await upload('left', 'id,amount\nA,1\n');
      const right = await upload('right', 'id,amount\nA,1\n');
      const invalid = { ...rules, comparisons: [{ ...rules.comparisons[0], tolerance: 'NaN' }] };
      const res = await request('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          batchId: 'b',
          leftId: left.id,
          rightId: right.id,
          leftComplete: true,
          rightComplete: true,
          rules: invalid,
        }),
      });
      assert.equal(res.status, 400);
      assert.equal(
        (await request('/api/sources?side=left&name=bad.xls', { method: 'POST', body: '123' }))
          .status,
        400,
      );
      assert.equal(
        (
          await request('/api/sources?side=left&name=x.csv', {
            method: 'POST',
            headers: { origin: 'https://untrusted.example' },
            body: 'id\nA',
          })
        ).status,
        403,
      );
      assert.equal((await request('/server/index.mjs')).status, 404);
      assert.equal(
        (
          await request('/api/sources?side=left&name=big.csv', {
            method: 'POST',
            body: 'x'.repeat(2049),
          })
        ).status,
        413,
      );
    },
    { maxUploadBytes: 2048 },
  ));

test('Repeated uploads reuse the same immutable snapshot; parsing settings remain separate', async () =>
  usingPortal(async ({ upload, get }) => {
    const content = 'id,amount\nA,1\n';
    const first = await upload('left', content);
    const second = await upload('left', content, 'renamed.csv');
    assert.equal(first.id, second.id);
    const right = await upload('right', content);
    assert.notEqual(first.id, right.id);
    assert.equal((await get('/api/session')).sources.length, 2);
  }));

test('Decimal tolerance is inclusive and every mismatch status remains filterable', async () =>
  usingPortal(async ({ upload, start, wait, get }) => {
    const left = await upload('left', 'id,amount,fee\nA,1.00,2\nB,2.00,3\n');
    const right = await upload('right', 'id,amount,fee\nB,2.50,4\nA,1.01,2\n');
    const configured = {
      keys: rules.keys,
      comparisons: [
        { ...rules.comparisons[0], tolerance: '0.01' },
        {
          name: 'fee',
          left: 'fee',
          right: 'fee',
          kind: 'decimal',
          status: 'FEE_MISMATCH',
          tolerance: '0',
          missing: 'pending',
        },
      ],
    };
    const { job } = await start(left, right, configured);
    const done = await wait(job.id);
    assert.equal(done.summary.matchedPairs, 1);
    assert.equal(done.summary.byStatus.AMOUNT_MISMATCH, 1);
    assert.equal(done.summary.byStatus.FEE_MISMATCH, 1);
    const fees = await get(`/api/runs/${job.id}/results?status=FEE_MISMATCH`);
    assert.equal(fees.total, 1);
    assert.equal(fees.rows[0].event.entry.status, 'AMOUNT_MISMATCH');
  }));

test('Failure after matching starts blocks exports and retains provisional trace', async () =>
  usingPortal(async ({ upload, start, wait, request }) => {
    const left = await upload(
      'left',
      'id,amount\nA,1\n' + Array.from({ length: 1001 }, () => `Z,2`).join('\n') + '\n',
    );
    const right = await upload('right', 'id,amount\nA,1\n');
    const { job } = await start(left, right, rules);
    const done = await wait(job.id);
    assert.equal(done.state, 'failed');
    assert.match(done.error, /maxGroupRows/);
    assert.equal(done.processed, 1);
    assert.equal(done.summary, undefined);
    assert.equal((await request(`/api/runs/${job.id}/export`)).status, 409);
  }));

test('Oversized matching groups fail before allocating their payloads in core memory', async () =>
  usingPortal(async ({ upload, start, wait, request }) => {
    const csv =
      'id,amount,note\n' +
      Array.from({ length: 75 }, () => `A,1,${'x'.repeat(60000)}`).join('\n') +
      '\n';
    const left = await upload('left', csv);
    const right = await upload('right', 'id,amount,note\nA,1,x\n');
    const { job } = await start(left, right, rules);
    const done = await wait(job.id);
    assert.equal(done.state, 'failed');
    assert.match(done.error, /4 MiB payload budget/);
    assert.equal(done.processed, 0);
    assert.equal((await request(`/api/runs/${job.id}/export`)).status, 409);
  }));

test('Invalid UTF-8 and reserved CSV headers are rejected without unhandled stream errors', async () =>
  usingPortal(async ({ request }) => {
    for (const body of [
      Buffer.from([105, 100, 44, 97, 10, 65, 44, 255, 10]),
      'id,__proto__\nA,test\n',
    ]) {
      const res = await request('/api/sources?side=left&name=bad.csv', { method: 'POST', body });
      assert.equal(res.status, 400);
    }
  }));

test('SQL sorting agrees with JavaScript canonical order for Unicode identifiers', async () =>
  usingPortal(async ({ upload, start, wait }) => {
    const csv = 'id,amount\n\ue000,1\n😀,2\nA,3\n';
    const left = await upload('left', csv);
    const right = await upload('right', csv);
    const { job } = await start(left, right, rules);
    const done = await wait(job.id);
    assert.equal(done.state, 'complete', done.error);
    assert.equal(done.summary.matchedPairs, 3);
  }));
