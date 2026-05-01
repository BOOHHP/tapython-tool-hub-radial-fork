import type { OutputMode } from './types.js';

export function printHuman(lines: string | string[]): void {
  const output = Array.isArray(lines) ? lines.join('\n') : lines;
  process.stdout.write(`${output}\n`);
}

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
  printHuman(headers.map((h, i) => pad(h, widths[i])).join('  '));
  printHuman(widths.map(w => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    printHuman(row.map((c, i) => pad(c ?? '', widths[i])).join('  '));
  }
}

export function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`);
}

export function output(mode: OutputMode, humanLines: string | string[], jsonData: unknown): void {
  if (mode === 'json') {
    printJson(jsonData);
  } else {
    printHuman(humanLines);
  }
}
