// Terceira leva: fecha as lacunas apontadas na auditoria das NTs de outubro/2026.
//
//   NT 2026.008 v1.01  valor líquido por item e ICMS previsto no pagamento antecipado
//   NT 2026.005 v1.00  Simples Nacional: tpRegimeIBSCBS, cAtivSN e gTribSN
//   NT 2026.007 v1.11  emitente exclusivo do IBS/CBS (sem IE)
//   NT 2026.004 v1.01  CNPJ alfanumérico do transportador
//
// Rodar com `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { carregarApp, contextoLimpo, nfe } from './apoio/carrega.mjs';

const app = contextoLimpo(carregarApp());
const { parseXML, renderDANFE } = app;

const erro = (doc, re) => doc.alertas.filter(a => a.nivel === 'erro' && re.test(a.texto));
const aviso = (doc, re) => doc.alertas.filter(a => a.nivel === 'aviso' && re.test(a.texto));

const ideCom = extra => `<ide><cUF>35</cUF><natOp>VENDA</natOp><mod>55</mod><serie>1</serie>
  <nNF>456</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb>
  <tpImp>1</tpImp><tpEmis>1</tpEmis><finNFe>1</finNFe>${extra}</ide>`;

const IMPOSTO_ICMS = `<imposto>
  <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><pICMS>18.00</pICMS><vICMS>3.60</vICMS></ICMS00></ICMS>
</imposto>`;

const IMPOSTO_RTC = `<imposto>
  <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><pICMS>18.00</pICMS><vICMS>3.60</vICMS></ICMS00></ICMS>
  <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
    <gIBSCBS><vBC>20.00</vBC>
      <gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>2.00</vIBSUF></gIBSUF>
      <gCBS><pCBS>0.90</pCBS><vCBS>18.00</vCBS></gCBS>
    </gIBSCBS>
  </IBSCBS>
</imposto>`;

const IMPOSTO_RTC_SEM_ICMS = IMPOSTO_RTC.replace(/<ICMS>[\s\S]*?<\/ICMS>/, '');

const TOTAL_RTC = `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot>
  <IBSCBSTot><gIBS><gIBSUF><vIBSUF>2.00</vIBSUF></gIBSUF><vIBS>2.00</vIBS></gIBS>
    <gCBS><vCBS>18.00</vCBS></gCBS></IBSCBSTot>`;

const GTRIBSN = `<gTribSN><gIBSSN><pIBSSN>0.50</pIBSSN><vIBSSN>0.10</vIBSSN></gIBSSN>
  <gCBSSN><pCBSSN>1.20</pCBSSN><vCBSSN>0.24</vCBSSN></gCBSSN></gTribSN>`;

const IMPOSTO_SN = IMPOSTO_RTC.replace('</gIBSCBS>', GTRIBSN + '</gIBSCBS>');

const TOTAL_SN = TOTAL_RTC.replace('</IBSCBSTot>',
  '<gTribSN><vIBSSN>0.10</vIBSSN><vCBSSN>0.24</vCBSSN></gTribSN></IBSCBSTot>');

const EMIT_SEM_IE = `<emit><CNPJ>12345678000195</CNPJ><xNome>EMPRESA EXEMPLO LTDA</xNome>
  <CRT>3</CRT><enderEmit><xLgr>RUA A</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
  <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit></emit>`;

/** Emitente padrão; `extra` entra depois do CRT e `semIE` remove a inscrição estadual. */
const emitCom = (extra = '', semIE = false) => `<emit><CNPJ>12345678000195</CNPJ>
  ${semIE ? '' : '<IE>123456789</IE>'}<xNome>EMPRESA EXEMPLO LTDA</xNome><CRT>3</CRT>${extra}
  <enderEmit><xLgr>RUA A</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
  <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit></emit>`;

// ---------------------------------------------------------------------------
// NT 2026.004 — CNPJ alfanumérico do transportador
// ---------------------------------------------------------------------------
test('NT 2026.004: CNPJ alfanumérico do transportador é mascarado sem perder letras', () => {
  const transp = `<transp><modFrete>0</modFrete><transporta><CNPJ>12ABC34501DE35</CNPJ>
    <xNome>TRANSPORTADORA ALFA</xNome></transporta></transp>`;
  const html = renderDANFE(parseXML(nfe({ transp }), 'transp-alfa.xml'));

  assert.match(html, /12\.ABC\.345\/01DE-35/);
  assert.doesNotMatch(html, /123450135/);
});

// ---------------------------------------------------------------------------
// NT 2026.008 v1.01 — valor líquido do produto
// ---------------------------------------------------------------------------
test('NT 2026.008: valor líquido unitário e do item aparecem no item', () => {
  const prodExtra = '<vUnComLiq>9.5000</vUnComLiq><vProdLiq>19.00</vProdLiq>';
  const html = renderDANFE(parseXML(nfe({ prodExtra }), 'liq-item.xml'));

  assert.match(html, /V\. unit\. líquido/i);
  assert.match(html, /9,5000/);
  assert.match(html, /V\. líquido/i);
  assert.match(html, /19,00/);
});

