import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { adminSource, loadFunctions } from './helpers/frontend-runtime.mjs';

const html = readFileSync(new URL('../frontend/admin.html', import.meta.url), 'utf8');
const ids = ['inventoryClientFilter', 'inventoryStorageFilter', 'inventoryStockFilter', 'inventoryProcessFilter'];
function selectFromHtml(markup) {
  let options = [], value = '';
  const select = {
    get value() { return value; }, set value(next) { value = options.some(o => o.value === next) ? next : ''; },
    get selectedOptions() { return options.filter(o => o.value === value).slice(0,1); },
    get innerHTML() { return markup; }, set innerHTML(next) {
      markup = next;
      options = [...next.matchAll(/<option\b([^>]*)>([^]*?)<\/option>/g)].map(([, attributes, text]) => ({
        value: attributes.match(/\bvalue="([^"]*)"/)?.[1] ?? text,
        hasAttribute: name => name === 'value' && /\bvalue=/.test(attributes)
      }));
      value = options[0]?.value || '';
    }
  };
  select.innerHTML = markup;
  return select;
}
function runtime(selects) {
  let displayedRows = [];
  const rows = Array.from({length:1183}, (_, index) => ({ managementId:'IN-'+index, productName:'제품 '+index,
    clientName:'거래처', storage:'A', stockStatus:'보관', processStatus:'1도', currentTotalQuantity:100 }));
  const h = loadFunctions(adminSource, ['renderSelectOptions', 'renderInventoryFilterOptions', 'syncInventoryFilterState', 'applyInventoryFilters', ...(adminSource.includes('function matchesInventoryStockFilter(') ? ['normalizeInventoryCategory','matchesInventoryStockFilter'] : [])], {
    INVENTORY_CATEGORY_FILTERS:['자사재고','사출 보관재고'],
    ...Object.fromEntries(ids.map((id,i) => [id,selects[i]])), inventorySearch:{value:''},
    state:{inventoryRows:rows,inventoryFilters:{},filteredInventoryRows:[]},
    escapeHtml:String,escapeAttribute:String,normalizeSearchText:value=>String(value||'').toLowerCase(),
    isInventoryCompletedWithoutStorage:()=>false,renderInventoryTable:()=>{ displayedRows = h.state.filteredInventoryRows; }
  });
  return { h, get displayedRows() { return displayedRows; } };
}
const filters = {clients:['거래처'],storages:['A'],stockStatuses:['보관'],processStatuses:['1도']};

test('actual inventory HTML defaults to unfiltered rows and totals on first dashboard load', () => {
  const selects = ids.map(id => selectFromHtml(html.match(new RegExp(`<select id="${id}">([^]*?)</select>`))[1]));
  assert.deepEqual(selects.map(s=>s.value), ['', '', '', '']);
  const app = runtime(selects); app.h.renderInventoryFilterOptions(filters); app.h.applyInventoryFilters();
  assert.equal(app.displayedRows.length,1183);
  assert.equal(app.displayedRows.reduce((sum,row)=>sum+row.currentTotalQuantity,0),118300);
});

test('legacy prompts never become active filters when options are first populated', () => {
  const selects = ['전체','보관 위치 검색','전체','전체'].map(label => selectFromHtml(`<option>${label}</option>`));
  const app = runtime(selects); app.h.renderInventoryFilterOptions(filters); app.h.applyInventoryFilters();
  assert.deepEqual(selects.map(s=>s.value), ['', '', '', '']);
  assert.equal(app.displayedRows.length,1183);
});

test('an explicitly chosen storage remains selected after new data removes its last row', () => {
  const select = selectFromHtml('<option value="">전체</option><option value="B-1">B-1</option>');
  select.value='B-1'; const app=runtime([select,select,select,select]);
  app.h.renderSelectOptions(select,['A']);
  assert.equal(select.value,'B-1'); assert.match(select.innerHTML,/value="B-1"/);
});
