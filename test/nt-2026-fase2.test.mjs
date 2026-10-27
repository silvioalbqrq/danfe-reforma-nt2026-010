// Segunda leva: as quatro pendências da auditoria, agora com o texto oficial em mãos.
//
//   NT 2026.006  split payment — grupo YC (gPgtoVinc/gPgto) no infNFe
//   NT 2026.001  PAA — infPAA, procEmi=4, série 970-989
//   IT 2025.002 v1.70  estrutura do cClassTrib (6 dígitos, prefixo = CST) e cClassTribIS
//   MOC 7 Anexo III  contingência por tpEmis, com o texto exigido no DANFE
//
// Rodar com `node --test test/`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { carregarApp, contextoLimpo, nfe, chaveValidaDe } from './apoio/carrega.mjs';

const app = contextoLimpo(carregarApp());
const { parseXML, renderDANFE } = app;

const erro = (doc, re) => doc.alertas.filter(a => a.nivel === 'erro' && re.test(a.texto));
const ideCom = (extra, serie = '1') => `<ide><cUF>35</cUF><natOp>VENDA</natOp><mod>55</mod><serie>${serie}</serie>
  <nNF>456</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb>
  <tpImp>1</tpImp>${extra}</ide>`;

const PAGTO = `<gPgtoVinc><gPgto nPag="1" idTransacao="TX-2026-0001">
  <tpMeioPgto>17</tpMeioPgto><CNPJReceb>12345678000195</CNPJReceb><CNPJBasePSP>12345678</CNPJBasePSP>
</gPgto></gPgtoVinc>`;

// ---------------------------------------------------------------------------
// NT 2026.006 — split payment
// ---------------------------------------------------------------------------
test('NT 2026.006: o grupo YC é lido do infNFe com nPag e idTransacao como atributos', () => {
  const doc = parseXML(nfe({ extras: PAGTO }), 'split.xml');

  assert.equal(doc.pagamentos.length, 1);
  const p = doc.pagamentos[0];
  assert.equal(p.nPag, '1');
  assert.equal(p.idTransacao, 'TX-2026-0001');
  assert.equal(p.tpMeioPgto, '17');
  assert.equal(p.CNPJReceb, '12345678000195');
  assert.equal(p.CNPJBasePSP, '12345678');
  assert.equal(doc.temPgtoVinc, true);
});

test('NT 2026.006: a vinculação aparece no DANFE com o recebedor mascarado', () => {
  const html = renderDANFE(parseXML(nfe({ extras: PAGTO }), 'split.xml'));

  assert.match(html, /split payment/i);
  assert.match(html, /TX-2026-0001/);
  assert.match(html, /12\.345\.678\/0001-95/);
});

test('NT 2026.006: sem o grupo YC o DANFE não inventa seção de split payment', () => {
  const html = renderDANFE(parseXML(nfe({}), 'sem-split.xml'));

  assert.doesNotMatch(html, /split payment/i);
  assert.doesNotMatch(html, /transa[çc][ãa]o de pagamento/i);
});

