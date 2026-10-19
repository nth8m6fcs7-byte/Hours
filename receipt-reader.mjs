// Recognition stays in the browser. Never sends document bytes to an OCR/AI service.
const months=['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function amountCents(text){
 const match=String(text).trim().match(/^(\d{1,3}(?:[.\s]\d{3})+|\d+)[,.](\d{2})$/);
 if(!match)return null;const cents=Number(match[1].replace(/[.\s]/g,''))*100+Number(match[2]);
 return Number.isSafeInteger(cents)&&cents<=99999999?cents:null;
}
function amounts(line){return [...line.matchAll(/(?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2}(?!\d)\s*€?/g)].filter(m=>!line.slice(m.index+m[0].length).trimStart().startsWith('%')).map(m=>amountCents(m[0].replace('€','').trim())).filter(v=>v!==null)}
export function parseReceipt(text,kind){
 const lines=String(text).replace(/(\d)[,.]\s+(\d{2})(?!\d)/g,'$1,$2').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),evidence={},values={};
 if(kind==='coverflex'&&/\bsaldo\b/.test(normalize(text))&&!/carregamento|creditad|atribu[ií]d|movimento|transac/.test(normalize(text)))return {values,evidence,month:null,hasValues:false};
 // Pick a labelled value, never sum repeated Original/Duplicado copies or card balances.
 const find=(key,pattern)=>{for(let i=0;i<lines.length;i++){if(!pattern.test(normalize(lines[i]))||/saldo|disponivel|compra|despesa/.test(normalize(lines[i]))||/[-−]\s*\d/.test(lines[i]))continue;const numbers=amounts(lines[i]);if(numbers.length){values[key]=numbers.at(-1);evidence[key]=lines[i];return}if(kind==='coverflex'){for(let j=i+1;j<=Math.min(i+3,lines.length-1);j++){if(/carregamento|premio|alimentacao|resgate/.test(normalize(lines[j])))break;const credit=lines[j].replace(/\b\d{1,2}[/.\-]\d{1,2}[/.\-]20\d{2}\b/g,'').trim();if(/^\+?[\d.,\s]+(?:€|EUR)?$/i.test(credit)){const a=amounts(credit);if(a.length){values[key]=a.at(-1);evidence[key]=lines[i];return}}}}if(i+1<lines.length&&/^\s*[\d.,\s€]+$/.test(lines[i+1])){const next=amounts(lines[i+1]);if(next.length){values[key]=next.at(-1);evidence[key]=lines[i]+' '+lines[i+1];return}}}};
 if(kind==='payroll'){
  find('gross',/vencimento (?:base|bruto)|salario (?:base|bruto)/);find('food',/subs[ií]dio.*alimenta|subsidio.*refeicao/);
  find('ppr',/plano poupanca reforma|resgate.*ppr|ppr.*resgat/);find('irs',/^irs\b/);find('ss',/seguranca social/);find('net',/valor a receber|vencimento liquido|liquido (?:a receber|do recibo)|total liquido/);
  find('ppr',/^coverflex poupanca e reforma/);
  const deduction={};for(const line of lines){if(/^desconto coverflex poupanca e reforma/.test(normalize(line))){const a=amounts(line);if(a.length)deduction.ppr=a.at(-1)}}
  if(values.ppr!==undefined&&deduction.ppr!==undefined)values.ppr=Math.max(0,values.ppr-deduction.ppr);
  if(values.net!==undefined){const salary=values.net-(values.food??0)-(values.ppr??0);if(salary>=0){values.salary=salary;evidence.salary='Líquido do recibo menos alimentação e resgate PPR reconhecidos. Confirma a separação.'}}
 }else{
  find('food',/alimentacao|refeicao/);find('bonus',/carregamento.*benef|beneficios|premio|\bbonus\b/);find('ppr',/resgate.*ppr|ppr.*resgat/);
 }
 let month=null,paymentMonth=null;
 for(const line of lines){const clean=normalize(line);const word=clean.match(new RegExp('('+months.join('|')+')[ /-]+(20\\d{2})'));
  if(word){month=word[2]+'-'+String(months.indexOf(word[1])+1).padStart(2,'0');break}
  const numeric=clean.match(/\b(0[1-9]|1[0-2])[./-](20\d{2})\b/);if(numeric){month=numeric[2]+'-'+numeric[1];break}
 }
 if(kind==='coverflex'){
  const date=String(text).match(/\b\d{1,2}[/.](0[1-9]|1[0-2])[/.](20\d{2})\b/);
  if(date){paymentMonth=date[2]+'-'+date[1];const d=new Date(Date.UTC(Number(date[2]),Number(date[1])-2,1));month=d.toISOString().slice(0,7)}
 }
 return {values,evidence,month,paymentMonth,hasValues:Object.keys(values).length>0};
}
let pdfPromise,tesseractPromise;
async function pdfLibrary(){
 if(!pdfPromise)pdfPromise=import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';return pdf}).catch(e=>{pdfPromise=null;throw e});
 return pdfPromise;
}
async function ocr(canvas,onProgress,kind){
 if(!tesseractPromise)tesseractPromise=import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js').catch(e=>{tesseractPromise=null;throw e});
 const module=await tesseractPromise;const {createWorker}=module.default||module;
 const worker=await createWorker('por',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int',logger:m=>{if(m.status==='recognizing text')onProgress?.('A ler a imagem… '+Math.round(m.progress*100)+'%')}});
 try{
  let text=(await worker.recognize(canvas)).data.text;
  if(kind==='coverflex'){
   let parsed=parseReceipt(text,kind);
   if(parsed.values.food===undefined||parsed.values.bonus===undefined){
    onProgress?.('A confirmar os carregamentos…');
    // A single text block keeps right-aligned credits next to their labels.
    await worker.setParameters({tessedit_pageseg_mode:'6'});
    const retry=(await worker.recognize(canvas)).data.text,next=parseReceipt(retry,kind);
    for(const [key,label] of [['food','Alimentação'],['bonus','Prémio']]){if(parsed.values[key]===undefined&&next.values[key]!==undefined)text+='\n'+label+' '+(next.values[key]/100).toFixed(2)+' €'}
   }
  }
  return text;
 }finally{await worker.terminate()}
}
async function photoCanvas(file){
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas}finally{URL.revokeObjectURL(url)}
}
export async function recognizeDocument(file,kind,onProgress){
 if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Escolhe um PDF ou uma imagem JPG, PNG ou WebP.');
 if(file.size>10*1024*1024)throw new Error('O documento pode ter até 10 MB.');
 onProgress?.('A abrir o documento…');let text='';
 if(file.type==='application/pdf'){
  const pdf=await pdfLibrary(),doc=await pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  try{
   if(doc.numPages>5)throw new Error('Escolhe um documento com até 5 páginas.');
   for(let i=1;i<=doc.numPages;i++){
    const page=await doc.getPage(i),content=await page.getTextContent(),grouped=new Map();
    for(const item of content.items){if(!item.str)continue;const y=Math.round(item.transform[5]/3)*3;if(!grouped.has(y))grouped.set(y,[]);grouped.get(y).push(item)}
    let pageText=[...grouped.entries()].sort((a,b)=>b[0]-a[0]).map(([,items])=>items.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str).join(' ')).join('\n');
    if(pageText.replace(/\s/g,'').length<80){const viewport=page.getViewport({scale:Math.min(2,2400/Math.max(page.view[2],page.view[3]))}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;pageText=await ocr(canvas,onProgress)}
    text+=pageText+'\n';
   }
  }finally{await doc.destroy()}
 }else text=await ocr(await photoCanvas(file),onProgress,kind);
 return parseReceipt(text,kind);
}
