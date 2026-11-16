(function () {
  function create({request,parseQuantity,userName,today,onSaved,printLabels}) {
    const modal=document.querySelector('#additionalProductionModal');
    const form=modal.querySelector('form'),fields=form.querySelector('fieldset'),message=modal.querySelector('[data-message]');
    const boxes=modal.querySelector('[data-boxes]'),sources=modal.querySelector('[data-sources]');
    const save=modal.querySelector('[type="submit"]'),closeButtons=modal.querySelectorAll('[data-close]');
    let context=null,saving=false,loading=false,loadToken=0;
    const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const field=name=>form.elements.namedItem(name);
    const values=()=>[...boxes.querySelectorAll('input')].map(input=>Number(input.value));
    function summary(){
      const produced=values().reduce((n,q)=>n+q,0),loss=Number(field('lossQuantity').value);
      const used=[...sources.querySelectorAll('input')].reduce((n,input)=>n+Number(input.value),0);
      modal.querySelector('[data-summary]').textContent=`추가 ${values().length}박스 · 생산 ${produced.toLocaleString()}개 + 로스 ${loss.toLocaleString()}개 / 사출 사용 ${used.toLocaleString()}개`;
      boxes.querySelectorAll('[data-remove]').forEach(button=>button.disabled=boxes.children.length===1);
    }
    function addBox(quantity=''){
      if(boxes.children.length>=100)return;
      const row=document.createElement('div');row.className='additional-production-box';
      row.innerHTML=`<label>추가 박스 수량 <span class="unit-input"><input type="number" min="1" step="1" required aria-label="추가 박스 수량" value="${escape(quantity)}"><i>ea</i></span></label><button type="button" class="secondary-modal-action" data-remove>삭제</button>`;
      boxes.append(row);summary();
    }
    function close(){
      if(saving)return;
      loadToken++;modal.hidden=true;context=null;
      if(![...document.querySelectorAll('.modal-backdrop')].some(element=>!element.hidden))document.body.classList.remove('modal-open');
    }
    async function open(inbound){
      if(saving || !modal.hidden)return;
      const token=++loadToken;
      context={inbound,sources:[],requestId:crypto.randomUUID()};loading=true;
      form.reset();fields.disabled=false;save.disabled=true;message.textContent='사출 재고를 불러오는 중입니다.';
      modal.querySelector('[data-target]').textContent=`${inbound.productName} · ${inbound.managementId}`;
      field('productionDate').value=today();field('productionDate').max=today();field('storage').value=inbound.storage || '미지정';
      boxes.innerHTML='';sources.innerHTML='';addBox(parseQuantity(inbound.boxQuantity)||'');
      modal.hidden=false;document.body.classList.add('modal-open');field('productionDate').focus();
      try {
        const result=await request('getAdditionalProductionSources',{managementId:inbound.managementId,productId:inbound.productId});
        if(token!==loadToken)return;
        context.sources=result.boxes || [];
        sources.innerHTML=context.sources.map((box,index)=>`<label class="additional-production-source"><span><strong>${escape(box.managementId)} · ${escape(box.number)}번</strong><small>${escape(box.storage || '미지정')} · 사용 가능 ${Number(box.quantity).toLocaleString()} ea</small></span><span class="unit-input"><input data-source="${index}" type="number" value="0" min="0" max="${Number(box.quantity)}" step="1" aria-label="${escape(box.managementId)} ${escape(box.number)}번 사용 수량"><i>ea</i></span></label>`).join('');
        message.textContent=context.sources.length?'':'같은 제품의 사용 가능한 사출 재고가 없습니다. 재고 구분을 확인해주세요.';
        save.disabled=!context.sources.length;
      } catch(error){if(token===loadToken)message.textContent=error.message || '사출 재고를 불러오지 못했습니다.';}
      finally{if(token===loadToken)loading=false;}
    }
    closeButtons.forEach(button=>button.addEventListener('click',close));
    modal.addEventListener('click',event=>{if(event.target===modal)close();});
    modal.querySelector('[data-add-box]').addEventListener('click',()=>addBox());
    boxes.addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(button && boxes.children.length>1){button.parentElement.remove();summary();}});
    form.addEventListener('input',summary);
    field('sourceSearch').addEventListener('input',()=>{
      const query=field('sourceSearch').value.trim().toLowerCase();
      sources.querySelectorAll('label').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(query));
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(saving || loading || !context)return;
      const ctx=context;
      const sourceUses=[...sources.querySelectorAll('input')].filter(input=>Number(input.value)>0).map(input=>{
        const box=ctx.sources[Number(input.dataset.source)];return {boxId:box.boxId,quantity:Number(input.value),expectedQuantity:box.quantity};
      });
      const payload={managementId:ctx.inbound.managementId,productId:ctx.inbound.productId,requestId:ctx.requestId,
        boxQuantities:values(),sourceUses,lossQuantity:Number(field('lossQuantity').value),productionDate:field('productionDate').value,
        storage:field('storage').value.trim(),note:field('note').value.trim(),userName};
      const used=sourceUses.reduce((n,use)=>n+use.quantity,0),produced=payload.boxQuantities.reduce((n,q)=>n+q,0);
      if(!sourceUses.length || used!==produced+payload.lossQuantity){message.textContent='사출 사용량을 생산 수량 + 로스 수량과 같게 입력해주세요.';return;}
      saving=true;fields.disabled=true;save.disabled=true;closeButtons.forEach(button=>button.disabled=true);message.textContent='추가 박스를 등록하는 중입니다.';
      let result;
      try {result=await request('registerAdditionalProduction',payload);}
      catch(error){message.textContent=error.message || '등록하지 못했습니다. 같은 내용으로 다시 시도해주세요.';}
      finally{saving=false;fields.disabled=false;save.disabled=false;closeButtons.forEach(button=>button.disabled=false);}
      if(!result)return;
      // A label/read failure must never turn a successful registration into a new write.
      close();onSaved(result);
      await printLabels(ctx.inbound.managementId,ctx.inbound.productId,result.boxIds);
    });
    return {open,close};
  }
  window.SeungjinAdditionalProduction={create};
})();
