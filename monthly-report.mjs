// Document data stays in the browser; only the pinned PDF library is fetched.
export async function createMonthlyReport({month,label,entries,total,exportedAt}){
 const {PDFDocument,StandardFonts,rgb}=await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
 const doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setTitle('OTTO - '+label);doc.setAuthor('OTTO');doc.setSubject('Registo mensal de trabalho');
 const clean=value=>String(value).normalize('NFKC').replace(/[^\x20-\x7e\xa0-\xff]/g,'-');
 let page,y;
 const text=(value,x,top,size=10,font=regular)=>page.drawText(clean(value),{x,y:top,size,font,color:rgb(.12,.14,.16)});
 const heading=()=>{page=doc.addPage([595.28,841.89]);y=805;text('OTTO',36,y,17,bold);text('Registo mensal de trabalho',36,y-=29,15,bold);text(label,36,y-=22,12);text('Total de horas trabalhadas: '+total,36,y-=28,13,bold);text('Férias e folgas não somam horas de trabalho.',36,y-=19,9);y-=31;['Dia','Tipo','Entrada','Saída','Pausas','Horas'].forEach((v,i)=>text(v,[36,102,220,295,367,470][i],y,10,bold));y-=10;page.drawLine({start:{x:36,y},end:{x:559,y},thickness:.6,color:rgb(.7,.72,.74)});y-=21;};
 heading();
 for(const entry of entries){if(y<80)heading();[entry.date,entry.type,entry.start,entry.end,entry.breaks,entry.hours].forEach((v,i)=>text(v,[36,102,220,295,367,470][i],y));y-=18;}
 if(!entries.length)text('Sem registos neste mês.',36,y);
 for(const [index,p] of doc.getPages().entries()){
  page=p;text('Registos pessoais. Os totais respeitam pausas e correções guardadas.',36,45,8);
  text('Exportado em '+exportedAt,36,31,8);text((index+1)+' / '+doc.getPageCount(),516,31,8);
 }
 return new File([await doc.save()],'OTTO-turnos-'+month+'.pdf',{type:'application/pdf'});
}
