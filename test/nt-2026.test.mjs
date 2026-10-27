// Testes do pacote de atualização de outubro/2026:
//
//   NT 2025.002 v1.52  totais em <IBSCBSTot>/<ISTot> (gIBS, gCBS, gMono)
//   NT 2026.010        DANFE: 8 campos de total, regime de apuração, FOLHA, QR Code,
//                      bases/alíquotas/valores por item, vedação de inferência
//   NT 2026.008        vUnComLiq, vProdLiq, vProdLiqTot, ICMSPrevistoPagtoAntecip
//   NT 2026.007        NF-e sem inscrição estadual (contribuinte exclusivo IBS/CBS)
//   NT 2026.002        DANFE Simplificado (tpImp=6)
//   NT 2026.004        CNPJ e chave de acesso alfanuméricos
//
// Rodar com `node --test`. Sem dependências.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { carregarApp, contextoLimpo, nfe, chaveAlfaDe } from './apoio/carrega.mjs';

const app = contextoLimpo(carregarApp());
const { parseXML, renderDANFE, maskDoc, fmtData } = app;

const IMPOSTO_RTC = `<imposto>
  <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><pICMS>18.00</pICMS><vICMS>3.60</vICMS></ICMS00></ICMS>
  <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
    <gIBSCBS><vBC>20.00</vBC>
      <gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>2.00</vIBSUF></gIBSUF>
      <gIBSMun><pIBSMun>0.05</pIBSMun><vIBSMun>1.00</vIBSMun></gIBSMun>
      <gCBS><pCBS>0.90</pCBS><vCBS>18.00</vCBS></gCBS>
    </gIBSCBS>
  </IBSCBS>
  <IS><CSTIS>10</CSTIS><vBCIS>20.00</vBCIS><pIS>5.00</pIS><vIS>1.00</vIS></IS>
</imposto>`;

const TOTAL_RTC = `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot>
  <ISTot><vIS>1.00</vIS></ISTot>
  <IBSCBSTot>
    <vBCIBSCBS>20.00</vBCIBSCBS>
    <gIBS>
      <gIBSUF><vIBSUF>2.00</vIBSUF></gIBSUF>
      <gIBSMun><vIBSMun>1.00</vIBSMun></gIBSMun>
      <vIBS>3.00</vIBS>
    </gIBS>
    <gCBS><vCBS>18.00</vCBS></gCBS>
  </IBSCBSTot>`;