test('NT 2026.008: ICMS previsto é lido do grupo NB do item (não do total)', () => {
  const imposto = IMPOSTO_ICMS.replace('</ICMS>',
    '<ICMSPrevistoPagtoAntecip><vICMSPrevisto>0.42</vICMSPrevisto></ICMSPrevistoPagtoAntecip></ICMS>');
  const doc = parseXML(nfe({ imposto, ide: ideCom('<tpNFDebito>06</tpNFDebito>') }), 'nb.xml');

  assert.equal(doc.itens[0].vICMSPrevisto, 0.42);
  assert.match(renderDANFE(doc), /ICMS previsto[^<]*0,42/);
});

test('NT 2026.008 RV I11c-20: vProdLiq tem de ser vUnComLiq × qCom', () => {
  const prodExtra = '<vUnComLiq>9.5000</vUnComLiq><vProdLiq>99.00</vProdLiq>';
  const doc = parseXML(nfe({ prodExtra, total: '<ICMSTot><vProd>20.00</vProd><vProdLiqTot>99.00</vProdLiqTot></ICMSTot>' }), 'i11c.xml');

  assert.ok(erro(doc, /Valor Líquido do Produto difere|I11c-20/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.008 RV W01a-10: vProdLiq no item exige vProdLiqTot no total', () => {
  const prodExtra = '<vUnComLiq>9.5000</vUnComLiq><vProdLiq>19.00</vProdLiq>';
  const doc = parseXML(nfe({ prodExtra }), 'w01a10.xml');

  assert.ok(erro(doc, /Total Líquido não informado|W01a-10/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.008 RV W01a-20: vProdLiqTot tem de ser a soma dos itens', () => {
  const prodExtra = '<vUnComLiq>9.5000</vUnComLiq><vProdLiq>19.00</vProdLiq>';
  const total = '<ICMSTot><vProd>20.00</vProd><vProdLiqTot>99.00</vProdLiqTot></ICMSTot>';
  const doc = parseXML(nfe({ prodExtra, total }), 'w01a20.xml');

  assert.ok(erro(doc, /Total Líquido difere|W01a-20/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.008 RV NB01-20: grupo NB só cabe em pagamento antecipado', () => {
  const imposto = IMPOSTO_ICMS.replace('</ICMS>',
    '<ICMSPrevistoPagtoAntecip><vICMSPrevisto>0.42</vICMSPrevisto></ICMSPrevistoPagtoAntecip></ICMS>');
  const doc = parseXML(nfe({ imposto }), 'nb20.xml');

  assert.ok(erro(doc, /ICMS Previsto no Pagamento Antecipado.*indevidamente|NB01-20/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.008 RV NB01-30: pagamento antecipado sem o grupo NB é avisado (2027)', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_ICMS, ide: ideCom('<tpNFDebito>06</tpNFDebito>') }), 'nb30.xml');

  assert.ok(aviso(doc, /ICMS Previsto no Pagamento Antecipado.*não informado|NB01-30/i).length,
    `aviso esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

// ---------------------------------------------------------------------------
// NT 2026.005 v1.00 — Simples Nacional
// ---------------------------------------------------------------------------
test('NT 2026.005: tpRegimeIBSCBS é impresso com a descrição do código', () => {
  const emit = emitCom('<tpRegimeIBSCBS>2</tpRegimeIBSCBS>');
  const html = renderDANFE(parseXML(nfe({ emit }), 'tpreg.xml'));

  assert.match(html, /2 - .*Simples Nacional/i);
  assert.doesNotMatch(html, /campo reservado na NT/);
});

test('NT 2026.005: cAtivSN do item é lido e impresso', () => {
  const doc = parseXML(nfe({ prodExtra: '<cAtivSN>01</cAtivSN>' }), 'cativ.xml');

  assert.equal(doc.itens[0].cAtivSN, '01');
  assert.match(renderDANFE(doc), /cAtivSN[^<]*01|Atividade SN[^<]*01/);
});

test('NT 2026.005: gTribSN do item é lido e impresso (IBS/CBS do Simples)', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_SN, total: TOTAL_SN }), 'sn-item.xml');
  const html = renderDANFE(doc);

  assert.equal(doc.itens[0].gTribSN.vIBSSN, 0.1);
  assert.equal(doc.itens[0].gTribSN.vCBSSN, 0.24);
  assert.equal(doc.itens[0].gTribSN.pIBSSN, 0.5);
  assert.match(html, /IBS SN|IBS Simples/i);
  assert.match(html, /CBS SN|CBS Simples/i);
  assert.match(html, /0,50%/);
  assert.match(html, /1,20%/);
});

test('NT 2026.005: totais gTribSN (vIBSSN/vCBSSN) aparecem no bloco da Reforma', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_SN, total: TOTAL_SN }), 'sn-total.xml');
  const html = renderDANFE(doc);

  assert.equal(doc.reforma.vIBSSN, 0.1);
  assert.equal(doc.reforma.vCBSSN, 0.24);
  assert.match(html, /IBS[^<]*Simples Nacional/);
  assert.match(html, /CBS[^<]*Simples Nacional/);
});

test('NT 2026.005 RV W59h-10: item com gTribSN exige total gTribSN', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_SN, total: TOTAL_RTC }), 'w59h10.xml');

  assert.ok(erro(doc, /Simples Nacional não informado|W59h-10/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.005 RV W59h-20: total gTribSN sem item gTribSN é indevido', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC, total: TOTAL_SN }), 'w59h20.xml');

  assert.ok(erro(doc, /Simples Nacional informado indevidamente|W59h-20/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.005 RV W59i-10: total do IBS SN tem de ser a soma dos itens', () => {
  const total = TOTAL_SN.replace('<vIBSSN>0.10</vIBSSN>', '<vIBSSN>9.99</vIBSSN>');
  const doc = parseXML(nfe({ imposto: IMPOSTO_SN, total }), 'w59i.xml');

  assert.ok(erro(doc, /Total do IBS para o Simples Nacional difere|W59i-10/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.005 RV W59j-10: total da CBS SN tem de ser a soma dos itens', () => {
  const total = TOTAL_SN.replace('<vCBSSN>0.24</vCBSSN>', '<vCBSSN>9.99</vCBSSN>');
  const doc = parseXML(nfe({ imposto: IMPOSTO_SN, total }), 'w59j.xml');

  assert.ok(erro(doc, /Total da CBS para o Simples Nacional difere|W59j-10/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.005 §2.3: MEI (CRT 4) não informa o grupo IBSCBS', () => {
  const emit = emitCom().replace('<CRT>3</CRT>', '<CRT>4</CRT>');
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC, emit }), 'mei.xml');

  assert.ok(aviso(doc, /MEI|CRT 4/i).length,
    `aviso esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

// ---------------------------------------------------------------------------
// NT 2026.007 v1.11 — emitente exclusivo do IBS/CBS (sem IE)
// ---------------------------------------------------------------------------
test('NT 2026.007: emitente sem IE é identificado como contribuinte exclusivo', () => {
  const html = renderDANFE(parseXML(nfe({ imposto: IMPOSTO_RTC_SEM_ICMS, emit: EMIT_SEM_IE }), 'exclusivo.xml'));

  assert.match(html, /Contribuinte exclusivo do IBS\/CBS/i);
});

test('NT 2026.007 RV N01-10: sem IE é proibido informar ICMS no item', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC, emit: EMIT_SEM_IE }), 'n0110.xml');

  assert.ok(erro(doc, /ICMS.*contribuinte exclusivo|N01-10/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.007 RV N01-10: nota de crédito tpNFCredito=03 é exceção à vedação do ICMS', () => {
  const ide = ideCom('').replace('<finNFe>1</finNFe>', '<finNFe>5</finNFe><tpNFCredito>03</tpNFCredito>');
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC, emit: EMIT_SEM_IE, ide }), 'n0110exc.xml');

  assert.equal(erro(doc, /N01-10|ICMS.*contribuinte exclusivo/i).length, 0,
    `ICMS é permitido no retorno por recusa total; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.007 RV UB12-11: sem IE o grupo IBS/CBS é obrigatório no item', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_ICMS, emit: EMIT_SEM_IE }), 'ub1211.xml');

  assert.ok(erro(doc, /IBS\/CBS obrigatório.*contribuinte exclusivo|UB12-11/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.007 RV C17-43: sem IE o emitente tem de informar CNPJ', () => {
  const emitCpf = `<emit><CPF>12345678901</CPF><xNome>EMPRESA EXEMPLO LTDA</xNome><CRT>3</CRT>
    <enderEmit><xLgr>RUA A</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><xMun>SAO PAULO</xMun><UF>SP</UF></enderEmit></emit>`;
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC_SEM_ICMS, emit: emitCpf }), 'c1743.xml');

  assert.ok(erro(doc, /CNPJ.*contribuinte exclusivo|C17-43/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.007 RV C18-50: sem IE é proibido informar IEST', () => {
  const emit = EMIT_SEM_IE.replace('<CRT>3</CRT>', '<CRT>3</CRT><IEST>123456789</IEST>');
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC_SEM_ICMS, emit }), 'c1850.xml');

  assert.ok(erro(doc, /IEST.*contribuinte exclusivo|C18-50/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});
