import assert from 'node:assert/strict';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { createPortal } from '../server/index.mjs';
const rows = Number(process.env.MEMORY_ROWS ?? 50_000);
assert.ok(Number.isSafeInteger(rows) && rows > 0 && rows <= 2_000_000);
const diskBudget = Number(process.env.MAX_JOB_BYTES ?? 2 * 1024 * 1024 * 1024);
const portal = await createPortal({ log: () => {}, maxJobBytes: diskBudget });
let peakHeap = 0,
  peakRss = 0;
const sample = () => {
  const m = process.memoryUsage();
  peakHeap = Math.max(peakHeap, m.heapUsed);
  peakRss = Math.max(peakRss, m.rss);
};
const timer = setInterval(sample, 25);
try {
  portal.server.listen(0, '127.0.0.1');
  await once(portal.server, 'listening');
  const base = `http://127.0.0.1:${portal.server.address().port}`;
  const file = join(portal.workspace.root, 'memory.csv');
  const out = createWriteStream(file);
  out.write('id,amount\n');
  for (let start = rows; start > 0; start -= 1000) {
    let text = '';
    for (let i = start; i > Math.max(0, start - 1000); i--) text += `ID-${i},9007199254740993.01\n`;
    if (!out.write(text)) await once(out, 'drain');
  }
  out.end();
  await once(out, 'finish');
  const size = (await stat(file)).size;
  assert.ok(
    size <= portal.workspace.maxUploadBytes,
    'Generated file exceeds the playground 3 MB cap. Reduce MEMORY_ROWS; large-data benchmarks belong in the core package.',
  );
  let cookie;
  const sources = [];
  const started = Date.now();
  for (const side of ['left', 'right']) {
    const res = await fetch(`${base}/api/sources?side=${side}&name=${side}.csv`, {
      method: 'POST',
      headers: { 'Content-Length': String(size), ...(cookie ? { cookie } : {}) },
      body: createReadStream(file),
      duplex: 'half',
    });
    assert.equal(res.status, 201);
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    sources.push(await res.json());
  }
  const input = {
    requestId: crypto.randomUUID(),
    batchId: 'memory-batch',
    leftId: sources[0].id,
    rightId: sources[1].id,
    leftComplete: true,
    rightComplete: true,
    rules: {
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
    },
  };
  const response = await fetch(base + '/api/runs', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 202);
  const job = await response.json();
  let result;
  while (true) {
    result = await (await fetch(`${base}/api/runs/${job.id}`, { headers: { cookie } })).json();
    if (!['staging', 'running'].includes(result.state)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(result.state, 'complete', result.error);
  assert.equal(result.summary.matchedPairs, rows);
  sample();
  console.log(
    JSON.stringify(
      {
        pairs: rows,
        durationMs: Date.now() - started,
        peakHeapMiB: Math.round(peakHeap / 1024 / 1024),
        peakRssMiB: Math.round(peakRss / 1024 / 1024),
        oldSpaceBudgetMiB: 64,
        diskBudgetMiB: diskBudget / 1024 / 1024,
      },
      null,
      2,
    ),
  );
} finally {
  clearInterval(timer);
  await portal.close();
}