test('NT 2026.006 RV YC04-20: idTransacao repetido é rejeição de schema', () => {
  const dois = `<gPgtoVinc>
    <gPgto nPag="1" idTransacao="TX-1"><tpMeioPgto>17</tpMeioPgto><CNPJReceb>12345678000195</CNPJReceb><CNPJBasePSP>12345678</CNPJBasePSP></gPgto>
    <gPgto nPag="2" idTransacao="TX-1"><tpMeioPgto>17</tpMeioPgto><CNPJReceb>12345678000195</CNPJReceb><CNPJBasePSP>12345678</CNPJBasePSP></gPgto>
  </gPgtoVinc>`;
  const doc = parseXML(nfe({ extras: dois }), 'dup.xml');

  assert.ok(erro(doc, /idTransacao.*duplicad|duplicad.*idTransacao/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.006 RV YC05-10: meio de pagamento fora de 2 dígitos é recusado', () => {
  const ruim = PAGTO.replace('<tpMeioPgto>17</tpMeioPgto>', '<tpMeioPgto>1</tpMeioPgto>');
  const doc = parseXML(nfe({ extras: ruim }), 'meio.xml');

  assert.ok(erro(doc, /meio de pagamento/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.006 RV YC06-10: CNPJ do recebedor zerado é recusado', () => {
  const ruim = PAGTO.replace('12345678000195', '00000000000000');
  const doc = parseXML(nfe({ extras: ruim }), 'receb.xml');

  assert.ok(erro(doc, /recebedor/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

// ---------------------------------------------------------------------------
// NT 2026.001 — PAA
// ---------------------------------------------------------------------------
const PAA = `<infPAA><CNPJPAA>12345678000195</CNPJPAA><PAASignature>
  <SignatureValue>YWJj</SignatureValue><RSAKeyValue><Modulus>AQAB</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>
</PAASignature></infPAA>`;

const emitCRT1 = `<emit><CNPJ>12345678000195</CNPJ><xNome>EMPRESA EXEMPLO LTDA</xNome>
  <IE>123456789</IE><CRT>1</CRT><enderEmit><xLgr>RUA A</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
  <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit></emit>`;

const chavePAA = chaveValidaDe({ serie: '980', nNF: '456' });

test('NT 2026.001: nota emitida por PAA é identificada no DANFE', () => {
  const doc = parseXML(nfe({
    ide: ideCom('<procEmi>4</procEmi>', '980'), emit: emitCRT1, chave: chavePAA, extras: PAA
  }), 'paa.xml');

  assert.equal(doc.procEmi, '4');
  assert.equal(doc.paa.cnpj, '12345678000195');
  assert.equal(erro(doc, /PAA/).length, 0, `não pode acusar erro num PAA coerente: ${JSON.stringify(doc.alertas)}`);

  const html = renderDANFE(doc);
  assert.match(html, /PAA/);
  assert.match(html, /12\.345\.678\/0001-95/);
});

test('NT 2026.001 RV 667: procEmi=4 exige série 970-989', () => {
  const doc = parseXML(nfe({
    ide: ideCom('<procEmi>4</procEmi>'), emit: emitCRT1, extras: PAA
  }), 'paa-serie.xml');

  assert.ok(erro(doc, /970-989|667/).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.001 RV 867: procEmi=4 sem infPAA é recusado', () => {
  const doc = parseXML(nfe({
    ide: ideCom('<procEmi>4</procEmi>'), emit: emitCRT1, chave: chavePAA
  }), 'paa-sem.xml');

  assert.ok(erro(doc, /infPAA|não informado/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.001 RV 893: infPAA em nota sem procEmi=4 é informado indevidamente', () => {
  const doc = parseXML(nfe({ extras: PAA }), 'paa-indevido.xml');

  assert.ok(erro(doc, /indevidamente|893/).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.001 RV 668: PAA não é permitido ao regime normal (CRT 3)', () => {
  const doc = parseXML(nfe({
    ide: ideCom('<procEmi>4</procEmi>'), chave: chavePAA, extras: PAA
  }), 'paa-crt3.xml');

  assert.ok(erro(doc, /regime normal|668/).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2026.001 RV 670: CNPJ do PAA com dígito verificador inválido é recusado', () => {
  const doc = parseXML(nfe({
    ide: ideCom('<procEmi>4</procEmi>'), emit: emitCRT1, chave: chavePAA,
    extras: PAA.replace('12345678000195', '12345678000196')
  }), 'paa-dv.xml');

  assert.ok(erro(doc, /CNPJ do PAA/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

// ---------------------------------------------------------------------------
// IT 2025.002 v1.70 — estrutura do cClassTrib
// ---------------------------------------------------------------------------
const rtcCom = (cst, cClassTrib, is = '') => `<imposto>
  <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><pICMS>18.00</pICMS><vICMS>3.60</vICMS></ICMS00></ICMS>
  <IBSCBS><CST>${cst}</CST><cClassTrib>${cClassTrib}</cClassTrib>
    <gIBSCBS><vBC>20.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>2.00</vIBSUF></gIBSUF>
      <gCBS><pCBS>0.90</pCBS><vCBS>18.00</vCBS></gCBS></gIBSCBS>
  </IBSCBS>${is}
</imposto>`;

test('IT 2025.002: cClassTrib coerente com o CST não gera alerta de erro', () => {
  const doc = parseXML(nfe({ imposto: rtcCom('000', '000001') }), 'cc-ok.xml');

  assert.equal(erro(doc, /cClassTrib/i).length, 0, JSON.stringify(doc.alertas));
});

test('IT 2025.002: os três primeiros dígitos do cClassTrib têm de ser o CST', () => {
  const doc = parseXML(nfe({ imposto: rtcCom('000', '200001') }), 'cc-prefixo.xml');

  assert.ok(erro(doc, /cClassTrib/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('IT 2025.002: cClassTrib tem de ter 6 dígitos', () => {
  const doc = parseXML(nfe({ imposto: rtcCom('000', '0001') }), 'cc-tam.xml');

  assert.ok(erro(doc, /6 d[ií]gitos/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2025.002 UB14: grupo IBSCBS sem cClassTrib é irregular', () => {
  const semCc = `<imposto>
    <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><pICMS>18.00</pICMS></ICMS00></ICMS>
    <IBSCBS><CST>000</CST><gIBSCBS><vBC>20.00</vBC><gCBS><pCBS>0.90</pCBS><vCBS>0.18</vCBS></gCBS></gIBSCBS></IBSCBS>
  </imposto>`;
  const doc = parseXML(nfe({ imposto: semCc }), 'cc-falta.xml');

  assert.ok(erro(doc, /cClassTrib/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2025.002 UB03: cClassTribIS do Imposto Seletivo é lido e impresso', () => {
  const is = `<IS><CSTIS>10</CSTIS><cClassTribIS>100001</cClassTribIS><vBCIS>20.00</vBCIS>
    <pIS>5.00</pIS><vIS>1.00</vIS></IS>`;
  const doc = parseXML(nfe({ imposto: rtcCom('000', '000001', is) }), 'ccis.xml');

  assert.equal(doc.itens[0].cClassTribIS, '100001');
  assert.match(renderDANFE(doc), /cClassTribIS <b>100001<\/b>/);
});

// ---------------------------------------------------------------------------
// MOC 7 Anexo III — contingência
// ---------------------------------------------------------------------------
const cont = (tpEmis, just = '<xJust>FALHA DE COMUNICACAO</xJust><dhCont>2026-11-20T09:30:00-03:00</dhCont>') =>
  nfe({ ide: ideCom(`<tpEmis>${tpEmis}</tpEmis>${just}`), chave: chaveValidaDe({ tpEmis }) });

test('MOC Anexo III: tpEmis=5 (FS-DA) imprime a expressão exigida e o motivo', () => {
  const html = renderDANFE(parseXML(cont('5'), 'fsda.xml'));

  assert.match(html, /impresso em decorrência de problemas técnicos/);
  assert.match(html, /FS-DA/);
  assert.match(html, /FALHA DE COMUNICACAO/);
  assert.match(html, /20\/11\/2026/);
});

test('MOC Anexo III: tpEmis=4 (EPEC) imprime a expressão própria do EPEC', () => {
  const html = renderDANFE(parseXML(cont('4'), 'epec.xml'));

  assert.match(html, /EPEC regularmente recebida pela Receita Federal do Brasil/);
});

test('MOC Anexo III: tpEmis=6 e 7 identificam SVC-AN e SVC-RS', () => {
  assert.match(renderDANFE(parseXML(cont('6'), 'svcan.xml')), /SVC-AN/);
  assert.match(renderDANFE(parseXML(cont('7'), 'svcrs.xml')), /SVC-RS/);
});

test('MOC Anexo III: tpEmis=2 (FS-IA) exige formulário de segurança próprio', () => {
  const html = renderDANFE(parseXML(cont('2'), 'fsia.xml'));

  assert.match(html, /FS-IA/);
  assert.match(html, /formulário de segurança/i);
});

test('MOC Anexo III: tpEmis=9 não existe para o modelo 55', () => {
  const doc = parseXML(cont('9'), 'offline.xml');

  assert.ok(erro(doc, /tpEmis=9|NFC-e|modelo 55/i).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('MOC Anexo III: contingência sem xJust/dhCont não pode ser impressa', () => {
  const doc = parseXML(cont('5', ''), 'sem-just.xml');

  assert.ok(erro(doc, /motivo|dhCont/).length,
    `alerta esperado; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('MOC Anexo III: emissão normal não ganha faixa de contingência', () => {
  const html = renderDANFE(parseXML(nfe({}), 'normal.xml'));

  assert.doesNotMatch(html, /impresso em decorrência|EPEC regularmente|SVC-AN|FS-IA/);
});
