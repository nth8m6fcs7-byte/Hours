import {parseMoney,parseHours,money,hours,monday,addDate,monthFinal,calculate} from './tips-core.mjs';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euros=n=>(n/100).toFixed(2);
const range=w=>`${w.split('-').reverse().join('/')} – ${addDate(w,6).split('-').reverse().join('/')}`;
const days=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
export function mountTips(root,supabase,getWorkRows){
  let user=null,version=0,revision=0,state={staff:[],weeks:[],draft:null},draft=null,step='values',dirty=false,busy=false,loaded=false;
  const el=id=>root.querySelector('#gt-'+id);
  root.innerHTML=`<div class="tips-heading"><h2>Gorjetas da equipa</h2><p class="tips-caption">Uma semana de cada vez. Cada pagamento e cada saldo ficam registados.</p></div>
    <div id="gt-message" role="status" aria-live="polite"></div>
    <div class="tips-week"><label>Semana de<input id="gt-week" type="date"></label><button id="gt-refresh" class="secondary" type="button">Atualizar</button></div>
    <p id="gt-period" class="tips-period"></p>
    <nav class="tips-steps" aria-label="Passos das gorjetas"><button type="button" data-step="values" aria-pressed="true">1. Valores</button><button type="button" data-step="team" aria-pressed="false">2. Equipa</button><button type="button" data-step="pay" aria-pressed="false">3. Pagar</button></nav>
    <section class="card" data-panel="values"><h3>Gorjetas dos fechos diários</h3><div id="gt-days" class="tips-days"></div><div class="tips-line"><span>Total dos emails</span><strong id="gt-daily">—</strong></div><button id="gt-zero" class="ghost" type="button">Marcar dias vazios como 0 €</button><label class="tips-cash">Dinheiro contado (€)<input id="gt-counted" type="text" inputmode="decimal" placeholder="Usar total dos emails"></label><div class="tips-line"><span>Total a distribuir</span><strong id="gt-total">—</strong></div><p id="gt-difference" class="tips-caption"></p><label class="tips-note">Nota do acerto<textarea id="gt-note" maxlength="1000" rows="2" placeholder="Obrigatória quando o dinheiro contado é diferente"></textarea></label><button class="tips-block" type="button" data-step="team">Continuar para equipa</button></section>
    <section class="card hidden" data-panel="team"><h3>Horas desta semana</h3><div id="gt-team"></div><details id="gt-new" class="tips-tools"><summary>Adicionar pessoa</summary><form id="gt-person-form" class="tips-form"><label>Nome<input id="gt-name" required maxlength="80" autocomplete="off"></label><label class="tips-check"><input id="gt-retain" type="checkbox" checked>Reter cerca de 5% durante o mês</label><label class="tips-check"><input id="gt-linked" type="checkbox">Esta pessoa sou eu: importar as minhas horas</label><details><summary>Saldo vindo do Excel</summary><p class="tips-caption">Preenche apenas o dinheiro desta pessoa que já tens retido. Não voltes a importar semanas que originaram este saldo.</p><label>Saldo inicial (€)<input id="gt-opening" type="text" inputmode="decimal" value="0"></label><label class="tips-note">Origem do saldo<input id="gt-opening-note" maxlength="200" placeholder="Ex.: retenções até à semana de…"></label></details><button type="submit">Adicionar à equipa</button></form></details><div id="gt-inactive" class="tips-inactive"></div><button class="tips-block" type="button" data-step="pay">Rever pagamentos</button></section>
    <section class="card hidden" data-panel="pay"><h3>Valores a entregar</h3><div id="gt-payments"></div><div id="gt-totals" class="tips-total" aria-live="polite"></div><button id="gt-suggestions" class="ghost" type="button">Repor sugestões</button><p id="gt-calc-error" class="tips-error" role="alert"></p><button id="gt-review" class="tips-block" type="button">Conferir e confirmar</button><div id="gt-confirmation" class="tips-confirmation hidden"><p id="gt-confirm-text"></p><p class="tips-caption">Confirma depois de entregares estes valores. O registo fica fechado e não pode ser alterado.</p><div class="actions form-actions"><button id="gt-confirm" type="button">Registar pagamentos entregues</button><button id="gt-cancel-confirm" class="ghost" type="button">Voltar</button></div></div></section>
    <div class="actions tips-tools"><button id="gt-save-draft" class="secondary" type="button">Guardar rascunho</button><span id="gt-draft-status" class="status" aria-live="polite"></span></div>
    <details class="tips-history"><summary>Histórico e saldos</summary><div class="actions tips-tools"><button id="gt-export" class="secondary" type="button">Exportar CSV</button></div><div id="gt-balances"></div><div id="gt-history"></div></details>`;
  function msg(text,ok=false){el('message').textContent=text;el('message').className=text?(ok?'ok':'error'):'';}
  function controls(){root.classList.toggle('tips-loading',busy);root.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=busy||!loaded);el('refresh').disabled=busy||!user;}
  function newDraft(){const week=state.weeks.length?addDate(state.weeks.at(-1).week,7):monday(new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Lisbon'}));return {week,days:Array(7).fill(null),counted:null,note:'',entries:state.staff.filter(p=>p.active).map(p=>({id:p.id,minutes:0,retain:p.retain,leaving:false,paid:null}))};}
  function ensureEntries(){const old=draft.entries;draft.entries=state.staff.filter(p=>p.active).map(p=>old.find(e=>e.id===p.id)??{id:p.id,minutes:0,retain:p.retain,leaving:false,paid:null});}
  function readDraft(allowInvalidPayments=false,partial=false){
    const out=structuredClone(draft);out.week=el('week').value;
    if(monday(out.week)!==out.week)throw new Error('Escolhe uma segunda-feira como início da semana.');
    out.days=[...root.querySelectorAll('[data-day]')].map(x=>parseMoney(x.value,partial));out.counted=parseMoney(el('counted').value,true);out.note=el('note').value.trim();
    for(const e of out.entries){e.minutes=parseHours(root.querySelector(`[data-hours="${e.id}"]`).value);e.retain=root.querySelector(`[data-retain="${e.id}"]`).checked;e.leaving=root.querySelector(`[data-leaving="${e.id}"]`).checked;if(!allowInvalidPayments&&e.paid!==null&&(!Number.isSafeInteger(e.paid)||e.paid<0))throw new Error('Corrige o valor a entregar antes de continuar.');}
    return out;
  }
  function valuesSummary(){try{const inputs=[...root.querySelectorAll('[data-day]')];const complete=inputs.every(x=>x.value.trim()!=='');const daily=inputs.reduce((s,x)=>s+(parseMoney(x.value,true)??0),0),counted=parseMoney(el('counted').value,true);el('daily').textContent=money(daily)+(complete?'':' · incompleto');el('total').textContent=money(counted??daily);el('difference').textContent=counted===null?'Distribuição pelo total dos emails.':`Diferença do dinheiro contado: ${money(counted-daily)}`;}catch(error){el('daily').textContent='—';el('total').textContent='—';el('difference').textContent=error.message;}}
  function fill(){
    ensureEntries();el('week').value=draft.week;el('week').disabled=state.weeks.length>0;
    el('period').textContent=range(draft.week)+(monthFinal(draft.week)?' · Fecho do mês: devolver todos os saldos':' · Retenção ajustável aos pagamentos');
    el('days').innerHTML=days.map((d,i)=>`<label>${d}<input data-day="${i}" type="text" inputmode="decimal" aria-label="Gorjetas de ${d} em euros" value="${draft.days[i]===null?'':euros(draft.days[i])}"></label>`).join('');
    el('counted').value=draft.counted===null?'':euros(draft.counted);el('note').value=draft.note;
    el('team').innerHTML=state.staff.filter(p=>p.active).map(p=>{const e=draft.entries.find(x=>x.id===p.id);return `<div class="tips-person"><div class="tips-person-main"><div><strong>${escape(p.name)}</strong><small>${p.retain?'Equipa':'Extra · sem retenção'} · saldo ${money(p.balance)}</small></div><label>Horas<input data-hours="${p.id}" value="${hours(e.minutes)}" aria-label="Horas de ${escape(p.name)}" inputmode="decimal"></label></div><details><summary>Opções desta pessoa</summary><label class="tips-check"><input type="checkbox" data-retain="${p.id}" ${e.retain?'checked':''}>Reter cerca de 5%</label><label class="tips-check"><input type="checkbox" data-leaving="${p.id}" ${e.leaving?'checked':''}>Sai esta semana: liquidar tudo</label>${p.linked?`<button type="button" class="ghost" data-import="${p.id}">Importar as minhas horas da semana</button>`:''}<div class="tips-form"><label>Nome<input data-name="${p.id}" maxlength="80" value="${escape(p.name)}"></label><label class="tips-check"><input type="checkbox" data-linked="${p.id}" ${p.linked?'checked':''}>Esta pessoa sou eu</label><button type="button" class="secondary" data-edit="${p.id}">Guardar opções da pessoa</button></div></details></div>`;}).join('')||'<p class="tips-caption">Adiciona as pessoas da equipa. As horas dos extras também entram na distribuição.</p>';
    el('inactive').textContent=state.staff.filter(p=>!p.active).map(p=>`${p.name}: saída liquidada, saldo ${money(p.balance)}`).join(' · ');
    renderHistory();valuesSummary();renderPayments();navigate(step);controls();el('week').disabled=busy||!loaded||state.weeks.length>0;
  }
  function navigate(next){step=next;root.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==step));root.querySelectorAll('.tips-steps button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.step===step)));if(step==='pay')renderPayments();}
  function renderPayments(){
    el('confirmation').classList.add('hidden');el('review').disabled=true;el('payments').innerHTML='';el('totals').textContent='';
    try{
      const out=readDraft(true),base=calculate({...out,entries:out.entries.map(e=>({...e,paid:null}))},state.staff);
      el('payments').innerHTML=base.payments.map(p=>{const entry=draft.entries.find(e=>e.id===p.id),paid=entry.paid??p.suggested;return `<div class="tips-person"><div class="tips-person-main"><div><strong>${escape(p.name)}</strong><small>${p.settle?'Liquidação completa':`Saldo após pagamento: ${money(p.before+p.gross-paid)}`}</small></div><label>Entregar (€)<input data-paid="${p.id}" type="text" inputmode="decimal" value="${euros(paid)}" aria-label="Pagamento de ${escape(p.name)}"></label></div><details><summary>Ver cálculo e saldo</summary><div class="tips-detail"><span>Horas da semana</span><span>${hours(p.minutes)}</span></div><div class="tips-detail"><span>Gorjeta da semana</span><span>${money(p.gross)}</span></div><div class="tips-detail"><span>Saldo anterior</span><span>${money(p.before)}</span></div><div class="tips-detail"><span>Sugestão</span><span>${money(p.suggested)}</span></div><div class="tips-detail"><span>Saldo após pagamento</span><span>${money(p.before+p.gross-paid)}</span></div></details></div>`;}).join('');
      const result=calculate(out,state.staff);el('totals').textContent=`Entregar: ${money(result.paid)} · Saldo da equipa: ${money(result.balance)}`;el('calc-error').textContent='';el('review').disabled=busy||!loaded;
    }catch(error){el('calc-error').textContent=error.message;}
  }
  function renderHistory(){
    el('balances').innerHTML=state.staff.map(p=>`<div class="tips-detail"><span>${escape(p.name)}${p.active?'':' · inativo'}</span><span>${money(p.balance)}</span></div>`).join('');
    el('history').innerHTML=[...state.weeks].reverse().map(w=>`<details class="tips-history-item"><summary>${range(w.week)} · ${money(w.total)}${w.close?' · Fecho do mês':''}</summary><p class="tips-caption">Emails: ${money(w.daily)} · contado: ${w.counted===null?'não indicado':money(w.counted)}${w.note?' · '+escape(w.note):''}<br>Confirmado em ${new Date(w.confirmed_at).toLocaleString('pt-PT',{timeZone:'Europe/Lisbon'})}</p><details class="tips-tools"><summary>Ver fechos diários</summary>${w.days.map((c,i)=>`<div class="tips-detail"><span>${days[i]} · ${addDate(w.week,i).split('-').reverse().join('/')}</span><span>${money(c)}</span></div>`).join('')}</details><div class="tips-history-table"><table><thead><tr><th>Pessoa</th><th>Horas</th><th>Gorjeta</th><th>Saldo anterior</th><th>Pago</th><th>Saldo final</th></tr></thead><tbody>${w.payments.map(p=>`<tr><td>${escape(p.name)}${p.leaving?' · saiu':''}</td><td>${hours(p.minutes)}</td><td>${money(p.gross)}</td><td>${money(p.before)}</td><td>${money(p.paid)}</td><td>${money(p.balance)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')||'<p class="tips-caption">Ainda não há pagamentos confirmados.</p>';
  }
  async function reload(force=false){
    if(busy||!user)return;if(!force&&dirty&&!confirm('Atualizar descarta as alterações ainda não guardadas. Continuar?'))return;
    busy=true;controls();const token=version;
    try{const {data,error}=await supabase.from('personal_tip_ledgers').select('state,revision').eq('user_id',user.id).maybeSingle();if(token!==version)return;if(error)throw error;state=data?.state??{staff:[],weeks:[],draft:null};revision=data?.revision??0;draft=structuredClone(state.draft??newDraft());loaded=true;dirty=false;fill();el('draft-status').textContent=state.draft?'Rascunho guardado':'Nova semana';msg('');}
    catch(error){if(token===version){loaded=false;msg('Não foi possível carregar as gorjetas. '+error.message);}}
    finally{if(token===version){busy=false;controls();if(loaded){el('week').disabled=state.weeks.length>0;renderPayments();}}}
  }
  async function command(action,payload){
    if(busy||!loaded)return false;
    const preserve=['add_staff','edit_staff'].includes(action)?readDraft(true,true):null,wasDirty=dirty;
    busy=true;controls();const token=version;
    try{const {data,error}=await supabase.rpc('personal_tip_command',{p_action:action,p_payload:payload,p_revision:revision});if(token!==version)return false;if(error)throw error;state=data.state;revision=data.revision;draft=preserve??structuredClone(state.draft??newDraft());dirty=preserve?wasDirty:false;fill();msg(action==='confirm'?'Pagamentos registados. Os saldos foram atualizados.':action==='save_draft'?'Rascunho guardado.':'Equipa atualizada.',true);el('draft-status').textContent=dirty?'Alterações por guardar':action==='save_draft'?'Rascunho guardado':'Sincronizado';return true;}
    catch(error){if(token===version)msg(error.message+' Se não tens a certeza de que foi guardado, atualiza antes de repetir.');return false;}
    finally{if(token===version){busy=false;controls();if(loaded){el('week').disabled=state.weeks.length>0;renderPayments();}}}
  }
  function markDirty(){dirty=true;el('draft-status').textContent='Alterações por guardar';el('confirmation').classList.add('hidden');}
  root.addEventListener('input',e=>{if(e.target.matches('[data-day],#gt-counted,#gt-note,[data-hours]')){markDirty();draft.entries.forEach(x=>x.paid=null);valuesSummary();}if(e.target.matches('[data-paid]')){markDirty();const entry=draft.entries.find(x=>x.id===e.target.dataset.paid);try{entry.paid=parseMoney(e.target.value);}catch{entry.paid=Number.NaN;}el('review').disabled=true;}});
  root.addEventListener('change',e=>{
    try{
      if(e.target.matches('#gt-week')){const selected=monday(e.target.value);if(selected!==draft.week){if(dirty&&!confirm('Mudar de semana descarta o rascunho ainda não guardado. Continuar?')){el('week').value=draft.week;return;}draft={...newDraft(),week:selected};dirty=false;fill();}return;}
      if(e.target.dataset.paid){const entry=draft.entries.find(x=>x.id===e.target.dataset.paid);entry.paid=parseMoney(e.target.value);markDirty();renderPayments();return;}
      if(e.target.matches('[data-retain],[data-leaving]')){markDirty();draft.entries.forEach(x=>x.paid=null);}
    }catch(error){el('calc-error').textContent=error.message;el('review').disabled=true;}
  });
  root.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||busy||!loaded)return;
    if(b.dataset.step){navigate(b.dataset.step);return;}
    if(b.dataset.import){const first=el('week').value,last=addDate(first,6),mins=getWorkRows().filter(r=>r.work_date>=first&&r.work_date<=last).reduce((sum,r)=>{if(['day_off','vacation'].includes(r.day_type))return sum;if(Number.isInteger(r.duration_minutes))return sum+r.duration_minutes;if(!r.start_time||!r.end_time)return sum;const a=r.start_time.split(':').map(Number),z=r.end_time.split(':').map(Number);return sum+(z[0]*60+z[1]-a[0]*60-a[1]+1440)%1440;},0);root.querySelector(`[data-hours="${b.dataset.import}"]`).value=hours(mins);draft.entries.forEach(x=>x.paid=null);markDirty();return;}
    if(b.dataset.edit){try{await command('edit_staff',{id:b.dataset.edit,name:root.querySelector(`[data-name="${b.dataset.edit}"]`).value,retain:root.querySelector(`[data-retain="${b.dataset.edit}"]`).checked,linked:root.querySelector(`[data-linked="${b.dataset.edit}"]`).checked});}catch(error){msg(error.message);}}
  });
  el('person-form').onsubmit=async e=>{e.preventDefault();try{const opening=parseMoney(el('opening').value);if(opening>0&&!el('opening-note').value.trim())throw new Error('Indica a origem do saldo inicial.');if(await command('add_staff',{name:el('name').value,opening,opening_note:el('opening-note').value.trim(),retain:el('retain').checked,linked:el('linked').checked})){el('person-form').reset();el('opening').value='0';el('new').open=false;}}catch(error){msg(error.message);}};
  el('refresh').onclick=()=>reload();
  el('zero').onclick=()=>{root.querySelectorAll('[data-day]').forEach(x=>{if(!x.value.trim())x.value='0';});draft.entries.forEach(x=>x.paid=null);markDirty();valuesSummary();};
  el('suggestions').onclick=()=>{draft.entries.forEach(x=>x.paid=null);markDirty();renderPayments();};
  el('save-draft').onclick=async()=>{try{await command('save_draft',readDraft());}catch(error){msg(error.message);}};
  el('review').onclick=()=>{try{const result=calculate(readDraft(),state.staff);el('confirm-text').textContent=`Semana ${range(el('week').value)}. Registar ${money(result.paid)} entregues a ${result.payments.length} pessoas. Saldo restante: ${money(result.balance)}.${result.close?' Fecho do mês: todos os saldos ficam a zero.':''}`;el('confirmation').classList.remove('hidden');}catch(error){msg(error.message);}};
  el('cancel-confirm').onclick=()=>el('confirmation').classList.add('hidden');
  el('confirm').onclick=async()=>{try{const payload=readDraft();calculate(payload,state.staff);await command('confirm',payload);}catch(error){msg(error.message);}};
  el('export').onclick=()=>{
    const rows=[['Semana','Pessoa','Horas','Gorjeta EUR','Saldo anterior EUR','Pago EUR','Saldo final EUR','Fecho do mes','Saida','Nota']];
    for(const p of state.staff)rows.push(['Saldo inicial',p.name,'','',euros(p.opening),'',euros(p.opening),'','',p.opening_note??'']);
    for(const w of state.weeks)for(const p of w.payments)rows.push([w.week,p.name,hours(p.minutes),euros(p.gross),euros(p.before),euros(p.paid),euros(p.balance),w.close?'Sim':'Nao',p.leaving?'Sim':'Nao',w.note]);
    const quote=s=>'"'+String(s).replace(/^[=+@-]/,"'").replaceAll('"','""')+'"';
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='gorjetas-historico.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  return {async setSession(next){if(next?.id===user?.id)return;version++;user=next??null;loaded=false;busy=false;dirty=false;state={staff:[],weeks:[],draft:null};draft=null;revision=0;el('history').innerHTML='';el('balances').innerHTML='';el('team').innerHTML='';el('payments').innerHTML='';controls();if(user)await reload(true);},refresh:reload};
}
