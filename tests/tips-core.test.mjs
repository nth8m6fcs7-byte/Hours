import assert from 'node:assert/strict';
import {parseMoney,parseHours,monday,monthFinal,allocate,calculate} from '../tips-core.mjs';
assert.equal(parseMoney('23,47'),2347);assert.equal(parseMoney('0'),0);assert.equal(parseMoney('',true),null);
for(const bad of ['','NaN','-1','1.234','1e3','Infinity'])assert.throws(()=>parseMoney(bad));
assert.equal(parseHours('40'),2400);assert.equal(parseHours('7:30'),450);assert.equal(parseHours('7,5'),450);assert.throws(()=>parseHours('7.01'));assert.throws(()=>parseHours('169'));
assert.equal(monday('2026-10-04'),'2026-09-28');assert(monthFinal('2026-09-28'));assert(!monthFinal('2026-09-21'));assert(monthFinal('2026-12-28'));
const staff=[{id:'a',name:'A',active:true,balance:435},{id:'b',name:'B',active:true,balance:320},{id:'c',name:'Extra',active:true,balance:0}];
const week={week:'2026-09-21',days:[5000,3500,4000,5500,6000,8000,8000],counted:null,note:'',entries:staff.map((p,i)=>({id:p.id,minutes:[2400,1920,480][i],retain:i<2,leaving:false,paid:null}))};
let result=calculate(week,staff);assert.deepEqual(result.payments.map(p=>p.paid),[19000,15200,4000]);assert.equal(result.balance,2555);
result=calculate({...week,week:'2026-09-28'},staff);assert.equal(result.paid,40755);assert.equal(result.balance,0);
const leaving=structuredClone(week);leaving.entries[0].leaving=true;assert.equal(calculate(leaving,staff).payments[0].balance,0);
const adjusted=structuredClone(week);adjusted.entries[0].paid=19400;assert.equal(calculate(adjusted,staff).payments[0].balance,1035);
assert.throws(()=>calculate({...week,counted:42870},staff));assert.equal(calculate({...week,counted:42870,note:'Acerto da contagem'},staff).total,42870);
const overspend=structuredClone(week);overspend.entries[0].paid=20436;assert.throws(()=>calculate(overspend,staff));
const underpaidExtra=structuredClone(week);underpaidExtra.entries[2].paid=3900;assert.throws(()=>calculate(underpaidExtra,staff));
const zero=structuredClone(week);zero.days.fill(0);zero.entries.forEach(e=>e.minutes=0);assert.equal(calculate(zero,staff).total,0);
zero.days[0]=1;assert.throws(()=>calculate(zero,staff));
// Excel's 2–8 February: 378.50 / 616h * 40h; cent allocation stays within one cent of the raw result.
const excelHours=[16,40,40,40,40,40,40,40,40,40,40,0,40,40,40,40,40,0].map((h,i)=>({id:String(i).padStart(2,'0'),minutes:h*60}));
assert.equal(excelHours.reduce((s,p)=>s+p.minutes,0)/60,616);
const amounts=allocate(37850,excelHours);assert.equal(amounts.reduce((s,n)=>s+n,0),37850);
amounts.forEach((a,i)=>assert(Math.abs(a-37850*excelHours[i].minutes/(616*60))<1));
// Many distributions: cents always reconcile, including tiny totals and tied fractions.
let seed=17;const next=()=>seed=(seed*16807)%2147483647;
for(let n=0;n<1000;n++){const count=next()%30+1,total=next()%10000000,entries=Array.from({length:count},(_,i)=>({id:String(i).padStart(3,'0'),minutes:next()%10080+1}));const allocations=allocate(total,entries);assert.equal(allocations.reduce((s,x)=>s+x,0),total);assert(allocations.every(x=>Number.isInteger(x)&&x>=0));}
assert.deepEqual(allocate(1,[{id:'b',minutes:1},{id:'a',minutes:1}]),[0,1]);
console.log('PASS: monetary parsing, exact minutes, Excel example, retention, payments, departure/month-end, boundaries and 1,000 reconciled distributions.');
