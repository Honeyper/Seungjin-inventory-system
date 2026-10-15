(function (root) {
  const number = value => {
    if (value === null || value === undefined || value === "" || value === "-") return null;
    const parsed = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  function calculate({orderQuantity, hourlyRate, workHours = 8}) {
    const order = number(orderQuantity), rate = number(hourlyRate), hours = number(workHours);
    const validRate = rate > 0 ? rate : null;
    const target = order !== null && validRate !== null && hours > 0 ? Math.floor(Math.min(order, validRate * hours) / 500) * 500 : null;
    return {orderQuantity:order,hourlyRate:validRate,targetQuantity:target,
      hours:target !== null ? target / validRate : null,
      totalHours:order !== null && validRate !== null ? order / validRate : null};
  }
  // KASI calendar data, KASA 2027 almanac and MPM 2026-04-29 holiday update.
  // https://astro.kasi.re.kr/life/post/calendarData?search_year=2026
  // https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431
  const HOLIDAYS = Object.freeze({
    2026: '01-01 02-16 02-17 02-18 03-01 03-02 05-01 05-05 05-24 05-25 06-03 06-06 07-17 08-15 08-17 09-24 09-25 09-26 10-03 10-05 10-09 12-25'.split(' '),
    2027: '01-01 02-06 02-07 02-08 02-09 03-01 05-01 05-03 05-05 05-13 06-06 07-17 07-19 08-15 08-16 09-14 09-15 09-16 10-03 10-04 10-09 10-11 12-25 12-27'.split(' ')
  });
  function dateNumber(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const result = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(result) && new Date(result).toISOString().slice(0,10) === value ? result : null;
  }
  function dayType(date, extraHolidays = []) {
    const time = dateNumber(date);
    if (time === null || !Object.hasOwn(HOLIDAYS, date.slice(0,4))) return null;
    if (HOLIDAYS[date.slice(0,4)].includes(date.slice(5)) || extraHolidays.includes(date)) return 'holiday';
    return [0,6].includes(new Date(time).getUTCDay()) ? 'weekend' : 'weekday';
  }
  function capacity(rate, minutes) {
    return Math.floor(rate * minutes / 60 + 1e-7);
  }
  function dayTarget(remaining, rate, minutes) {
    const maximum = capacity(rate, minutes);
    // The final day completes the exact balance; ordinary days retain the 500-unit floor.
    return remaining <= maximum ? remaining : Math.floor(maximum / 500) * 500;
  }
  function allocate(days, remaining, rate) {
    const schedule = [];
    for (const day of days) {
      if (remaining <= 0) break;
      if (!day.minutes) continue;
      const quantity = dayTarget(remaining, rate, day.minutes);
      if (!quantity) continue;
      schedule.push({date:day.date,type:day.type,hours:day.minutes/60,targetQuantity:quantity});
      remaining -= quantity;
    }
    return {schedule,shortfall:remaining};
  }
  function plan({orderQuantity, hourlyRate, completedProduction = 0, startDate, dueDate,
    deliveryType = 'date', dailyMinimumQuantity, extraHolidays = []}) {
    const base = calculate({orderQuantity,hourlyRate});
    const completed = number(completedProduction), start = dateNumber(startDate);
    const result = {...base,targetQuantity:null,hours:null,remainingQuantity:null,schedule:[],shortfall:null,
      mode:'unavailable',message:'',completionDate:null};
    const invalid = message => ({...result,message});
    if (base.orderQuantity === null || !Number.isSafeInteger(base.orderQuantity)) return invalid('발주량을 확인해주세요.');
    if (base.hourlyRate === null) return invalid('시간당 생산량 미입력');
    if (completed === null || !Number.isSafeInteger(completed)) return invalid('저장된 생산 실적을 확인할 수 없습니다.');
    if (start === null) return invalid('계획 날짜를 확인해주세요.');
    if (!Array.isArray(extraHolidays) || extraHolidays.some(date => dateNumber(date) === null)) return invalid('추가 휴무일을 확인해주세요.');
    const type = dayType(startDate,extraHolidays);
    if (!type) return invalid('해당 연도의 공휴일 자료가 없습니다.');
    const remaining = Math.max(0,base.orderQuantity-completed);
    result.remainingQuantity = remaining;
    if (!remaining) return {...result,targetQuantity:0,hours:0,shortfall:0,mode:'complete',message:'생산 완료'};
    const rate = base.hourlyRate;
    const minimumMinutes = (days,index) => {
      let low=days[index].minutes,high=600;
      // Use only the overtime minutes needed to complete the rounded daily targets.
      while(low<high) {
        const middle=Math.floor((low+high)/2);days[index].minutes=middle;
        if(allocate(days,remaining,rate).shortfall===0) high=middle; else low=middle+1;
      }
      days[index].minutes=low;
    };
    let days,mode='regular',overdue=false,noDue=false;
    if(deliveryType==='daily') {
      const minimum=number(dailyMinimumQuantity);
      if(!(minimum>0) || !Number.isSafeInteger(minimum)) return invalid('일일 필수 생산량을 확인해주세요.');
      if(type!=='weekday') return {...result,targetQuantity:0,hours:0,shortfall:0,mode:'rest',message:type==='holiday'?'공휴일 휴무':'주말 휴무'};
      const required=Math.min(remaining,Math.ceil(minimum/500)*500);
      let minutes=480;
      while(minutes<600 && dayTarget(remaining,rate,minutes)<required) minutes++;
      const target=dayTarget(remaining,rate,minutes),shortfall=Math.max(0,Math.min(remaining,minimum)-target);
      return {...result,targetQuantity:target,hours:minutes/60,shortfall,mode:shortfall?'shortfall':minutes>480?'overtime':'regular',
        message:shortfall?`10시간으로도 일일 필수량 ${shortfall.toLocaleString('ko-KR')}개 부족`:minutes>480?'일일 필수량 대응 연장근무':'',
        schedule:[{date:startDate,type,hours:minutes/60,targetQuantity:target}],completionDate:target===remaining?startDate:null};
    }
    const parsedDue=dateNumber(dueDate);
    if(dueDate && parsedDue===null) return invalid('납기일을 확인해주세요.');
    noDue=parsedDue===null;
    const end=noDue?start:Math.max(start,parsedDue);
    overdue=parsedDue!==null && parsedDue<start;
    if((end-start)/86400000>731) return invalid('계획 기간은 최대 2년입니다.');
    days=[];
    for(let time=start;time<=end;time+=86400000) {
      const date=new Date(time).toISOString().slice(0,10),kind=dayType(date,extraHolidays);
      if(!kind) return invalid('계획 기간 중 공휴일 자료가 없는 연도가 있습니다.');
      days.push({date,type:kind,minutes:kind==='weekday'?480:0});
    }
    if(!noDue) {
      // Each tier uses all cheaper capacity first. Compare early/late reductions and
      // single-day extensions so a tiny final balance does not force a 500-unit overtime batch.
      for(const kind of ['weekday','weekend','holiday']) {
        if(allocate(days,remaining,rate).shortfall===0) break;
        const indices=days.map((day,index)=>day.type===kind?index:-1).filter(index=>index>=0);
        const original=days.map(day=>({...day}));
        indices.forEach(index=>{days[index].minutes=600;});
        if(allocate(days,remaining,rate).shortfall) continue;
        let best=days.map(day=>({...day}));
        const minutes=list=>list.reduce((sum,day)=>sum+day.minutes,0);
        const consider=candidate=>{
          const difference=minutes(candidate)-minutes(best);
          if(difference<0 || difference===0 && candidate.some((day,index)=>
            day.minutes>best[index].minutes && candidate.slice(0,index).every((previous,i)=>previous.minutes===best[i].minutes))) best=candidate.map(day=>({...day}));
        };
        for(const index of indices) {
          const candidate=original.map(day=>({...day}));candidate[index].minutes=600;
          if(allocate(candidate,remaining,rate).shortfall===0) {
            candidate[index].minutes=original[index].minutes;minimumMinutes(candidate,index);consider(candidate);
          }
        }
        for(const ordered of [indices,[...indices].reverse()]) {
          const candidate=days.map(day=>({...day}));
          for(const index of ordered) {
            candidate[index].minutes=original[index].minutes;
            if(allocate(candidate,remaining,rate).shortfall) minimumMinutes(candidate,index);
          }
          consider(candidate);
        }
        days=best;
      }
    }
    const planned=allocate(days,remaining,rate),today=planned.schedule.find(day=>day.date===startDate);
    const hasHoliday=planned.schedule.some(day=>day.type==='holiday'),hasWeekend=planned.schedule.some(day=>day.type==='weekend');
    const hasOvertime=planned.schedule.some(day=>day.type==='weekday' && day.hours>8);
    mode=hasHoliday?'holiday':hasWeekend?'weekend':hasOvertime?'overtime':'regular';
    let message=hasHoliday?'납기 대응 공휴일 근무 필요':hasWeekend?'납기 대응 주말 근무 필요':hasOvertime?'납기 대응 연장근무':'';
    if(!today) message=type==='weekday'?'오늘 배정 없음':type==='holiday'?'공휴일 휴무':'주말 휴무';
    if(noDue) message=type==='weekday'?'납기일 미입력 · 평일 8시간 기준':message;
    if(overdue) message=`납기 경과${message?' · '+message:''}`;
    if(planned.shortfall && !noDue) {mode='shortfall';message=`${overdue?'납기 경과 · ':''}최대 10시간으로도 ${planned.shortfall.toLocaleString('ko-KR')}개 부족`;}
    return {...result,...planned,targetQuantity:today?.targetQuantity||0,hours:today?.hours||0,mode,message,
      completionDate:planned.shortfall===0?planned.schedule.at(-1)?.date||null:null};
  }
  root.SeungjinProductionPlanner = {number,calculate,plan,dayType};
})(typeof window === "undefined" ? globalThis : window);
