import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Input comes from a reviewed, read-only canonical snapshot. Tokens are minted by
// the operator via the existing RPC and never appear in logs or the repository.
const [sourceFile, tokenFile, outputDirectory, mode] = process.argv.slice(2);
if (!sourceFile || !tokenFile || !outputDirectory || !['inspect', 'apply'].includes(mode)) {
  throw new Error('Usage: node tools/sheet-backup-recovery.mjs snapshot.json tokens.json output-directory inspect|apply');
}
const snapshot = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const tokens = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
const config = JSON.parse(fs.readFileSync(new URL('./apps-script-env.json', import.meta.url), 'utf8')).environments.prod;
fs.mkdirSync(outputDirectory, {recursive: true});
let tokenIndex = 0;
const api = async (action, payload) => {
  const token = tokens[tokenIndex++];
  if (!token) throw new Error('One-use tokens exhausted; obtain a new token set.');
  const response = await fetch(config.webAppUrl, {
    method: 'POST', body: JSON.stringify({action, payload: {...payload, token}}),
    signal: AbortSignal.timeout(120000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`${action}: ${result.message || response.status}`);
  return result.data;
};
const configs = [
  ['products', snapshot.targets.productIds, 'productId'],
  ['orders', snapshot.targets.orderIds, 'purchaseOrderId'],
  ['stock', snapshot.targets.managementIds, 'managementId'],
  ['boxes', snapshot.targets.managementIds, 'managementId']
];
const report = {version: snapshot.version, cutoffId: snapshot.cutoffId, outboxIds: snapshot.outboxIds, datasets: []};
for (const [dataset, keys, field] of configs) {
  if (!keys.length) continue;
  assert.ok(snapshot[dataset].every(record => record[field] && keys.includes(record[field])), `${dataset}: snapshot must include scalar identity columns as well as JSON data`);
  const before = await api('readSheetBackupRows', {dataset, keys});
  fs.writeFileSync(path.join(outputDirectory, `${dataset}-before.json`), JSON.stringify(before));
  console.log(JSON.stringify({dataset, before: before.rows.length, canonical: snapshot[dataset].length}));
  if (mode !== 'apply') continue;
  for (let offset = 0; offset < keys.length; offset += 10) {
    const batch = keys.slice(offset, offset + 10);
    const records = snapshot[dataset].filter(record => batch.includes(record[field]));
    const result = await api('applySheetBackupRows', {dataset, keys: batch, records});
    assert.equal(result.written, records.length);
    console.log(JSON.stringify({dataset, batch: offset / 10 + 1, written: result.written, removed: result.removed}));
  }
  const after = await api('readSheetBackupRows', {dataset, keys});
  fs.writeFileSync(path.join(outputDirectory, `${dataset}-after.json`), JSON.stringify(after));
  const column = after.headers.indexOf('Supabase 원본(JSON)');
  assert.ok(column >= 0, `${dataset}: canonical backup column missing`);
  const actual = after.rows.map(entry => JSON.parse(entry.row[column]));
  const identity = row => dataset === 'boxes' ? row.boxId : dataset === 'stock'
    ? `${row.managementId}|${row.productId}|${row.storage}` : row[field];
  const sort = rows => [...rows].sort((a,b) => identity(a).localeCompare(identity(b)));
  if (JSON.stringify(sort(actual)) !== JSON.stringify(sort(snapshot[dataset]))) {
    // Avoid dumping operational data to terminal logs when verification fails.
    throw new Error(`${dataset}: reread does not match canonical snapshot (${actual.length}/${snapshot[dataset].length} rows); inspect saved before/after files`);
  }
  report.datasets.push({dataset, rows: actual.length, verified: true});
  fs.writeFileSync(path.join(outputDirectory, 'verified.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({dataset, verified: actual.length}));
}
if (mode === 'apply') console.log(JSON.stringify({verified: true, outboxCount: report.outboxIds.length, datasets: report.datasets}));
