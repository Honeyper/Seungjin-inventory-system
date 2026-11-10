import '../frontend/qr-label.js';
const number=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
export function productionRateProjection(p){return {rates:p.processHourlyProductionRates||{},hourly:p.hourlyProductionRate??null,automatic:p.automaticHourlyProductionRate??null,finalProcess:p.finalProcess??null,
 stages:Array.from({length:6},(_,i)=>p[`processStage${i+1}`]??null),groups:p.processGroups??null};}
export function buildProductionRateBackfill(rows){
 const items=[],exceptions=[],existing=[];
 for(const row of rows){const p=row.data||row,id=row.product_id||p.productId||p.productCode;
  if(number(p.hourlyProductionRate)||number(p.automaticHourlyProductionRate)||Object.values(p.processHourlyProductionRates||{}).some(number)){existing.push(id);continue;}
  if(['코팅','라벨'].includes(p.finalProcess))continue;
  const groups=globalThis.SeungjinQrLabel.getProcessGroups(p),rates={...(p.processHourlyProductionRates||{})};
  const methods=Array.from({length:6},(_,i)=>String(p[`processStage${i+1}`]||'').replace(/\s/g,''));
  const normalized=methods.map(m=>['박','박인쇄'].includes(m)?'박':['실크','실크인쇄'].includes(m)?'실크':'');
  let silk=false,changed=false;
  for(const group of groups){const key=group.map(n=>`${n}도`).join('+'),degree=group.at(-1),kind=group.map(n=>normalized[n-1]);
   const allFoil=kind.every(m=>m==='박'),allSilk=kind.every(m=>m==='실크');
   silk ||= allSilk;
   const value=allFoil&&degree<=3?700:allSilk&&degree===1?1250:allSilk&&degree===2?812.5:null;
   if(value!==null){rates[key]=value;changed=true;}
   else exceptions.push({productId:id,process:key,reason:allSilk?'수동 3·4도 기준 미제공':'공정 구분 미지정'});
  }
  const patch={};if(changed)patch.processHourlyProductionRates=rates;if(silk)patch.automaticHourlyProductionRate=2250;
  if(groups.length===1&&number(rates[groups[0].map(n=>`${n}도`).join('+')]))patch.hourlyProductionRate=rates[groups[0].map(n=>`${n}도`).join('+')];
  if(Object.keys(patch).length)items.push({productId:id,expected:productionRateProjection(p),patch});
  else if(!groups.length)exceptions.push({productId:id,reason:'인쇄 공정 미등록'});
 }
 return {items,exceptions,existing};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const fs=await import('node:fs');const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const plan=buildProductionRateBackfill(input.products||input);fs.writeFileSync(process.argv[3],JSON.stringify(plan,null,2),{mode:0o600});
 console.log(JSON.stringify({updates:plan.items.length,existing:plan.existing.length,exceptions:plan.exceptions.length,automatic:plan.items.filter(i=>i.patch.automaticHourlyProductionRate).length}));
}
