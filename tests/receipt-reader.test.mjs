import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReceipt,amountCents} from '../receipt-reader.mjs';
test('Portuguese currency uses exact cents and rejects ambiguous or excessive values',()=>{
 assert.equal(amountCents('1.234,56'),123456);assert.equal(amountCents('1 234,56'),123456);assert.equal(amountCents('12.34'),1234);assert.equal(amountCents('1,2'),null);assert.equal(amountCents('1000000,00'),null);
});
test('payroll separates salary, food and redeemed PPR and ignores the duplicated original',()=>{
 const text=`Recibo Janeiro 2026\nVencimento Base 1.000,00 €\nSubsídio alimentação 100,00 €\nPlano Poupança Reforma 300,00 €\nIRS taxa de 5,00% 50,00 €\nSegurança Social taxa de 11% 110,00 €\nVencimento Líquido (a receber) 1.240,00 €`;
 const r=parseReceipt(text+'\nDuplicado\n'+text,'payroll');assert.equal(r.month,'2026-01');assert.equal(r.values.salary,84000);assert.equal(r.values.food,10000);assert.equal(r.values.ppr,30000);assert.equal(r.values.ss,11000);assert.equal(r.values.irs,5000);assert.equal(r.values.net,124000);
 assert.equal(r.values.salary+r.values.food+r.values.ppr,r.values.net);
});
test('Coverflex recognises attributed benefits independently from redemptions',()=>{
 const r=parseReceipt('Coverflex\nSetembro 2026\nAlimentação 100,00 €\nPrémio 200,00 €','coverflex');assert.equal(r.month,'2026-09');assert.equal(r.values.food,10000);assert.equal(r.values.bonus,20000);assert.equal(r.values.ppr,undefined);
 const p=parseReceipt('Outubro 2026\nResgate PPR 200,00 €','coverflex');assert.equal(p.values.ppr,20000);assert.equal(p.values.bonus,undefined);
});
test('unknown documents remain empty instead of inventing values or periods',()=>{
 const r=parseReceipt('Obrigado por utilizar o serviço.','payroll');assert.equal(r.hasValues,false);assert.deepEqual(r.values,{});assert.equal(r.month,null);
});

test('a Coverflex balance is not an attributed monthly benefit',()=>{const r=parseReceipt('Saldo\nAlimentação\n100,00 €\nPrémio\n200,00 €','coverflex');assert.equal(r.hasValues,false)});

test('Coverflex payment in the following month belongs to the previous work month',()=>{
 const r=parseReceipt('Carregamento de Benefícios\n02/10/2026\n+743,58€\nCarregamento de Alimentação\n02/10/2026\n+78,00€','coverflex');
 assert.equal(r.values.bonus,74358);assert.equal(r.values.food,7800);assert.equal(r.month,'2026-09');assert.equal(r.paymentMonth,'2026-10');
 assert.equal(parseReceipt('Carregamento de Benefícios 100,00€\n02/01/2026','coverflex').month,'2025-12');
});
test('new payroll labels and offset Coverflex deductions do not inflate net salary',()=>{
 const r=parseReceipt('Setembro 2026\nVencimento Base Hora 150.00 1200,00 €\nSubsidio de Alimentação 10.0 60,00 €\nCoverflex Poupança e Reforma F 1.0 300,00 €\nDesconto Coverflex Poupança e Reforma F 1.0 300,00 €\nValor a receber: 960,00 €','payroll');
 assert.equal(r.values.net,96000);assert.equal(r.values.ppr,0);assert.equal(r.values.salary,90000);
});

test('Coverflex OCR can merge payment dates and credits onto the same line',()=>{
 const r=parseReceipt('Carregamento de Benefícios\n02/10/2026 +743,58€\nCarregamento de Alimentação\n02/10/2026 +78,00€','coverflex');
 assert.equal(r.values.bonus,74358);assert.equal(r.values.food,7800);assert.equal(r.month,'2026-09');
 const invalid=parseReceipt('Carregamento de Benefícios\n02/10/2026\nCarregamento de Alimentação\n02/10/2026 -78,00€','coverflex');assert.deepEqual(invalid.values,{});
});
