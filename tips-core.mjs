// All persisted money is integer cents; hours are integer minutes.
export function parseMoney(value, optional=false){
  const text=String(value??'').trim().replace(',','.');
  if(!text&&optional)return null;
  if(!/^\d+(\.\d{1,2})?$/.test(text))throw new Error('Indica um valor em euros com, no máximo, dois decimais.');
  const [euros,cents='']=text.split('.');
  const result=Number(euros)*100+Number(cents.padEnd(2,'0'));
  if(!Number.isSafeInteger(result)||result>100000000)throw new Error('Valor fora do limite permitido.');
  return result;
}
export function parseHours(value){
  const text=String(value??'').trim().replace(',','.');
  if(/^\d{1,3}:[0-5]\d$/.test(text)){const [h,m]=text.split(':').map(Number);if(h*60+m<=10080)return h*60+m;}
  if(/^\d+(\.\d{1,2})?$/.test(text)){const minutes=Number(text)*60;if(Math.abs(minutes-Math.round(minutes))<1e-8&&minutes<=10080)return Math.round(minutes);}
  throw new Error('Indica horas decimais ou HH:MM, entre 0 e 168 horas.');
}
export const money=c=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(c/100);
export const hours=m=>`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
export function monday(value){const d=new Date(value+'T12:00:00Z');if(Number.isNaN(d.getTime()))throw new Error('Data inválida.');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
export function addDate(value,n){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function monthFinal(week){return week.slice(0,7)!==addDate(week,7).slice(0,7);}
export function allocate(total,entries){
  if(!Number.isSafeInteger(total)||total<0)throw new Error('Total inválido.');
  if(entries.some(p=>!Number.isInteger(p.minutes)||p.minutes<0||p.minutes>10080))throw new Error('Horas inválidas.');
  const minutes=entries.reduce((s,p)=>s+p.minutes,0);
  if(total>0&&minutes===0)throw new Error('Preenche as horas da equipa antes de distribuir.');
  const amounts=entries.map(p=>minutes?Math.floor(total*p.minutes/minutes):0);
  const order=entries.map((p,i)=>({i,id:p.id,remainder:minutes?(total*p.minutes)%minutes:0})).sort((a,b)=>b.remainder-a.remainder||a.id.localeCompare(b.id));
  for(let i=0,left=total-amounts.reduce((s,n)=>s+n,0);i<left;i++)amounts[order[i].i]++;
  return amounts;
}
export function calculate(draft,staff){
  if(!draft||draft.days.length!==7||draft.days.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Preenche as gorjetas dos sete dias; usa 0 nos dias sem gorjetas.');
  const daily=draft.days.reduce((s,n)=>s+n,0),total=draft.counted??daily;
  if(draft.counted!==null&&draft.counted!==undefined&&total!==daily&&!draft.note.trim())throw new Error('Explica a diferença entre os emails e o dinheiro contado.');
  const active=staff.filter(p=>p.active);
  if(!active.length)throw new Error('Adiciona a equipa primeiro.');
  const entries=active.map(p=>{const e=draft.entries.find(e=>e.id===p.id);if(!e)throw new Error('Faltam horas de uma pessoa da equipa.');return {...e,staff:p};});
  const gross=allocate(total,entries),close=monthFinal(draft.week);
  const payments=entries.map((e,i)=>{
    const p=e.staff,due=p.balance+gross[i],settle=close||e.leaving||!e.retain;
    const suggested=settle?due:Math.min(due,Math.floor((gross[i]*95+5000)/10000)*100);
    const paid=e.paid??suggested;
    if(!Number.isSafeInteger(paid)||paid<0||paid>due)throw new Error(`${p.name}: o pagamento ultrapassa o valor disponível.`);
    const balance=due-paid;
    if(settle&&balance!==0)throw new Error(`${p.name}: é necessário pagar ${money(due)} para liquidar o saldo.`);
    return {id:p.id,name:p.name,minutes:e.minutes,retain:e.retain,leaving:e.leaving,gross:gross[i],before:p.balance,paid,balance,suggested,settle};
  });
  return {daily,total,close,payments,paid:payments.reduce((s,p)=>s+p.paid,0),balance:payments.reduce((s,p)=>s+p.balance,0)};
}
