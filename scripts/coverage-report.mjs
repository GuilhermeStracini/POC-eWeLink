#!/usr/bin/env node
// Turns the backend and frontend lcov reports into one Markdown table.
//
//   node scripts/coverage-report.mjs            → prints the table
//   node scripts/coverage-report.mjs --check 80 → also fails when total line coverage is below 80%
//
// Used by the Build and Release workflows for the job summary and the PR comment.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packages = [
  { name: 'backend', lcov: 'backend/coverage/lcov.info' },
  { name: 'frontend', lcov: 'frontend/coverage/lcov.info' },
];

const checkIndex = process.argv.indexOf('--check');
const minimumLines = checkIndex === -1 ? null : Number(process.argv[checkIndex + 1]);

function emptyTotals() {
  return { lines: [0, 0], branches: [0, 0], functions: [0, 0], files: 0, uncovered: [] };
}

// lcov: one record per file, ended by end_of_record. We only need the totals
// (LF/LH lines, BRF/BRH branches, FNF/FNH functions) plus the file name for the
// list of files that are not fully covered.
function parseLcov(text) {
  const totals = emptyTotals();
  for (const record of text.split('end_of_record')) {
    const get = (key) => Number((record.match(new RegExp(`^${key}:(\\d+)`, 'm')) || [])[1] ?? 0);
    const file = (record.match(/^SF:(.+)$/m) || [])[1];
    if (!file) continue;
    totals.files += 1;
    const [lf, lh, brf, brh, fnf, fnh] = ['LF', 'LH', 'BRF', 'BRH', 'FNF', 'FNH'].map(get);
    totals.lines[0] += lf; totals.lines[1] += lh;
    totals.branches[0] += brf; totals.branches[1] += brh;
    totals.functions[0] += fnf; totals.functions[1] += fnh;
    if (lh < lf) totals.uncovered.push({ file, pct: lf ? (100 * lh) / lf : 100 });
  }
  return totals;
}

const pct = ([found, hit]) => (found === 0 ? 100 : (100 * hit) / found);
const show = (counts) => `${pct(counts).toFixed(1)}% (${counts[1]}/${counts[0]})`;

const rows = [];
const overall = emptyTotals();
const missing = [];

for (const pkg of packages) {
  const file = path.join(root, pkg.lcov);
  if (!existsSync(file)) {
    missing.push(pkg.name);
    rows.push(`| ${pkg.name} | – | – | – | – |`);
    continue;
  }
  const totals = parseLcov(readFileSync(file, 'utf8'));
  rows.push(`| ${pkg.name} | ${show(totals.lines)} | ${show(totals.branches)} | ${show(totals.functions)} | ${totals.files} |`);
  for (const key of ['lines', 'branches', 'functions']) {
    overall[key][0] += totals[key][0];
    overall[key][1] += totals[key][1];
  }
  overall.files += totals.files;
  overall.uncovered.push(...totals.uncovered.map((entry) => ({ ...entry, file: `${pkg.name}/${entry.file}` })));
}

const lines = [
  '### Test coverage',
  '',
  '| Package | Lines | Branches | Functions | Files |',
  '| :--- | ---: | ---: | ---: | ---: |',
  ...rows,
  `| **Total** | **${show(overall.lines)}** | **${show(overall.branches)}** | **${show(overall.functions)}** | **${overall.files}** |`,
];

if (overall.uncovered.length) {
  lines.push('', '<details><summary>Files with uncovered lines</summary>', '');
  for (const entry of overall.uncovered.sort((a, b) => a.pct - b.pct)) {
    lines.push(`- \`${entry.file}\` — ${entry.pct.toFixed(1)}% of lines`);
  }
  lines.push('', '</details>');
}
if (missing.length) {
  lines.push('', `> No coverage report was found for: ${missing.join(', ')}.`);
}

console.log(lines.join('\n'));

if (missing.length) {
  process.exitCode = 1;
} else if (minimumLines !== null && pct(overall.lines) < minimumLines) {
  console.error(`\nTotal line coverage ${pct(overall.lines).toFixed(1)}% is below the required ${minimumLines}%.`);
  process.exitCode = 1;
}
