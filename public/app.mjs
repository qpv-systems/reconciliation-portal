import { t, t as tLabel, ui, locale } from './i18n.mjs';
const $ = (id) => document.getElementById(id);
const sides = ['left', 'right'];
const labels = {
  MATCHED: 'Khớp',
  MISSING_INTERNAL: 'Thiếu ở trái',
  MISSING_PARTNER: 'Thiếu ở phải',
  AMOUNT_MISMATCH: 'Sai lệch số tiền',
  FEE_MISMATCH: 'Sai lệch phí',
  STATUS_MISMATCH: 'Khác trạng thái gốc',
  CURRENCY_MISMATCH: 'Khác tiền tệ',
  TYPE_MISMATCH: 'Khác loại',
  FIELD_MISMATCH: 'Khác giá trị',
  PENDING_RECHECK: 'Chờ kiểm tra lại',
  MANUAL_REVIEW: 'Kiểm tra thủ công',
};
const comparisonStatuses = [
  'AMOUNT_MISMATCH',
  'FEE_MISMATCH',
  'STATUS_MISMATCH',
  'CURRENCY_MISMATCH',
  'TYPE_MISMATCH',
  'FIELD_MISMATCH',
];
const state = {
  sources: {},
  rules: { keys: [], comparisons: [] },
  catalog: [],
  template: undefined,
  draft: undefined,
  editorSide: 'left',
  busy: false,
  job: undefined,
  offset: 0,
  page: [],
  total: 0,
  pageRevision: 0,
  maxUploadBytes: 3_000_000,
};
const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const number = (value) => (value == null ? '—' : value.toLocaleString(locale()));
const badge = (status) =>
  ui`<span class="badge ${esc(status)}" title="${esc(status)}">${esc(t(labels[status] ?? status))}</span>`;
const clone = (object) => structuredClone(object);
function notify(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = false;
}
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response
    .json()
    .catch(() => ({ error: t('Server không trả được kết quả. Kiểm tra log và kết nối.') }));
  if (!response.ok) throw new Error(data.error ?? ui`HTTP ${response.status}`);
  return data;
}
const post = (url, body) =>
  api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
