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
  function weekStart(date) {
    const time=dateNumber(date),day=new Date(time).getUTCDay();
    return new Date(time-((day+6)%7)*86400000).toISOString().slice(0,10);
  }
  function tenHourWeeks(schedule, previous, extraHolidays) {
    const dates=new Set([...previous,...schedule].filter(day=>day.hours>=10 && dayType(day.date,extraHolidays)==='weekday').map(day=>day.date));
    const weeks=new Map();
    for(const date of dates) {const week=weekStart(date);weeks.set(week,(weeks.get(week)||0)+1);}
    const plannedWeeks=new Set(schedule.filter(day=>day.type==='weekday' && day.hours>=10).map(day=>weekStart(day.date)));
    return [...weeks].filter(([week,count])=>count>=3 && plannedWeeks.has(week)).map(([week,days])=>({week,days}));
  }
  function trimSchedule(days, remaining, rate, restFirst = false, previous = [], extraHolidays = []) {
    const variants=[days.map(day=>({...day})),days.map(day=>({...day}))];
    for(let direction=0;direction<2;direction++) {
      const candidate=variants[direction],indices=candidate.map((_,index)=>index);
      if(direction) indices.reverse();
      const weekdays=()=>{
        const weeks=candidate.map(day=>weekStart(day.date)),burden=new Map();
        for(const day of [...previous,...candidate.map(day=>({date:day.date,type:day.type,hours:day.minutes/60}))]) {
          const week=weekStart(day.date),value=burden.get(week)||{ten:0,hours:0};
          value.ten+=day.hours>=10 && (day.type||dayType(day.date,extraHolidays))==='weekday'?1:0;
          value.hours+=day.hours;burden.set(week,value);
        }
        // Shorten the most burdened week first; update its totals after each accepted half-hour reduction.
        for(let minutes=600;minutes>480;minutes-=30) {
          const pending=indices.filter(index=>candidate[index].type==='weekday' && candidate[index].minutes===minutes);
          const compare=(a,b)=>{
            const left=burden.get(weeks[a]),right=burden.get(weeks[b]);
            return (minutes===600?right.ten-left.ten:0) || right.hours-left.hours || (direction?b-a:a-b);
          };
          while(pending.length) {
            let pick=0;
            for(let index=1;index<pending.length;index++) if(compare(pending[index],pending[pick])<0) pick=index;
            const index=pending.splice(pick,1)[0],day=candidate[index];day.minutes-=30;
            if(allocate(candidate,remaining,rate).shortfall) day.minutes+=30;
            else {const value=burden.get(weeks[index]);value.hours-=0.5;if(minutes===600)value.ten--;}
          }
        }
      };
      const restDays=()=>{
        for(const kind of ['holiday','sunday','saturday']) for(const index of indices) {
          const day=candidate[index],weekday=new Date(`${day.date}T00:00:00Z`).getUTCDay();
          if(!(kind==='holiday'?day.type==='holiday':day.type==='weekend' && weekday===(kind==='saturday'?6:0))) continue;
          while(day.minutes>(day.floor||0)) {
            const before=day.minutes;
            // Attendance is a full shift: remove an unnecessary rest-day shift as a whole.
            day.minutes=before>480?before-30:0;
            if(allocate(candidate,remaining,rate).shortfall) {day.minutes=before;break;}
          }
        }
      };
      if(restFirst) {restDays();weekdays();} else {weekdays();restDays();}
    }
    const score=candidate=>{
      const schedule=allocate(candidate,remaining,rate).schedule;
      const expensive=restFirst?['holiday','weekend'].map(type=>schedule.filter(day=>day.type===type).reduce((sum,day)=>sum+day.hours,0)):[];
      return [...expensive,tenHourWeeks(schedule,previous,extraHolidays).length,schedule.filter(day=>day.type==='weekday' && day.hours===10).length,
        schedule.filter(day=>day.type==='weekday' && day.hours>9).length,
        schedule.reduce((sum,day)=>sum+day.hours,0),schedule.at(-1)?.date||''];
    };
    const left=score(variants[0]),right=score(variants[1]);
    for(let index=0;index<left.length;index++) if(left[index]!==right[index]) return left[index]<right[index]?variants[0]:variants[1];
    // When the burden is equal, produce earlier rather than moving overtime to the end.
    for(let index=0;index<days.length;index++) if(variants[0][index].minutes!==variants[1][index].minutes)
      return variants[0][index].minutes>variants[1][index].minutes?variants[0]:variants[1];
    return variants[0];
  }
  function fillWeekdays(days, remaining, rate, previous, extraHolidays) {
    let candidate;
    // Prefer an even, lower ceiling to concentrating the same work into ten-hour days.
    for(const minutes of [480,510,540,570,600]) {
      candidate=days.map(day=>({...day,minutes:day.type==='weekday'?minutes:day.minutes}));
      if(!allocate(candidate,remaining,rate).shortfall) return trimSchedule(candidate,remaining,rate,false,previous,extraHolidays);
    }
    return candidate;
  }
  function balanceSchedule(days, remaining, rate, previous, extraHolidays) {
    let balanced=fillWeekdays(days,remaining,rate,previous,extraHolidays);
    const reliefDates=new Set();
    const relieveWeeks=()=>{
      const weeks=tenHourWeeks(allocate(balanced,remaining,rate).schedule,previous,extraHolidays);
      for(const {week} of weeks) {
        const saturday=balanced.find(day=>day.type==='weekend' && new Date(`${day.date}T00:00:00Z`).getUTCDay()===6 && weekStart(day.date)===week);
        if(!saturday || reliefDates.has(saturday.date)) continue;
        saturday.minutes=Math.max(480,saturday.minutes);saturday.floor=480;reliefDates.add(saturday.date);
        balanced=fillWeekdays(balanced,remaining,rate,previous,extraHolidays);
        return true;
      }
      return false;
    };
    while(relieveWeeks()) { /* Each pass can add only an available Saturday inside the deadline. */ }
    // Saturdays come before Sundays; public holidays remain the final capacity tier.
    for(const kind of ['saturday','sunday','holiday']) {
      if(!allocate(balanced,remaining,rate).shortfall) break;
      const matches=day=>kind==='holiday'?day.type==='holiday':day.type==='weekend'
        && new Date(`${day.date}T00:00:00Z`).getUTCDay()===(kind==='saturday'?6:0);
      for(let minutes=480;minutes<=600;minutes+=30) {
        balanced=balanced.map(day=>matches(day)?{...day,minutes:Math.max(day.floor||0,minutes)}:day);
        if(kind==='saturday') balanced=fillWeekdays(balanced,remaining,rate,previous,extraHolidays);
        else if(!allocate(balanced,remaining,rate).shortfall) balanced=trimSchedule(balanced,remaining,rate,true,previous,extraHolidays);
        while(relieveWeeks()) {}
        if(!allocate(balanced,remaining,rate).shortfall) break;
      }
    }
    const planned=allocate(balanced,remaining,rate);
    return {days:balanced,saturdayReliefDates:[...reliefDates].filter(date=>planned.schedule.some(day=>day.date===date && day.hours===8)),
      fatigueWeeks:tenHourWeeks(planned.schedule,previous,extraHolidays)};
  }
  function plan({orderQuantity, hourlyRate, completedProduction = 0, startDate, dueDate,
    deliveryType = 'date', dailyMinimumQuantity, extraHolidays = [], previousWorkSchedule = []}) {
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
    if(!Array.isArray(previousWorkSchedule) || previousWorkSchedule.some(day=>!day || dateNumber(day.date)===null || number(day.hours)===null)) return invalid('저장된 근무시간을 확인해주세요.');
    const history=new Map();
    for(const day of previousWorkSchedule.filter(day=>day.date<startDate)) history.set(day.date,Math.max(history.get(day.date)||0,number(day.hours)));
    const previous=[...history].map(([date,hours])=>({date,hours}));
    const type = dayType(startDate,extraHolidays);
    if (!type) return invalid('해당 연도의 공휴일 자료가 없습니다.');
    const remaining = Math.max(0,base.orderQuantity-completed);
    result.remainingQuantity = remaining;
    if (!remaining) return {...result,targetQuantity:0,hours:0,shortfall:0,mode:'complete',message:'생산 완료'};
    const rate = base.hourlyRate;
    let days,mode='regular',overdue=false,noDue=false;
    if(deliveryType==='daily') {
      const minimum=number(dailyMinimumQuantity);
      if(!(minimum>0) || !Number.isSafeInteger(minimum)) return invalid('일일 필수 생산량을 확인해주세요.');
      if(type!=='weekday') return {...result,targetQuantity:0,hours:0,shortfall:0,mode:'rest',message:type==='holiday'?'공휴일 휴무':'주말 휴무'};
      const required=Math.min(remaining,Math.ceil(minimum/500)*500);
      let minutes=480;
      while(minutes<600 && dayTarget(remaining,rate,minutes)<required) minutes+=30;
      const target=dayTarget(remaining,rate,minutes),shortfall=Math.max(0,Math.min(remaining,minimum)-target);
      const schedule=[{date:startDate,type,hours:minutes/60,targetQuantity:target}];
      const fatigueWeeks=tenHourWeeks(schedule,previous,extraHolidays);
      let message=shortfall?`10시간으로도 일일 필수량 ${shortfall.toLocaleString('ko-KR')}개 부족`:minutes>480?'일일 필수량 대응 연장근무':'';
      if(fatigueWeeks.length) message+=(message?' · ':'')+'일일 필수량 유지로 주 3일 이상 10시간 근무 필요';
      return {...result,targetQuantity:target,hours:minutes/60,shortfall,mode:shortfall?'shortfall':minutes>480?'overtime':'regular',
        message,schedule,fatigueWeeks,completionDate:target===remaining?startDate:null};
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
    const balance=noDue?{days,saturdayReliefDates:[],fatigueWeeks:[]}:balanceSchedule(days,remaining,rate,previous,extraHolidays);
    days=balance.days;
    const planned=allocate(days,remaining,rate),today=planned.schedule.find(day=>day.date===startDate);
    const hasHoliday=planned.schedule.some(day=>day.type==='holiday'),hasWeekend=planned.schedule.some(day=>day.type==='weekend');
    const hasOvertime=planned.schedule.some(day=>day.type==='weekday' && day.hours>8);
    mode=hasHoliday?'holiday':hasWeekend?'weekend':hasOvertime?'overtime':'regular';
    let message=hasHoliday?'납기 대응 공휴일 근무 필요':hasWeekend?'납기 대응 주말 근무 필요':hasOvertime?'납기 대응 연장근무':'';
    if(balance.saturdayReliefDates.length && !hasHoliday) message='평일 10시간 집중 완화 · 토요일 8시간 주말 근무';
    if(balance.fatigueWeeks.length) message+=(message?' · ':'')+'주 3일 이상 10시간 근무 필요 · 납기/물량 조정 검토';
    if(!today) message=type==='weekday'?'오늘 배정 없음':type==='holiday'?'공휴일 휴무':'주말 휴무';
    if(noDue) message=type==='weekday'?'납기일 미입력 · 평일 8시간 기준':message;
    if(overdue) message=`납기 경과${message?' · '+message:''}`;
    if(planned.shortfall && !noDue) {mode='shortfall';message=`${overdue?'납기 경과 · ':''}최대 10시간으로도 ${planned.shortfall.toLocaleString('ko-KR')}개 부족`;}
    return {...result,...planned,saturdayReliefDates:balance.saturdayReliefDates,fatigueWeeks:balance.fatigueWeeks,targetQuantity:today?.targetQuantity||0,hours:today?.hours||0,mode,message,
      completionDate:planned.shortfall===0?planned.schedule.at(-1)?.date||null:null};
  }
  root.SeungjinProductionPlanner = {number,calculate,plan,dayType};
})(typeof window === "undefined" ? globalThis : window);
