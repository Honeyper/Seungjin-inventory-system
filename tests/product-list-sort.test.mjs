import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../frontend/admin.js', import.meta.url), 'utf8');
const extract = name => source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'))[0];
const context = vm.createContext({ Intl, Date });
vm.runInContext(extract('sortProductList'), context);
const sort = (rows, mode) => Array.from(context.sortProductList(rows, mode));
const codes = rows => rows.map(row => row.productCode);
const rows = [
  {clientName:'나래', productName:'용기 1',productCode:'N-1',registeredAt:'2026.09.17'},
  {clientName:'㈜가람', productName:'용기 10',productCode:'G-10',registeredAt:'2026-09-16'},
  {clientName:'(주)가람', productName:'용기 2',productCode:'G-2',registeredAt:'2026.9.9'},
  {clientName:'주식회사 가람', productName:'용기 2',productCode:'G-11',registeredAt:'2026/09/17'},
];
test('default groups companies ignoring legal prefixes and naturally sorts names then codes', () => {
  assert.deepEqual(codes(sort(rows)), ['G-2','G-11','G-10','N-1']);
  assert.deepEqual(codes(sort([...rows].reverse())), codes(sort(rows)));
  assert.deepEqual(codes(rows), ['N-1','G-10','G-2','G-11']);
});
test('name and code modes sort all products before pagination', () => {
  assert.deepEqual(codes(sort(rows,'name')), ['N-1','G-2','G-11','G-10']);
  assert.deepEqual(codes(sort(rows,'code')), ['G-2','G-10','G-11','N-1']);
  const first = sort(rows).slice(0,2), second = sort(rows).slice(2,4);
  assert.deepEqual(codes([...first,...second]), ['G-2','G-11','G-10','N-1']);
});
test('recent dates handle mixed formats and place invalid or missing dates last', () => {
  const list = [...rows,
    {clientName:'가람',productName:'용기 0',productCode:'G-0',registeredAt:'2026-02-30'},
    {clientName:'가람',productName:'용기 9',productCode:'G-9',registeredAt:''}];
  assert.deepEqual(codes(sort(list,'recent')), ['G-11','N-1','G-10','G-2','G-0','G-9']);
});
test('missing text stays last; unique identity gives repeatable ties', () => {
  const list = [
    {clientName:'-',productCode:'A-0'},
    {clientName:'가람',productName:'용기',productCode:'G-1',productId:'id-2'},
    {clientName:'가람',productName:'용기',productCode:'G-1',productId:'id-1'}];
  assert.deepEqual(sort(list).map(row=>row.productId || '-'), ['id-1','id-2','-']);
});
test('actual filtering applies selected ordering while preserving source records', () => {
  const state = {products:rows,filteredProducts:[],query:'용기',clientFilter:'',productSort:'name'};
  const ctx = vm.createContext({Intl,Date,state,productSortHint:{textContent:''},normalizeSearchText:v=>String(v||'').toLowerCase(),renderSummary(){},renderProducts(){}});
  vm.runInContext(extract('sortProductList')+'\n'+extract('applyFilters'),ctx);
  ctx.applyFilters();
  assert.deepEqual(Array.from(state.filteredProducts,row=>row.productCode),['N-1','G-2','G-11','G-10']);
  state.query='';state.clientFilter='(주)가람';ctx.applyFilters();
  assert.deepEqual(Array.from(state.filteredProducts,row=>row.productCode),['G-2']);
  state.clientFilter='';state.query='없는제품';ctx.applyFilters();
  assert.equal(state.filteredProducts.length,0);
  assert.deepEqual(codes(rows),['N-1','G-10','G-2','G-11']);
});