test('NT 2025.002 v1.52: CBS sai de IBSCBSTot/gCBS e IS de ISTot, não da soma dos itens', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC, total: TOTAL_RTC }), 'rtc.xml');

  assert.equal(doc.reforma.origem.vCBS, 'xml', 'a CBS tem de vir do grupo declarado');
  assert.equal(doc.reforma.origem.vIS, 'xml', 'o IS tem de vir de <ISTot>');
  assert.equal(doc.reforma.vCBS, 18);
  assert.equal(doc.reforma.vIS, 1);
  assert.equal(doc.reforma.vIBSUF, 2);
  assert.equal(doc.reforma.vIBSMun, 1);
  assert.equal(doc.reforma.vIBS, 3);
  assert.equal(doc.alertas.filter(a => a.nivel === 'erro').length, 0,
    `XML coerente não pode gerar erro; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('NT 2025.002 v1.52: total declarado prevalece sobre a soma dos itens', () => {
  const doc = parseXML(nfe({
    imposto: IMPOSTO_RTC,
    total: `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot>
      <IBSCBSTot><gIBS><vIBS>3.00</vIBS></gIBS><gCBS><vCBS>70.00</vCBS></gCBS></IBSCBSTot>`
  }), 'prevalece.xml');

  assert.equal(doc.reforma.vCBS, 70, 'o número impresso é o do XML, não o somado dos itens');
  assert.ok(doc.alertas.some(a => a.nivel === 'erro' && /cbs/i.test(a.texto)));
});

test('NT 2026.010: o XML ausente em total não é substituído por estimativa', () => {
  const doc = parseXML(nfe({ imposto: IMPOSTO_RTC, total: '<ICMSTot><vProd>20.00</vProd></ICMSTot>' }), 'semtot.xml');

  for (const campo of ['vIBS', 'vIBSUF', 'vIBSMun', 'vCBS', 'vIS']) {
    assert.equal(doc.reforma[campo], null, `${campo} não pode ser estimado`);
    assert.equal(doc.reforma.origem[campo], 'ausente');
  }
  const html = renderDANFE(doc);
  assert.doesNotMatch(html, /\(soma dos itens\)/);
});

test('NT 2026.010: quadro de totais imprime os oito campos do modelo', () => {
  const total = TOTAL_RTC.replace('</IBSCBSTot>',
    '<gMono><vIBSMono>0.10</vIBSMono><vCBSMono>0.20</vCBSMono><vIBSMonoReten>0.30</vIBSMonoReten><vCBSMonoReten>0.40</vCBSMonoReten></gMono></IBSCBSTot>');
  const html = renderDANFE(parseXML(nfe({ imposto: IMPOSTO_RTC, total }), 'oito.xml'));

  for (const rotulo of ['Total IBS UF', 'Total IBS Município', 'Total CBS', 'Total Imposto Seletivo',
    'IBS Monofásico', 'CBS Monofásica', 'IBS Mono por retenção', 'CBS Mono por retenção']) {
    assert.ok(html.includes(rotulo), `falta o campo "${rotulo}"`);
  }
});

test('NT 2026.010: itens saem em Bases de cálculo / Alíquotas / Valor dos tributos', () => {
  const html = renderDANFE(parseXML(nfe({ imposto: IMPOSTO_RTC, total: TOTAL_RTC }), 'itens.xml'));

  assert.match(html, /Bases de cálculo/);
  assert.match(html, /Alíquotas/);
  assert.match(html, /Valor dos tributos/);
  assert.match(html, /cClassTrib/);
  assert.match(html, /000001/);
});

test('NT 2026.010: "FOLHA 1/1" e o regime de apuração do IBS/CBS aparecem no DANFE', () => {
  const html = renderDANFE(parseXML(nfe({}), 'folha.xml'));

  assert.match(html, /FOLHA 1\/1/);
  assert.match(html, /Tipo de Regime de Apuração do IBS e da CBS/);
});

test('NT 2026.010: CRT aparece com a descrição do código', () => {
  const html = renderDANFE(parseXML(nfe({}), 'crt.xml'));

  assert.match(html, /3 - Regime Normal/);
});

test('NT 2026.010: a chave de acesso não é impressa duas vezes', () => {
  const html = renderDANFE(parseXML(nfe({}), 'unica.xml'));
  // Aparece no código de barras (com <wbr>) e só ali.
  assert.equal((html.match(/class="d-key"/g) || []).length, 1);
});

// ---------------------------------------------------------------------------
// NT 2026.004 — CNPJ e chave alfanuméricos
// ---------------------------------------------------------------------------
const EMIT_ALFA = `<emit><CNPJ>12ABC34501DE35</CNPJ><xNome>EMPRESA ALFA LTDA</xNome>
  <IE>123456789</IE><CRT>3</CRT><enderEmit><xLgr>RUA A</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
  <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit></emit>`;

test('NT 2026.004: chave com CNPJ alfanumérico é aceita e validada', () => {
  const chave = chaveAlfaDe({ cnpj: '12ABC34501DE35' });
  const doc = parseXML(nfe({ chave, emit: EMIT_ALFA }), 'alfa.xml');

  assert.equal(doc.chave, chave);
  assert.equal(doc.alertas.filter(a => a.nivel === 'erro').length, 0,
    `chave alfanumérica coerente não pode gerar erro; alertas: ${JSON.stringify(doc.alertas)}`);
  assert.match(renderDANFE(doc), /12\.ABC\.345\/01DE-35/);
});

test('NT 2026.004: chave alfanumérica com DV errado é recusada', () => {
  const chave = chaveAlfaDe({ cnpj: '12ABC34501DE35' });
  const errada = chave.slice(0, 43) + (chave[43] === '0' ? '1' : '0');
  const doc = parseXML(nfe({ chave: errada, emit: EMIT_ALFA }), 'alfadv.xml');

  assert.ok(doc.alertas.some(a => a.nivel === 'erro' && /dígito verificador/i.test(a.texto)));
  assert.match(renderDANFE(doc), /CHAVE/i);
});

test('NT 2026.004: CNPJ alfanumérico é mascarado sem perder letras', () => {
  assert.equal(maskDoc('12ABC34501DE35'), '12.ABC.345/01DE-35');
  assert.equal(maskDoc('12345678000195'), '12.345.678/0001-95');
  assert.equal(maskDoc('12345678901'), '123.456.789-01');
});

// ---------------------------------------------------------------------------
// NT 2026.002 — DANFE Simplificado (tpImp=6)
// ---------------------------------------------------------------------------
test('NT 2026.002: tpImp=6 identifica o DANFE Simplificado e dispensa o canhoto', () => {
  const ide = '<ide><cUF>35</cUF><natOp>VENDA</natOp><mod>55</mod><serie>1</serie><nNF>456</nNF>'
    + '<dhEmi>2026-11-20T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb><tpImp>6</tpImp><tpEmis>1</tpEmis></ide>';
  const html = renderDANFE(parseXML(nfe({ ide }), 'simpl.xml'));

  assert.match(html, /DANFE SIMPLIFICADO/i);
  assert.doesNotMatch(html, /RECEBEMOS DE/);
});

test('NT 2026.002: tpImp=1 mantém o canhoto do DANFE normal', () => {
  const html = renderDANFE(parseXML(nfe({}), 'normal.xml'));

  assert.match(html, /RECEBEMOS DE/);
  assert.doesNotMatch(html, /DANFE SIMPLIFICADO/i);
});

// ---------------------------------------------------------------------------
// NT 2026.008 — valores líquidos e ICMS previsto para pagamento antecipado
// ---------------------------------------------------------------------------
test('NT 2026.008: vProdLiq/vUnComLiq do item e vProdLiqTot do total são lidos', () => {
  const comLiq = nfe({}).replace('<vProd>20.00</vProd>',
    '<vProd>20.00</vProd><vUnComLiq>9.5000</vUnComLiq><vProdLiq>19.00</vProdLiq>');
  const doc = parseXML(comLiq, 'liq.xml');

  assert.equal(doc.itens[0].vUnComLiq, 9.5);
  assert.equal(doc.itens[0].vProdLiq, 19);
});

test('NT 2026.008: vProdLiqTot e ICMSPrevistoPagtoAntecip aparecem no cálculo do imposto', () => {
  const total = `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF><vProdLiqTot>19.00</vProdLiqTot>
    <ICMSPrevistoPagtoAntecip>0.42</ICMSPrevistoPagtoAntecip></ICMSTot>`;
  const html = renderDANFE(parseXML(nfe({ total }), 'liqtot.xml'));

  assert.match(html, /V\. produtos líquido/);
  assert.match(html, /ICMS previsto p\/ pagto antecipado/);
});

// ---------------------------------------------------------------------------
// NT 2026.010 §4.4 — campos condicionais do ICMSTot
// ---------------------------------------------------------------------------
test('NT 2026.010 §4.4: totais condicionais só aparecem quando o XML os traz', () => {
  const sem = renderDANFE(parseXML(nfe({}), 'semfcp.xml'));
  assert.doesNotMatch(sem, /V\. FCP/);
  assert.doesNotMatch(sem, /ICMS monofásico/);

  const total = `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF><vFCP>1.00</vFCP><vFCPST>2.00</vFCPST>
    <vICMSUFDest>3.00</vICMSUFDest><vFCPUFDest>0.50</vFCPUFDest><qBCMono>10.0000</qBCMono>
    <vICMSMono>4.00</vICMSMono><qBCMonoReten>2.0000</qBCMonoReten><vICMSMonoReten>0.80</vICMSMonoReten></ICMSTot>`;
  const com = renderDANFE(parseXML(nfe({ total }), 'comfcp.xml'));

  for (const rotulo of ['V. FCP', 'V. FCP ST', 'ICMS UF destino', 'FCP UF destino',
    'QBC monofásico', 'ICMS monofásico', 'QBC mono retido', 'ICMS mono retido']) {
    assert.ok(com.includes(rotulo), `falta o campo condicional "${rotulo}"`);
  }
});

// ---------------------------------------------------------------------------
// NT 2026.007 — emitente sem inscrição estadual
// ---------------------------------------------------------------------------
test('NT 2026.007: emitente sem IE é identificado, sem virar erro de chave', () => {
  const emit = EMIT_ALFA.replace('<CNPJ>12ABC34501DE35</CNPJ>', '<CNPJ>12345678000195</CNPJ>')
    .replace('<IE>123456789</IE>', '');
  const doc = parseXML(nfe({ emit }), 'semie.xml');
  const html = renderDANFE(doc);

  assert.equal(doc.emit.IE, '');
  assert.match(html, /SEM IE/);
  assert.equal(doc.alertas.filter(a => a.nivel === 'erro').length, 0,
    `sem IE não é erro de documento; alertas: ${JSON.stringify(doc.alertas)}`);
});

// ---------------------------------------------------------------------------
// Exemplo distribuído e CSS
// ---------------------------------------------------------------------------
test('exemplo do site não usa tag que não existe no leiaute', () => {
  const amostra = readFileSync(new URL('../sample-nfe-reforma.xml', import.meta.url), 'utf8');

  assert.doesNotMatch(amostra, /<UB>|<\/UB>/);
  assert.doesNotMatch(amostra, /<W03>|<\/W03>/);
  assert.match(amostra, /<IBSCBS>/);
  assert.match(amostra, /<IBSCBSTot>/);
  assert.match(amostra, /<ISTot>/);
});

test('CSS de impressão tem @page A4 e nada abaixo de 6pt', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(css, /@page\s*\{[^}]*size:\s*A4 portrait/);
  // 6pt a 96 dpi = 8px. Qualquer font-size menor que isso fica fora do mínimo.
  const pequenas = [...css.matchAll(/font-size:\s*([\d.]+)px/g)]
    .map(m => Number(m[1]))
    .filter(px => px < 8);
  assert.deepEqual(pequenas, [], `fontes abaixo de 6pt: ${pequenas.join(', ')}`);
});

test('fmtData não imprime lixo: data inválida vira "—"', () => {
  assert.equal(fmtData('2026-11-20'), '20/11/2026');
  assert.equal(fmtData('20/11/2026'), '20/11/2026');
  assert.equal(fmtData('ontem'), '—');
  assert.equal(fmtData(''), '—');
});

test('informações complementares: metadado de hash sai, conteúdo entre pipes fica', () => {
  const comHash = renderDANFE(parseXML(nfe({ infAdic: '<infAdic><infCpl>|md5: abc|PEDIDO 123</infCpl></infAdic>' }), 'hash1.xml'));
  assert.doesNotMatch(comHash, /md5/);
  assert.match(comHash, /PEDIDO 123/);

  const comPipe = renderDANFE(parseXML(nfe({ infAdic: '<infAdic><infCpl>LOTE |A| PEDIDO 123</infCpl></infAdic>' }), 'hash2.xml'));
  assert.match(comPipe, /LOTE \|A\| PEDIDO 123/);
});