function ready() {
  return (
    sides.every((side) => state.sources[side]) &&
    state.rules.keys.length &&
    state.rules.keys.every(
      (key) =>
        state.sources.left.columns.includes(key.left) &&
        state.sources.right.columns.includes(key.right),
    ) &&
    state.rules.comparisons.length
  );
}
function busy(value) {
  state.busy = value;
  document.querySelectorAll('input,select,button').forEach((control) => {
    if (
      control.id !== 'cancel' &&
      control.id !== 'language-select' &&
      !control.classList.contains('close-dialog')
    )
      control.disabled = value;
  });
  $('rule-fields').disabled = value || !sides.every((side) => state.sources[side]);
  $('run').disabled = value || !ready();
  $('edit-sample').disabled = value || !state.draft;
  $('cancel').hidden = !value || !state.job || !['staging', 'running'].includes(state.job.state);
  $('previous').disabled = value || state.offset === 0;
  $('next').disabled = value || state.offset + 20 >= state.total;
  document.querySelectorAll('.remove-key').forEach((button) => {
    button.disabled = value || state.rules.keys.length === 1;
  });
  document.querySelectorAll('.remove-comparison').forEach((button) => {
    button.disabled = value || state.rules.comparisons.length === 1;
  });
  $('add-key').disabled = value || state.rules.keys.length >= 8;
  $('add-comparison').disabled = value || state.rules.comparisons.length >= 20;
  $('run-ready').textContent = ready()
    ? t('Quy tắc sẵn sàng cho hai nguồn')
    : t('Upload hai nguồn để bắt đầu');
  $('run-description').textContent = ready()
    ? ui`${state.rules.keys.length} thành phần khóa · ${state.rules.comparisons.length} field so sánh · giữ nguyên dữ liệu gốc`
    : t('Chọn mẫu bên trên để thử nhanh toàn bộ quy trình.');
}
function renderSource(side) {
  const source = state.sources[side];
  if (!source) {
    $(side + '-filename').textContent = t('Chưa có file');
    $(side + '-preview').innerHTML = t(
      '<p>Chưa có dữ liệu. Preview sẽ xuất hiện sau khi upload.</p>',
    );
    return;
  }
  $(side + '-filename').textContent = source.name;
  $(side + '-preview').innerHTML =
    ui`<table><thead><tr><th>Dòng</th>${source.columns.map((c) => ui`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${source.preview.map((row) => ui`<tr><td>${row.line}</td>${source.columns.map((c) => ui`<td title="${esc(row.data[c])}">${esc(row.data[c])}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="source-meta">${number(source.size)} bytes · Preview tối đa 5 dòng, chưa phải tổng số bản ghi.</div>`;
}
function chooseRules() {
  if (!sides.every((side) => state.sources[side])) return;
  const columns = (side) => state.sources[side].columns;
  const template = state.template;
  const compatible =
    template &&
    template.keys.every(
      (k) => columns('left').includes(k.left) && columns('right').includes(k.right),
    ) &&
    template.comparisons.every(
      (c) => columns('left').includes(c.left) && columns('right').includes(c.right),
    );
  if (compatible)
    state.rules = { keys: clone(template.keys), comparisons: clone(template.comparisons) };
  else {
    const common = columns('left').filter((c) => columns('right').includes(c));
    const key = common.find((c) => c === 'id' || c.endsWith('_id')) ?? '';
    state.rules = {
      keys: [{ left: key, right: columns('right').includes(key) ? key : '' }],
      comparisons: [
        {
          name: 'value',
          left: common.find((c) => c !== key) ?? columns('left')[0],
          right: common.find((c) => c !== key) ?? columns('right')[0],
          kind: 'exact',
          status: 'FIELD_MISMATCH',
          tolerance: '0',
          missing: 'pending',
        },
      ],
    };
  }
  renderRules();
}
function columnOptions(side, value) {
  return (
    ui`<option value="" ${!value ? 'selected' : ''}>Chọn cột…</option>` +
    (state.sources[side]?.columns ?? [])
      .map((c) => ui`<option value="${esc(c)}" ${c === value ? 'selected' : ''}>${esc(c)}</option>`)
      .join('')
  );
}
function renderRules() {
  $('key-rows').innerHTML = state.rules.keys
    .map(
      (key, index) =>
        ui`<div class="key-row"><select data-key="${index}" data-field="left" aria-label="Khóa trái ${index + 1}">${columnOptions('left', key.left)}</select><select data-key="${index}" data-field="right" aria-label="Khóa phải ${index + 1}">${columnOptions('right', key.right)}</select><button class="remove remove-key" data-remove-key="${index}" aria-label="Xóa thành phần khóa ${index + 1}">×</button></div>`,
    )
    .join('');
  $('comparison-rows').innerHTML = state.rules.comparisons
    .map(
      (c, index) =>
        ui`<tr><td><select data-comparison="${index}" data-field="status" aria-label="Ý nghĩa field ${index + 1}">${comparisonStatuses.map((s) => ui`<option value="${s}" ${c.status === s ? 'selected' : ''}>${t(labels[s])}</option>`).join('')}</select><input data-comparison="${index}" data-field="name" value="${esc(c.name)}" aria-label="Tên rule ${index + 1}" maxlength="100" /></td><td><select data-comparison="${index}" data-field="left" aria-label="Field trái ${index + 1}">${columnOptions('left', c.left)}</select></td><td><select data-comparison="${index}" data-field="right" aria-label="Field phải ${index + 1}">${columnOptions('right', c.right)}</select></td><td><select data-comparison="${index}" data-field="kind" aria-label="Kiểu field ${index + 1}"><option value="exact" ${c.kind === 'exact' ? 'selected' : ''}>Exact · chính xác</option><option value="decimal" ${c.kind === 'decimal' ? 'selected' : ''}>Decimal · số</option></select></td><td><input data-comparison="${index}" data-field="tolerance" value="${esc(c.tolerance ?? '0')}" aria-label="Dung sai field ${index + 1}" ${c.kind !== 'decimal' ? 'readonly' : ''} maxlength="100" /></td><td><select data-comparison="${index}" data-field="missing" aria-label="Thiếu giá trị field ${index + 1}"><option value="pending" ${c.missing === 'pending' ? 'selected' : ''}>Chờ kiểm tra lại</option><option value="review" ${c.missing === 'review' ? 'selected' : ''}>Kiểm tra thủ công</option><option value="ignore" ${c.missing === 'ignore' ? 'selected' : ''}>Bỏ qua so sánh</option></select></td><td><button class="remove remove-comparison" data-remove-comparison="${index}" aria-label="Xóa field ${index + 1}">×</button></td></tr>`,
    )
    .join('');
  $('rule-count').textContent = ready()
    ? ui`${state.rules.comparisons.length} field so sánh`
    : t('Chờ hai nguồn');
  busy(state.busy);
}
function resetResults() {
  state.pageRevision++;
  state.job = undefined;
  state.offset = 0;
  state.page = [];
  state.total = 0;
  for (const name of ['total', 'matched', 'nonmatched', 'pending', 'manual'])
    $('stat-' + name).textContent = '—';
  $('result-state').textContent = t('Chưa chạy');
  $('result-state').className = 'state-chip';
  $('result-caption').textContent = t('Kết quả và báo cáo xuất hiện sau khi batch hoàn tất.');
  $('raw-output').textContent = t('Chưa có output.');
  $('progress').hidden = true;
  $('page-label').textContent = t('Chưa có kết quả');
  $('result-rows').innerHTML = t(
    '<tr><td colspan="6"><div class="empty"><span>⇄</span><h3>Sẵn sàng khám phá kết quả</h3><p>Chạy đối soát để xem dòng nào khớp và khác nhau ở đâu.</p></div></td></tr>',
  );
  updateExports();
  busy(state.busy);
}
async function uploadFile(side, file) {
  if (file.size > state.maxUploadBytes)
    throw new Error(
      ui`File vượt giới hạn ${number(state.maxUploadBytes / 1_000_000)} MB mỗi file.`,
    );
  const params = new URLSearchParams({
    side,
    name: file.name,
    delimiter: $(side + '-delimiter').value,
    sheet: $(side + '-sheet').value,
    headerRow: $(side + '-header').value,
  });
  $(side + '-filename').textContent = ui`Đang upload ${file.name}…`;
  const source = await api('/api/sources?' + params, { method: 'POST', body: file });
  state.sources[side] = source;
  renderSource(side);
  return source;
}
async function handleFile(side, file) {
  if (!file || state.busy) return;
  if (file.size > state.maxUploadBytes) {
    notify(ui`File vượt giới hạn ${number(state.maxUploadBytes / 1_000_000)} MB mỗi file.`, true);
    return;
  }
  busy(true);
  resetResults();
  state.draft = undefined;
  for (const sourceSide of sides) $(sourceSide + '-complete').checked = false;
  try {
    await uploadFile(side, file);
    chooseRules();
    notify(t('Upload thành công. Chọn cột và xác nhận tính đầy đủ trước khi chạy.'));
  } catch (error) {
    renderSource(side);
    notify(error.message, true);
  } finally {
    busy(false);
  }
}
function selectTemplate(id) {
  state.template = state.catalog.find((template) => template.id === id);
  $('sample-cards').innerHTML = state.catalog
    .map(
      (template) =>
        ui`<button class="sample-card ${template.id === id ? 'active' : ''}" data-template="${template.id}" aria-pressed="${template.id === id}"><span class="sample-icon">${esc(template.icon)}</span><strong>${esc(tLabel(template.label))}</strong><small>${esc(tLabel(template.short))}</small></button>`,
    )
    .join('');
  const template = state.template;
  $('sample-info').textContent =
    ui`${tLabel(template.description)} Khóa: ${template.keys.map((k) => k.left).join(' + ')}. So sánh: ${template.comparisons.map((c) => c.name).join(', ')}.`;
  $('sample-downloads').innerHTML = sides
    .flatMap((side) =>
      ['csv', 'xlsx'].map(
        (format) =>
          ui`<a href="/samples/${template.id}-${side}.${format}" download>${side === 'left' ? t('Trái') : t('Phải')} .${format} ↧</a>`,
      ),
    )
    .join('');
}
function sampleCsv(columns, rows) {
  const cell = (v) => ui`"${String(v ?? '').replaceAll('"', '""')}"`;
  return [columns, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
function sampleFiles() {
  return sides.map(
    (side) =>
      new File(
        [sampleCsv(state.draft[side].columns, state.draft[side].rows)],
        ui`${state.draft.id}-${side}-edited.csv`,
        { type: 'text/csv' },
      ),
  );
}
async function uploadDraft(runAfter = false) {
  if (state.busy || !state.draft) return;
  busy(true);
  resetResults();
  try {
    const files = sampleFiles();
    for (let i = 0; i < 2; i++) {
      const side = sides[i];
      $(side + '-delimiter').value = ',';
      await uploadFile(side, files[i]);
    }
    if (
      !state.rules.keys.length ||
      state.rules.keys.some(
        (k) =>
          !state.sources.left.columns.includes(k.left) ||
          !state.sources.right.columns.includes(k.right),
      )
    )
      chooseRules();
    else renderRules();
    $('editor-dialog').close();
    notify(t('Hai bộ dữ liệu đã được upload. Bạn có thể tiếp tục chỉnh các field đối soát.'));
  } catch (error) {
    notify(error.message, true);
    busy(false);
    return;
  } finally {
    busy(false);
  }
  if (runAfter) await run();
}
async function loadSample() {
  if (state.busy) return;
  const template = state.template;
  state.draft = { id: template.id, left: clone(template.left), right: clone(template.right) };
  state.rules = { keys: clone(template.keys), comparisons: clone(template.comparisons) };
  // Synthetic templates explicitly represent a complete demo batch.
  for (const side of sides) $(side + '-complete').checked = true;
  $('batch-id').value = ui`sample-${template.id}-${new Date().toISOString().slice(0, 10)}`;
  await uploadDraft();
}
function renderEditor() {
  const side = state.editorSide;
  const draft = state.draft[side];
  document.querySelectorAll('[data-editor-side]').forEach((b) => {
    b.className = ui`button ${b.dataset.editorSide === side ? 'secondary' : 'ghost'}`;
  });
  $('editor-grid').innerHTML =
    ui`<table><thead><tr><th>Dòng</th>${draft.columns.map((c) => ui`<th>${esc(c)}</th>`).join('')}<th></th></tr></thead><tbody>${draft.rows.map((row, r) => ui`<tr><td>${r + 2}</td>${draft.columns.map((c, col) => ui`<td><input value="${esc(row[col])}" data-editor-row="${r}" data-editor-col="${col}" aria-label="${esc(side)} dòng ${r + 2} cột ${esc(c)}" /></td>`).join('')}<td><button class="remove" data-remove-sample-row="${r}" aria-label="Xóa dòng ${r + 2}">×</button></td></tr>`).join('')}</tbody></table>`;
  $('editor-count').textContent =
    ui`${state.draft.left.rows.length} dòng trái · ${state.draft.right.rows.length} dòng phải · mẫu tối đa 100 dòng mỗi nguồn`;
}
function renderJob(job) {
  state.job = job;
  $('result-state').textContent = {
    staging: t('Đang staging'),
    running: t('Đang matching'),
    complete: t('Hoàn tất'),
    failed: t('Thất bại'),
    cancelled: t('Đã hủy'),
  }[job.state];
  $('result-state').className = ui`state-chip ${job.state}`;
  $('progress').hidden = false;
  const phase =
    job.state === 'staging'
      ? ui`Đang đọc & sắp xếp nguồn ${job.phase === 'left' ? t('trái') : t('phải')} trên đĩa`
      : job.state === 'running'
        ? t('Đang đối soát & lưu kết quả')
        : job.state === 'complete'
          ? t('Đối soát hoàn tất')
          : job.error;
  $('progress-label').textContent = phase;
  $('progress-count').textContent =
    ui`${number(job.stagedLeft)} trái · ${number(job.stagedRight)} phải · ${number(job.processed)} entry`;
  $('progress-detail').textContent = ui`${(job.durationMs / 1000).toFixed(1)} giây · run ${job.id}`;
  if (['complete', 'failed', 'cancelled'].includes(job.state)) {
    $('progress-meter').value = 1;
    $('progress-meter').max = 1;
  } else $('progress-meter').removeAttribute('value');
  $('cancel').hidden = !['staging', 'running'].includes(job.state);
  $('activity').innerHTML = job.logs
    .map((log) => ui`<li><time>${esc(log.time.slice(11, 19))}</time> · ${esc(log.message)}</li>`)
    .join('');
  if (job.summary) {
    const s = job.summary;
    for (const [field, value] of Object.entries({
      total: s.entries,
      matched: s.matchedPairs,
      nonmatched: s.nonMatchedEntries,
      pending: s.pendingEntries,
      manual: s.manualReviewEntries,
    }))
      $('stat-' + field).textContent = number(value);
    $('result-caption').textContent =
      ui`${number(s.internalRows)} dòng trái · ${number(s.partnerRows)} dòng phải · ${(job.durationMs / 1000).toFixed(1)} giây · batch ${job.batchId}`;
    $('raw-output').textContent = [
      ...job.preview,
      { type: 'complete', batchId: job.batchId, runId: job.id, summary: s },
    ]
      .map((event) => JSON.stringify(event, null, 2))
      .join('\n\n');
  } else if (job.preview.length)
    $('raw-output').textContent =
      t('PROVISIONAL — chưa có complete event\n\n') +
      job.preview.map((event) => JSON.stringify(event, null, 2)).join('\n\n');
}
async function run() {
  if (state.busy || !ready()) return;
  resetResults();
  busy(true);
  $('progress').hidden = false;
  $('run').textContent = t('Đang xử lý…');
  try {
    const input = {
      requestId: crypto.randomUUID(),
      batchId: $('batch-id').value.trim(),
      leftId: state.sources.left.id,
      rightId: state.sources.right.id,
      leftComplete: $('left-complete').checked,
      rightComplete: $('right-complete').checked,
      rules: clone(state.rules),
    };
    let job = await post('/api/runs', input);
    renderJob(job);
    while (['staging', 'running'].includes(job.state)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      job = await api('/api/runs/' + job.id);
      renderJob(job);
    }
    if (job.state !== 'complete') throw new Error(job.error ?? t('Batch chưa hoàn tất.'));
    state.offset = 0;
    await loadPage();
    notify(
      ui`Đã đối soát: ${number(job.summary.matchedPairs)} cặp khớp và ${number(job.summary.nonMatchedEntries)} entry không khớp. Nhấn một dòng để xem dữ liệu và lỗi.`,
    );
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    notify(error.message, true);
  } finally {
    $('run').innerHTML = t('Chạy đối soát <span>→</span>');
    busy(false);
    updateExports();
  }
}
function currentFilter() {
  return new URLSearchParams({
    status: $('status-filter').value,
    search: $('search').value.trim(),
  });
}
function updateExports() {
  const completed = state.job?.state === 'complete';
  for (const format of ['csv', 'json', 'ndjson']) {
    const link = $('export-' + format);
    link.setAttribute('aria-disabled', String(!completed));
    if (completed) {
      const params = currentFilter();
      params.set('format', format);
      link.href = ui`/api/runs/${state.job.id}/export?${params}`;
    } else link.removeAttribute('href');
  }
}
async function loadPage() {
  if (state.job?.state !== 'complete') return;
  const revision = ++state.pageRevision;
  const params = currentFilter();
  params.set('offset', state.offset);
  params.set('limit', 20);
  const data = await api(ui`/api/runs/${state.job.id}/results?${params}`);
  if (revision !== state.pageRevision) return;
  state.page = data.rows;
  state.total = data.total;
  $('result-rows').innerHTML = data.rows.length
    ? data.rows
        .map(({ event }, index) => {
          const e = event.entry;
          const keys = state.job.rules.keys
            .map((k) => e.internal?.data[k.left] ?? e.partner?.data[k.right] ?? '')
            .join(' · ');
          return ui`<tr><td><span class="key-value">${esc(keys)}</span></td><td>${e.internal ? ui`<span class="row-line">Dòng ${e.internal.line}</span>` : t('<span class="missing-side">— Chưa tìm thấy</span>')}</td><td>${e.partner ? ui`<span class="row-line">Dòng ${e.partner.line}</span>` : t('<span class="missing-side">— Chưa tìm thấy</span>')}</td><td>${badge(e.status)}${e.statuses.length > 1 ? ui` <small>+${e.statuses.length - 1}</small>` : ''}</td><td><span class="issue-text">${e.issues.length ? e.issues.map((i) => ui`${esc(i.field ?? i.code)}${i.difference ? t(' · Δ ') + esc(i.difference) : ''}`).join('<br />') : t('Các field được chọn đều khớp')}</span></td><td><button class="button small ghost" data-detail="${index}">Xem ↗</button></td></tr>`;
        })
        .join('')
    : t(
        '<tr><td colspan="6"><div class="empty"><h3>Không có kết quả phù hợp</h3><p>Thử đổi bộ lọc hoặc từ khóa tìm kiếm.</p></div></td></tr>',
      );
  $('page-label').textContent = data.total
    ? ui`${number(state.offset + 1)}–${number(state.offset + data.rows.length)} / ${number(data.total)} entry`
    : t('0 entry phù hợp');
  $('previous').disabled = state.offset === 0;
  $('next').disabled = state.offset + 20 >= data.total;
  updateExports();
}
function detail(index) {
  state.detailIndex = index;
  const event = state.page[index]?.event;
  if (!event) return;
  const e = event.entry;
  $('detail-content').innerHTML =
    ui`<p>${e.statuses.map(badge).join(' ')}</p><p class="hint">Các trạng thái trên thuộc kết quả đối soát, không thay đổi trạng thái giao dịch gốc.</p>${e.issues.length ? ui`<div class="detail-issues">${e.issues.map((i) => ui`<p><strong>${esc(i.code)}</strong> ${esc(i.field ?? '')}<br />${esc(i.message)}${i.difference ? ui`<br />Chênh lệch trái − phải: <code>${esc(i.difference)}</code>` : ''}</p>`).join('')}</div>` : ''}<div class="detail-sources"><section><h3>Nguồn trái · dòng ${esc(e.internal?.line ?? '—')}</h3><pre>${esc(JSON.stringify(e.internal ?? null, null, 2))}</pre></section><section><h3>Nguồn phải · dòng ${esc(e.partner?.line ?? '—')}</h3><pre>${esc(JSON.stringify(e.partner ?? null, null, 2))}</pre></section></div><details open><summary>Raw package event · resultKey & issues</summary><pre>${esc(JSON.stringify(event, null, 2))}</pre></details>`;
  $('detail-dialog').showModal();
}
for (const side of sides) {
  $(side + '-file').addEventListener('change', (e) => handleFile(side, e.target.files[0]));
  const zone = $(side + '-drop');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFile(side, e.dataTransfer.files[0]);
  });
}
$('sample-cards').addEventListener('click', (e) => {
  const b = e.target.closest('[data-template]');
  if (b && !state.busy) selectTemplate(b.dataset.template);
});
$('load-sample').addEventListener('click', loadSample);
$('edit-sample').addEventListener('click', () => {
  if (!state.draft || state.busy) return;
  renderEditor();
  $('editor-dialog').showModal();
});
document
  .querySelectorAll('.close-dialog')
  .forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('[data-editor-side]').forEach((button) =>
  button.addEventListener('click', () => {
    state.editorSide = button.dataset.editorSide;
    renderEditor();
  }),
);
$('editor-grid').addEventListener('input', (e) => {
  if (e.target.dataset.editorRow !== undefined)
    state.draft[state.editorSide].rows[Number(e.target.dataset.editorRow)][
      Number(e.target.dataset.editorCol)
    ] = e.target.value;
});
$('editor-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove-sample-row]');
  if (b) {
    state.draft[state.editorSide].rows.splice(Number(b.dataset.removeSampleRow), 1);
    renderEditor();
  }
});
$('add-sample-row').addEventListener('click', () => {
  const draft = state.draft[state.editorSide];
  if (draft.rows.length >= 100) {
    notify(t('Trình sửa mẫu hỗ trợ tối đa 100 dòng mỗi nguồn.'), true);
    return;
  }
  draft.rows.push(draft.columns.map(() => ''));
  renderEditor();
});
$('editor-upload').addEventListener('click', () => uploadDraft());
$('editor-run').addEventListener('click', () => uploadDraft(true));
$('key-rows').addEventListener('change', (e) => {
  if (e.target.dataset.key !== undefined) {
    state.rules.keys[Number(e.target.dataset.key)][e.target.dataset.field] = e.target.value;
    busy(state.busy);
  }
});
$('key-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove-key]');
  if (b && state.rules.keys.length > 1) {
    state.rules.keys.splice(Number(b.dataset.removeKey), 1);
    renderRules();
  }
});
$('add-key').addEventListener('click', () => {
  state.rules.keys.push({
    left: state.sources.left.columns[0],
    right: state.sources.right.columns[0],
  });
  renderRules();
});
$('comparison-rows').addEventListener('input', (e) => {
  if (e.target.dataset.comparison !== undefined) {
    const rule = state.rules.comparisons[Number(e.target.dataset.comparison)];
    rule[e.target.dataset.field] = e.target.value;
  }
});
$('comparison-rows').addEventListener('change', (e) => {
  if (e.target.dataset.comparison !== undefined && e.target.dataset.field === 'kind') renderRules();
});
$('comparison-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove-comparison]');
  if (b && state.rules.comparisons.length > 1) {
    state.rules.comparisons.splice(Number(b.dataset.removeComparison), 1);
    renderRules();
  }
});
$('add-comparison').addEventListener('click', () => {
  state.rules.comparisons.push({
    name: ui`field-${Date.now()}`,
    left: state.sources.left.columns[0],
    right: state.sources.right.columns[0],
    kind: 'exact',
    status: 'FIELD_MISMATCH',
    tolerance: '0',
    missing: 'pending',
  });
  renderRules();
});
$('run').addEventListener('click', run);
$('cancel').addEventListener('click', async () => {
  if (!state.job) return;
  try {
    await post(ui`/api/runs/${state.job.id}/cancel`, {});
    notify(t('Đã yêu cầu hủy. Đợi worker dừng và đóng các cursor.'));
  } catch (error) {
    notify(error.message, true);
  }
});
$('clear').addEventListener('click', async () => {
  if (state.busy) return;
  try {
    await api('/api/session', { method: 'DELETE' });
    state.sources = {};
    state.rules = { keys: [], comparisons: [] };
    state.draft = undefined;
    for (const side of sides) {
      $(side + '-file').value = '';
      $(side + '-complete').checked = false;
      renderSource(side);
    }
    resetResults();
    renderRules();
    notify(t('Đã xóa file và kết quả của phiên.'));
  } catch (error) {
    notify(error.message, true);
  }
});
$('result-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-detail]');
  if (b) detail(Number(b.dataset.detail));
});
const refresh = () => {
  state.offset = 0;
  loadPage().catch((error) => notify(error.message, true));
};
$('status-filter').addEventListener('change', refresh);
let searchTimer;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 250);
});
document.querySelectorAll('[data-filter]').forEach((button) =>
  button.addEventListener('click', () => {
    if (state.job?.state === 'complete') {
      $('status-filter').value = button.dataset.filter;
      refresh();
    }
  }),
);
$('previous').addEventListener('click', () => {
  state.offset = Math.max(0, state.offset - 20);
  loadPage().catch((e) => notify(e.message, true));
});
$('next').addEventListener('click', () => {
  state.offset += 20;
  loadPage().catch((e) => notify(e.message, true));
});
try {
  const [session, catalog] = await Promise.all([api('/api/session'), api('/samples/catalog.json')]);
  state.catalog = catalog;
  state.maxUploadBytes = Math.min(session.maxUploadBytes, 3_000_000);
  $('upload-limit').textContent =
    ui`Tối đa ${number(state.maxUploadBytes / 1_000_000)} MB mỗi file.`;
  selectTemplate('bank');
  $('batch-id').value = ui`batch-${new Date().toISOString().slice(0, 10)}`;
  let previous = session.jobs.at(-1);
  if (previous) {
    for (const side of sides) {
      state.sources[side] = session.sources.find(
        (source) => source.sourceId === previous.sources[side],
      );
      $(side + '-complete').checked = previous.completeness[side];
      renderSource(side);
    }
    state.rules = clone(previous.rules);
    $('batch-id').value = previous.batchId;
    renderRules();
    renderJob(previous);
    busy(true);
    while (['staging', 'running'].includes(previous.state)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      previous = await api('/api/runs/' + previous.id);
      renderJob(previous);
    }
    if (previous.state === 'complete') await loadPage();
    notify(
      previous.error ?? t('Đã khôi phục file, quy tắc và kết quả gần nhất của phiên.'),
      previous.state !== 'complete',
    );
  } else if (session.sources.length) {
    for (const side of sides) {
      state.sources[side] = session.sources.findLast((source) =>
        source.sourceId.startsWith(side + ':'),
      );
      renderSource(side);
    }
    chooseRules();
    notify(t('Đã khôi phục các file đã upload. Kiểm tra quy tắc và tính đầy đủ trước khi chạy.'));
  }
  busy(false);
  updateExports();
} catch (error) {
  notify(t('Không kết nối được server: ') + error.message, true);
  busy(true);
}

// Re-render presentation while preserving inputs, uploaded data, filters, and job state.
document.addEventListener('languagechange', () => {
  for (const side of sides) renderSource(side);
  if (state.template) selectTemplate(state.template.id);
  renderRules();
  if (state.job) {
    renderJob(state.job);
    loadPage().catch((error) => notify(error.message, true));
  } else resetResults();
  if (state.draft && $('editor-dialog').open) renderEditor();
  if ($('detail-dialog').open && state.detailIndex !== undefined) detail(state.detailIndex);
});
