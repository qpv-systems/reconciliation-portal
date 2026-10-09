import { createReadStream } from 'node:fs';
import { Transform } from 'node:stream';
import { parse } from 'csv-parse';
import { readExcelRows } from '@qpv-systems/core-reconcile/excel';

export async function* sourceRows(source, signal, onColumns = () => {}) {
  if (source.format === 'xlsx') {
    let known = false;
    for await (const row of readExcelRows(source.path, {
      sourceId: source.sourceId,
      getId: (_record, context) => `row-${context.rowNumber}`,
      sheet: source.sheet,
      headerRow: source.headerRow,
      signal,
      maxInputBytes: source.maxUploadBytes,
      maxExpandedBytes: 512 * 1024 * 1024,
      maxRowChars: 65536,
      tempDirectory: source.tempDirectory,
    })) {
      if (!known) {
        onColumns(Object.keys(row.data));
        known = true;
      }
      yield row;
    }
    if (!known) throw new Error('The selected Excel sheet has no data rows.');
    return;
  }
  let header;
  const parser = parse({
    bom: true,
    skip_empty_lines: true,
    cast: false,
    info: true,
    delimiter: source.delimiter,
    max_record_size: 65536,
    columns: (columns) => {
      if (
        columns.length > 256 ||
        columns.some(
          (c) => !c || c.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(c),
        ) ||
        new Set(columns).size !== columns.length
      )
        throw new Error(
          'CSV headers must be unique, non-empty and at most 256 columns/characters.',
        );
      header = columns;
      onColumns(columns);
      return columns;
    },
  });
  const input = createReadStream(source.path, { highWaterMark: 16 * 1024, signal });
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const decoder = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        callback(null, utf8.decode(chunk, { stream: true }));
      } catch {
        callback(new Error('CSV must contain valid UTF-8 text.'));
      }
    },
    flush(callback) {
      try {
        callback(null, utf8.decode());
      } catch {
        callback(new Error('CSV must contain valid UTF-8 text.'));
      }
    },
  });
  const forwardError = (error) => parser.destroy(error);
  input.on('error', forwardError);
  decoder.on('error', forwardError);
  input.pipe(decoder).pipe(parser);
  try {
    for await (const item of parser) {
      signal?.throwIfAborted();
      // For multiline CSV, line is the physical end line of the record.
      yield {
        id: `line-${item.info.lines}`,
        line: item.info.lines,
        data: item.record,
      };
    }
    if (!header) throw new Error('CSV file has no header.');
  } finally {
    input.destroy();
    decoder.destroy();
    parser.destroy();
    input.off('error', forwardError);
    decoder.off('error', forwardError);
  }
}

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+@\-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
