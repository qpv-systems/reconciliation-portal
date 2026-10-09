# Reconciliation Portal

A file-upload playground for [`@qpv-systems/core-reconcile`](https://github.com/qpv-systems/core-reconcile). Upload two datasets, choose their matching identifiers and comparison fields, then inspect real package outputs and download reports.

The portal consumes the core through its **npm dependency**. This repository contains the application, adapters for HTTP uploads/CSV, and synthetic sample datasets. Reconciliation rules and matching are handled by the installed package.

## Quickstart

Requires **Node.js 22.18+**. Use Node.js 24 for deployment.

```sh
git clone https://github.com/qpv-systems/reconciliation-portal.git
cd reconciliation-portal
npm install
npm start
```

Open **http://127.0.0.1:4173**. No separate frontend build is needed.

The declared dependency is `@qpv-systems/core-reconcile@^0.1.0`. Registry installation and Docker builds require that package to be published first. If npm returns 404 before publication, the maintainer must publish the core; a Git push does not publish to npm. For local testing only, a separately built core tarball can be installed with `npm install --no-save --package-lock=false /path/to/qpv-systems-core-reconcile-0.1.0.tgz`. The tarball and core source are not committed to this repository.

## Try a reconciliation

1. Select a domain template and click **Dùng bộ mẫu này**, or upload your own left/right `.csv` or `.xlsx` files, **up to 3 MB each** (3,000,000 bytes).
2. Inspect the first five rows. Set CSV delimiter or Excel sheet/header row **before** upload. Confirm each source is complete only when your business batch is complete.
3. Choose the matching columns for each source. Add components for a composite identifier, such as SKU + warehouse or employee + pay period.
4. Choose comparison fields, their meaning, exact/decimal comparison, absolute tolerance, and missing-value policy.
5. Click **Chạy đối soát**. Watch staging/matching progress and inspect the finished results.
6. Filter by status or search original values, open an entry for its source rows/issues/raw event, and export the selected results.

Names can differ between sources: `commission_id` can match `commission_ref`; `commission_amount` can compare with `payout`. User-selected columns and policies are sent to the server; the portal never executes user-supplied code.

### Download or edit samples

Every template includes two downloadable CSV files and two downloadable XLSX files. Download, edit, and upload them again, or click **Sửa dữ liệu mẫu** to edit cells directly in the browser. You can add/remove rows and switch between sides. **Upload hai nguồn** saves the edited inputs for configuring rules. **Upload & đối soát** uploads both edited datasets and immediately runs the current rules.

The editor modifies the complete synthetic template, up to 100 rows per side. Uploaded personal files have a read-only five-row preview; editing a preview cannot accidentally truncate a large uploaded dataset. All template values are strings, including IDs, dates and decimals. Synthetic templates explicitly represent complete batches, so their completeness checkboxes start checked. Your own uploaded files require your own confirmation.

| Domain      | Matching identifier                | Comparison fields                                                                                                                |
| ----------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Banking     | `transaction_id`                   | Amount, fee, original transaction status, currency, transaction type. Includes refund events, duplicate IDs and missing amounts. |
| Commissions | `commission_id` ↔ `commission_ref` | Commission/payout, adjustment, currency, approval state, agent.                                                                  |
| Orders      | `order_id` ↔ `reference_id`        | Order total, shipping fee, original status, currency.                                                                            |
| Inventory   | SKU + warehouse                    | Quantity and reserved quantity; field mismatches rather than financial amount statuses.                                          |
| Invoices    | Invoice number                     | Net amount, tax, currency, payment status. Includes a decimal beyond JavaScript's safe integer range.                            |
| Payroll     | Employee + pay period              | Gross salary, deduction, currency.                                                                                               |

Templates are examples of explicit rules, not universal accounting policies. There is no automatic FX conversion, tax calculation, refund netting, status mapping, amount/time matching, payment execution, or financial update. Add transformations upstream when your business needs them.

## Understand the results

The UI uses **left/right** labels. Core output uses **internal/partner**; in this portal `internal` = left and `partner` = right. These are roles, not restrictions on where data came from. Refreshing the page restores the session's most recent run, its source previews, rules and completed results; a running job resumes progress polling. Unsaved editor cells exist only in the browser and are not restored.

| Status              | Meaning                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `MATCHED`           | Both source rows were uniquely paired and all selected comparisons passed.                            |
| `MISSING_INTERNAL`  | Right has a record without a matching left record; the left batch was explicitly confirmed complete.  |
| `MISSING_PARTNER`   | Left has a record without a matching right record; the right batch was explicitly confirmed complete. |
| `AMOUNT_MISMATCH`   | A comparison configured as an amount differs outside the absolute decimal tolerance.                  |
| `FEE_MISMATCH`      | A configured fee comparison differs.                                                                  |
| `STATUS_MISMATCH`   | The original record status fields differ. This does not change either record's status.                |
| `CURRENCY_MISMATCH` | Currency values differ; the package does not convert them.                                            |
| `TYPE_MISMATCH`     | Record/event types differ.                                                                            |
| `FIELD_MISMATCH`    | Another configured field differs, such as inventory quantity or a deduction.                          |
| `PENDING_RECHECK`   | Missing comparison data, or a counterpart is absent while its source batch is not confirmed complete. |
| `MANUAL_REVIEW`     | Ambiguous duplicate matching keys, invalid values, or another issue requiring investigation.          |

One entry can have multiple `statuses`; `status` is the core's primary status. Filters use **all** statuses. Status counts can overlap; pending/manual counts are subsets of non-matched results. Total entries count result units, not the sum of both input row counts. A unique matched pair uses two input rows but produces one entry. Duplicate-key rows are not silently paired.

Missing comparison values default to **pending**. Choose **review** to request manual investigation, or explicitly choose **ignore** to skip that comparison when missing. Ignore can allow a match even if that selected value is absent. Empty/missing matching identifiers instead fail the batch with a physical row reference; fix them before retrying.

Decimal inputs must be strings such as `1200.50` or `-10.25`, and tolerance must be non-negative, e.g. `0.01`. No locale-based numeric cleaning is inferred. `difference` is signed **left minus right**. Exact comparisons preserve original case, whitespace, types and status values. XLSX numeric text is preserved by the core adapter, but formatting such as leading zeroes and date display styles is not reconstructed; store identifiers as text. Excel formulas are rejected, and `.xls` is unsupported.

### Actual package output

The server stores the unmodified events from `reconcileSorted()`:

```js
{ type: 'entry', entry: { resultKey, status, statuses, internal, partner, matchedBy, issues } }
{ type: 'complete', batchId, runId, summary }
```

`entry` is one reconciliation outcome. `complete` means the generator finished, **not** that every record matched or that both business batches were complete. The UI shows up to three raw entry events and the final completion event. Each result's inspector shows its complete raw event, original data, source IDs/physical lines, and all issues. The server logs the first three entries and the complete event so large jobs do not flood the console. It also logs upload, stage, progress, cancellation and failure events.

| Export | Contents                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV    | Every selected entry, primary/all statuses, stable result key, both IDs/line references, matched keys, detailed issues, original data as JSON. Spreadsheet formula prefixes are escaped. |
| JSON   | Run metadata, submitted rules, source references, completeness, whole-run summary, filter and every selected entry.                                                                      |
| NDJSON | Unmodified core events for selected entries, plus the original complete event. The complete summary describes the **whole run**, including when entry filtering is applied.              |

Downloads stream from server storage with backpressure and are not limited to the UI page/preview. Use the MATCHED filter when collecting approved source rows for your own downstream processing; the portal does not insert/update your system. An invalid/interrupted run cannot be exported as a completed result.

## Server architecture and limits

```text
Browser file / edited template
  → streamed HTTP upload → immutable temporary file + SHA-256
  → CSV stream or core's Excel adapter
  → transactional SQLite staging + matching-key index
  → sorted SQLite cursors → core.reconcileSorted()
  → persisted raw events → paginated UI / streaming report
```

CSV parsing uses [`csv-parse`](https://csv.js.org/parse/options/) with BOM, quoted/multiline fields, strict column counts and bounded record size. CSV row references identify the physical **end line** of a multiline record. The core Excel adapter stages ZIP content/shared strings on disk. SQLite matching keys are UTF-16 big-endian BLOBs so the indexed cursor order agrees with the core's JavaScript sort order, including Unicode IDs. The frontend never loads full uploaded files or all output entries into RAM.

| Limit                 | Default                                                         |
| --------------------- | --------------------------------------------------------------- |
| Per file              | 3 MB (3,000,000 bytes), enforced by UI and backend              |
| Rows per source       | 2,000,000 (`MAX_ROWS`)                                          |
| SQLite file per run   | 1 GiB (`MAX_JOB_BYTES`), checked at commit checkpoints          |
| XLSX expanded content | 512 MiB                                                         |
| CSV / Excel record    | 64 KiB characters; max 256 unique non-empty CSV headers         |
| Matching group        | 1,000 combined rows and 4 MiB staged JSON payload; excess fails |
| Source uploads / runs | 8 / 3 per session; clear the session to continue                |
| Active uploads / runs | 2 uploads / 1 run per server process                            |
| Sessions              | 8 per process                                                   |
| Retention             | 30 minutes without activity, or manual clear                    |
| UI result page        | 20 entries; API maximum 50                                      |

Data is temporary, not a durable audit database. Sessions use unguessable HttpOnly/SameSite cookies and separate storage; source/run IDs from another session are inaccessible. Requests from other origins are rejected. Manual clear/expiry/graceful shutdown removes owned temporary files. An abrupt process kill can leave orphan temporary directories for your host to clean. Server restart does not recover jobs or history. Disk budgets are checkpoint limits, not operating-system quotas; set hosting storage/resource limits as well.

One process permits one worker at a time. `requestId` makes identical HTTP submission retries reuse the same run; conflicting data under the same ID gets HTTP 409. A new attempt uses a new run ID and preserves prior run history during the session. Identical uploads on the same side with the same parsing settings reuse the existing immutable snapshot. Source IDs include the content hash and parsing settings; result keys come from the core. SQLite transactions and unique source/event constraints protect local writes. This is single-instance coordination; horizontal deployments need shared storage and distributed worker/session management.

## Development and verification

```sh
npm run dev
npm run check
npm run format:check
npm test
npm run test:memory
```

Integration tests exercise actual npm imports, unsorted CSV, all six CSV/XLSX presets, exact large decimals, refund rows, duplicates, missing/incomplete data, retry history, concurrent submissions, cancellation, malformed files, upload limits, origin/session isolation, Unicode ordering and report completeness. The memory check processes 50,000 pairs end to end under a 64 MiB V8 old-space budget with inputs below the 3 MB cap. RSS also includes native SQLite/Node buffers and is not limited to 64 MiB. Larger-data benchmarks belong in the core package; the playground never raises its upload cap for benchmarks.

CI always runs source checks. Before the core npm release exists, its summary explicitly states that npm integration tests **did not run**. After `0.1.0` is published, re-run CI: it installs npm dependencies and runs formatting, integration tests on Windows/Linux with Node 22.18/24, and the memory check. Add the generated npm lockfile after the registry release and switch to `npm ci` for reproducible installations; the current repository does not commit a lockfile pointing to a local tarball.

The upload cap is intentionally small because this website is a playground. `MAX_UPLOAD_BYTES` can lower the limit; values above 3,000,000 are clamped to 3,000,000. Oversized files are rejected by the browser before upload and by the backend with HTTP 413, including requests without Content-Length. The limit applies to the uploaded file; XLSX expanded content has its own separate bound.

## Deploy a website

This application needs a **Node server and writable temporary disk**; static GitHub Pages cannot run upload, Excel and reconciliation endpoints. It includes a Dockerfile for a container host:

```sh
docker build -t reconciliation-portal .
docker run --rm -p 4173:4173 -e HOST=0.0.0.0 reconciliation-portal
```

Environment values are listed in `.env.example`. Node can load a copied local `.env` with `node --env-file=.env server/index.mjs`. The default `npm start` reads environment variables supplied by your shell/host. For HTTPS behind a proxy, set `PUBLIC_ORIGIN=https://your-domain.example` and `COOKIE_SECURE=1`; expose only that origin. Use a single application instance until shared coordination is implemented. Add host authentication/access controls when allowing sensitive uploads. Temporary files and console samples contain original data: restrict access to disk/logs accordingly.

This repository prepares the website application; pushing source does not provision a hosting provider or publish the core package.

## License

MIT. See [LICENSE](LICENSE).
