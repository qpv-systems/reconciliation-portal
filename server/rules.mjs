import { createHash } from 'node:crypto';

const statuses = new Set([
  'AMOUNT_MISMATCH',
  'FEE_MISMATCH',
  'STATUS_MISMATCH',
  'CURRENCY_MISMATCH',
  'TYPE_MISMATCH',
  'FIELD_MISMATCH',
]);
export function makeRules(options, sources) {
  if (!options || typeof options !== 'object') throw new Error('Rules are required.');
  if (!Array.isArray(options.keys) || options.keys.length < 1 || options.keys.length > 8)
    throw new Error('Choose 1–8 stable identifier components.');
  if (
    !Array.isArray(options.comparisons) ||
    options.comparisons.length < 1 ||
    options.comparisons.length > 20
  )
    throw new Error('Choose 1–20 comparisons.');
  const select = (side, column) => {
    if (typeof column !== 'string' || !sources[side].columns.includes(column))
      throw new Error(`Unknown ${side} column: ${String(column)}`);
    return (row) => row[column];
  };
  const keys = [
    {
      name: 'canonical',
      internal: options.keys.map((k) => select('left', k.left)),
      partner: options.keys.map((k) => select('right', k.right)),
    },
  ];
  const names = new Set();
  const comparisons = options.comparisons.map((rule) => {
    if (
      !rule ||
      typeof rule.name !== 'string' ||
      !rule.name.trim() ||
      rule.name.length > 100 ||
      names.has(rule.name)
    )
      throw new Error('Comparison names must be unique, non-empty and at most 100 characters.');
    names.add(rule.name);
    if (
      !['exact', 'decimal'].includes(rule.kind) ||
      !statuses.has(rule.status) ||
      !['pending', 'review', 'ignore'].includes(rule.missing)
    )
      throw new Error('Invalid comparison policy.');
    const tolerance = rule.tolerance ?? '0';
    if (
      rule.kind === 'decimal' &&
      (typeof tolerance !== 'string' ||
        tolerance.length > 100 ||
        !/^\d+(?:\.\d+)?$/.test(tolerance))
    )
      throw new Error('Tolerance must be a non-negative decimal string, such as 0 or 0.01.');
    return {
      name: rule.name,
      kind: rule.kind,
      internal: select('left', rule.left),
      partner: select('right', rule.right),
      mismatchStatus: rule.status,
      missing: rule.missing,
      ...(rule.kind === 'decimal' ? { tolerance } : {}),
    };
  });
  // Financial policies are only those explicitly supplied by the user.
  const canonical = JSON.stringify({ keys: options.keys, comparisons: options.comparisons });
  const version = `portal-v1-${createHash('sha256').update(canonical).digest('hex')}`;
  return { version, keys, comparisons };
}
