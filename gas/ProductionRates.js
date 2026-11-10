// Narrow, authenticated maintenance operation: only production-rate columns may change.
function backfillProductProductionRates(payload) {
  if (!payload || !payload.token) throw new Error('로그인 확인이 필요합니다.');
  verifySupabaseSheetSyncToken_(payload.token);
  return applyProductProductionRateBackfill_(payload);
}
function applyProductProductionRateBackfill_(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length || items.length > 1000) throw new Error('생산량 변경 항목을 확인해주세요.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('다른 작업이 진행 중입니다. 잠시 후 다시 시도해주세요.');
  try {
    const sheet = getProductSheet_();
    ensureProductCommonContainerHeaders_(sheet);
    const values = sheet.getDataRange().getValues();
    const header = findHeaderRow_(values, ['제품 ID','업체명','제품명']);
    if (!header) throw new Error('제품 DB 헤더를 찾을 수 없습니다.');
    const indexes = indexHeaders_(header.headers);
    const idCol = findHeaderIndex_(indexes,['제품 ID','제품ID']);
    const rateCol = findHeaderIndex_(indexes,['공정별 시간당 생산량']);
    const hourlyCol = findHeaderIndex_(indexes,['시간당 평균 생산량']);
    const autoCol = findHeaderIndex_(indexes,['자동 인쇄 시간당 생산량']);
    if ([idCol,rateCol,hourlyCol,autoCol].some(col=>col<0)) throw new Error('생산량 열을 찾을 수 없습니다.');
    const rows = new Map(values.slice(header.rowIndex+1).map((row,i)=>[String(row[idCol]||'').trim(),i+header.rowIndex+1]));
    const snapshot=payload.includeSnapshot===true ? values.slice(header.rowIndex+1).map(row=>({productId:String(row[idCol]||'').trim(),hourly:row[hourlyCol],automatic:row[autoCol],rates:row[rateCol]})).filter(row=>row.productId) : undefined;
    const conflicts=[],missing=[],updated=[],columns=new Set();
    const positive = value => Number.isFinite(Number(value)) && Number(value)>0;
    items.forEach(item=>{
      const index=rows.get(String(item.productId||''));
      if(index===undefined){missing.push(item.productId);return;}
      const row=values[index],patch=item.patch||{},rates=parseProductProcessHourlyRates_(row[rateCol]);let changed=false;
      Object.entries(rates).forEach(([key,value])=>{if(positive(value)&&Number(patch.processHourlyProductionRates&&patch.processHourlyProductionRates[key])!==Number(value))conflicts.push({productId:item.productId,field:key});});
      [['hourlyProductionRate',hourlyCol],['automaticHourlyProductionRate',autoCol]].forEach(([field,col])=>{if(positive(row[col])&&Number(patch[field])!==Number(row[col]))conflicts.push({productId:item.productId,field});});
      Object.entries(patch.processHourlyProductionRates||{}).forEach(([key,value])=>{
        const next=parseProductHourlyProductionRate_(value);
        if(next===null)return;
        if(positive(rates[key])&&Number(rates[key])!==next){conflicts.push({productId:item.productId,field:key});return;}
        if(Number(rates[key])!==next){rates[key]=next;changed=true;columns.add(rateCol);}
      });
      if(changed)row[rateCol]=JSON.stringify(rates);
      [['hourlyProductionRate',hourlyCol],['automaticHourlyProductionRate',autoCol]].forEach(([field,col])=>{
        if(!Object.prototype.hasOwnProperty.call(patch,field))return;
        const next=parseProductHourlyProductionRate_(patch[field]);if(next===null)return;
        const current=parseProductHourlyProductionRate_(row[col]);
        if(current!==null&&current!==next){conflicts.push({productId:item.productId,field});return;}
        if(current!==next){row[col]=next;changed=true;columns.add(col);}
      });
      if(changed)updated.push(item.productId);
    });
    if(conflicts.length||missing.length)throw new Error('생산량 일괄 입력 충돌: '+JSON.stringify({conflicts,missing}));
    if(payload.dryRun!==true) {
      columns.forEach(col=>sheet.getRange(header.rowIndex+2,col+1,values.length-header.rowIndex-1,1).setValues(values.slice(header.rowIndex+1).map(row=>[row[col]])));
      clearApiReadCaches_();
    }
    return {dryRun:payload.dryRun===true,checked:items.length,updated:updated.length,alreadyApplied:items.length-updated.length,columns:columns.size,snapshot};
  } finally {lock.releaseLock();}
}
