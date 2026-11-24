import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

/** RFC 4180 CSV (quoted fields, "" escape, CRLF, UTF-8 BOM) → rows keyed by header name; empty lines are dropped. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...body] = rows;
  return body.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// Self-check: node lib/csv.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.deepEqual(parseCsv('﻿a,b\r\n1,"x, ""y"""\r\n\r\n"multi\nline",\n'), [
    { a: '1', b: 'x, "y"' },
    { a: 'multi\nline', b: '' },
  ]);
  console.log('csv ok');
}
