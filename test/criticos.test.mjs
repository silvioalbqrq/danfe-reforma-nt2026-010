// Testes de regressão dos cinco bugs críticos achados na revisão do app.js.
//
// Cada teste abaixo falha com o código atual e passa com a correção. Eles existem
// porque a falha é silenciosa: o DANFE sai bem desenhado, com número errado, e
// ninguém percebe sem conferir a nota original.
//
//   F1  CST do ICMS impresso como se fosse o CST de IBS/CBS
//   F2  base de IBS/CBS caindo na coluna "BC ICMS"
//   F3  infAdFisco descartado e campo do fisco com texto fixo
//   F4  total divergente entre XML e soma dos itens resolvido em silêncio
//   F5  chave de acesso sem nenhuma validação
//
// Rodar com `node --test`. Sem dependências.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { carregarApp, contextoLimpo, nfe, chaveValidaDe, ICMS_SEM_RTC, ICMS_COM_IS, UB_ANTES_DO_ICMS }
  from './apoio/carrega.mjs';

const app = contextoLimpo(carregarApp());
const { parseXML, renderDANFE } = app;

const alerta = (doc, texto) =>
  doc.alertas.some((a) => a.texto.toLowerCase().includes(texto.toLowerCase()));

test('harness: a interface do site não roda durante os testes', () => {
  assert.equal(typeof app.parseXML, 'function');
});

// ---------------------------------------------------------------------------
// F1 — o CST do ICMS não pode virar o CST de IBS/CBS
// ---------------------------------------------------------------------------
test('F1: item só com Imposto Seletivo não recebe o CST do ICMS como CST de IBS/CBS', () => {
  const doc = parseXML(nfe({ imposto: ICMS_COM_IS }), 'f1.xml');

  assert.equal(doc.itens[0].cst, '',
    'sem grupo IBS/CBS no item, o CST de IBS/CBS tem de ser ausente, não o do ICMS');

  const html = renderDANFE(doc);
  assert.doesNotMatch(html, /IBS 00/, 'o DANFE não pode anunciar um CST de IBS/CBS que o XML não tem');
  assert.match(html, /IS 10/, 'o CST do Imposto Seletivo tem de continuar aparecendo');
});

test('F1: item com grupo IBS/CBS próprio continua mostrando o CST dele', () => {
  const imposto = `<imposto>
    <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><vICMS>3.60</vICMS></ICMS00></ICMS>
    <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
      <gIBSCBS><vBC>20.00</vBC><gCBS><pCBS>0.90</pCBS><vCBS>0.18</vCBS></gCBS></gIBSCBS>
    </IBSCBS>
  </imposto>`;
  const doc = parseXML(nfe({ imposto }), 'f1b.xml');

  assert.equal(doc.itens[0].cst, '000');
  assert.match(renderDANFE(doc), /IBS 000/);
});

// ---------------------------------------------------------------------------
// F2 — a base de IBS/CBS não pode entrar na coluna "BC ICMS"
// ---------------------------------------------------------------------------
test('F2: a base do ICMS não muda por causa da ordem das tags em <imposto>', () => {
  const doc = parseXML(nfe({ imposto: UB_ANTES_DO_ICMS }), 'f2a.xml');
  const it = doc.itens[0];

  assert.equal(it.BC, 7000, 'a base do ICMS é 7000; 555 é a base do grupo de IBS/CBS');
  assert.equal(it.vICMS, 1260);
  assert.equal(it.aliqICMS, '18.00');
  assert.equal(it.CST, '00');
});

test('F2: o mesmo grupo ICMS é lido igual com ou sem a Reforma ao lado', () => {
  // Duas notas com o ICMS idêntico (base 20,00, CST 00), uma sem nada da Reforma e
  // outra com o grupo de IBS/CBS. O ICMS lido tem de sair igual nas duas.
  const semReforma = parseXML(nfe({ imposto: ICMS_SEM_RTC }), 'f2x.xml').itens[0];
  const comReforma = parseXML(nfe({
    imposto: `<imposto>
      <IBSCBS><CST>000</CST><gIBSCBS><vBC>7.00</vBC></gIBSCBS></IBSCBS>
      <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><pICMS>18.00</pICMS><vICMS>3.60</vICMS></ICMS00></ICMS>
    </imposto>`
  }), 'f2y.xml').itens[0];

  assert.equal(comReforma.BC, semReforma.BC, 'a base do ICMS não pode depender do grupo vizinho');
  assert.equal(comReforma.vICMS, semReforma.vICMS);
  assert.equal(comReforma.aliqICMS, semReforma.aliqICMS);
  assert.equal(comReforma.CST, semReforma.CST);
});

test('F2: a base de IBS/CBS continua disponível no grupo da Reforma', () => {
  const doc = parseXML(nfe({ imposto: UB_ANTES_DO_ICMS }), 'f2c.xml');

  assert.equal(doc.itens[0].vBC, 555, 'a base do IBS/CBS é 555, lida do próprio grupo');
  assert.equal(doc.itens[0].vCBS, 50);
});

// ---------------------------------------------------------------------------
// F3 — infAdFisco no campo do fisco
// ---------------------------------------------------------------------------
test('F3: infAdFisco do XML aparece em "Reservado ao fisco"', () => {
  const infAdic = `<infAdic>
    <infCpl>Pedido de compra 12345.</infCpl>
    <infAdFisco>VENDA SUJEITA AO REGIME NORMAL DE APURACAO.</infAdFisco>
  </infAdic>`;
  const html = renderDANFE(parseXML(nfe({ infAdic }), 'f3.xml'));

  const campo = html.split('Reservado ao fisco')[1] ?? '';
  assert.match(campo, /VENDA SUJEITA AO REGIME NORMAL DE APURACAO\./);
});

test('F3: "Reservado ao fisco" não recebe mais texto fixo da aplicação', () => {
  const html = renderDANFE(parseXML(nfe({}), 'f3b.xml'));

  const campo = html.split('Reservado ao fisco')[1] ?? '';
  assert.doesNotMatch(campo, /NT 2026\.010 v1\.00 · produção 01\/12\/2026/,
    'o campo do fisco tem que refletir o XML, não a versão da aplicação');
});

test('F3: infAdFisco não é despejado em "Informações complementares"', () => {
  const infAdic = '<infAdic><infCpl>Pedido 12345.</infCpl>' +
    '<infAdFisco>MENSAGEM EXCLUSIVA DO FISCO.</infAdFisco></infAdic>';
  const html = renderDANFE(parseXML(nfe({ infAdic }), 'f3c.xml'));

  const cpl = html.split('Informações complementares')[1]?.split('Reservado ao fisco')[0] ?? '';
  assert.doesNotMatch(cpl, /MENSAGEM EXCLUSIVA DO FISCO/);
});

// ---------------------------------------------------------------------------
// F4 — divergência entre o total declarado e a soma dos itens
// ---------------------------------------------------------------------------
test('F4: total declarado no XML que não bate com a soma dos itens é sinalizado', () => {
  const imposto = `<imposto>
    <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC></ICMS00></ICMS>
    <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
      <gIBSCBS><vBC>20.00</vBC><gCBS><pCBS>0.90</pCBS><vCBS>68.40</vCBS></gCBS></gIBSCBS>
    </IBSCBS>
  </imposto>`;
  const total = `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot>
    <W03><vIBS>0.00</vIBS><vCBS>0.00</vCBS></W03>`;
  const doc = parseXML(nfe({ imposto, total }), 'f4.xml');

  assert.ok(alerta(doc, 'cbs'),
    `divergência de CBS entre XML e itens tem de gerar aviso; alertas: ${JSON.stringify(doc.alertas)}`);
  assert.ok(alerta(doc, 'ibs') || alerta(doc, 'cbs'));
});

test('F4: o total impresso é o declarado no XML, nunca a soma inferida', () => {
  const imposto = `<imposto>
    <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC></ICMS00></ICMS>
    <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
      <gIBSCBS><vBC>20.00</vBC><gCBS><pCBS>0.90</pCBS><vCBS>68.40</vCBS></gCBS></gIBSCBS>
    </IBSCBS>
  </imposto>`;
  const total = `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot>
    <W03><vIBS>0.00</vIBS><vCBS>0.00</vCBS></W03>`;
  const doc = parseXML(nfe({ imposto, total }), 'f4b.xml');

  assert.equal(doc.reforma.vCBS, 0, 'o XML declara 0.00; o DANFE não pode mostrar a soma dos itens');
  assert.equal(doc.reforma.vCBS, 0, 'somado dos itens: 68.40 — não pode prevalecer em silêncio');
  assert.match(renderDANFE(doc), /0,00/);
});

test('F4: XML sem grupo de totais soma os itens e assume que a soma foi calculada', () => {
  const imposto = `<imposto>
    <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC></ICMS00></ICMS>
    <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
      <gIBSCBS><vBC>20.00</vBC><gCBS><pCBS>0.90</pCBS><vCBS>0.18</vCBS></gCBS></gIBSCBS>
    </IBSCBS>
  </imposto>`;
  const doc = parseXML(nfe({ imposto, total: '<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot>' }), 'f4c.xml');

  assert.equal(doc.reforma.vCBS, 0.18, 'sem totais declarados, a soma dos itens é o melhor estimativa');
  assert.ok(alerta(doc, 'calculad') || alerta(doc, 'somad') || alerta(doc, 'itens'),
    `a origem do total tem de ser declarada no DANFE; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('F4: totais do XML em concordância com os itens não geram aviso', () => {
  const imposto = `<imposto>
    <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC></ICMS00></ICMS>
    <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
      <gIBSCBS><vBC>20.00</vBC>
        <gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>2.00</vIBSUF></gIBSUF>
        <gCBS><pCBS>0.90</pCBS><vCBS>18.00</vCBS></gCBS>
      </gIBSCBS>
    </IBSCBS>
  </imposto>`;
  const total = `<ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot>
    <W03><vIBS>2.00</vIBS><vCBS>18.00</vCBS></W03>`;
  const doc = parseXML(nfe({ imposto, total }), 'f4d.xml');

  assert.equal(doc.reforma.vIBS, 2);
  assert.equal(doc.reforma.vCBS, 18);
  assert.equal(doc.alertas.filter((a) => a.nivel === 'erro').length, 0,
    `nota coerente não deve gerar erro; alertas: ${JSON.stringify(doc.alertas)}`);
});

// ---------------------------------------------------------------------------
// F5 — validação da chave de acesso
// ---------------------------------------------------------------------------
test('F5: chave com dígito verificador errado é recusada', () => {
  // Chave com todos os campos coerentes, só o DV trocado.
  const chaveErrada = chaveValidaDe().slice(0, 43) + '9';
  const doc = parseXML(nfe({ chave: chaveErrada }), 'f5.xml');

  assert.ok(alerta(doc, 'chave'),
    `chave com DV inválido tem de gerar aviso; alertas: ${JSON.stringify(doc.alertas)}`);
  assert.match(renderDANFE(doc), /CHAVE/i, 'o aviso de chave precisa chegar ao DANFE impresso');
});

test('F5: chave com CNPJ diferente do emitente é recusada', () => {
  const chave = chaveValidaDe({ cnpj: '99999999000199' });
  const doc = parseXML(nfe({ chave }), 'f5b.xml');

  assert.ok(alerta(doc, 'cnpj') || alerta(doc, 'chave'),
    `chave com CNPJ divergente do emitente tem de gerar aviso; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('F5: chave com mês de emissão diferente do XML é recusada', () => {
  const chave = chaveValidaDe({ aamm: '2501' });
  const doc = parseXML(nfe({ chave }), 'f5c.xml');

  assert.ok(alerta(doc, 'emiss') || alerta(doc, 'chave'),
    `chave com AAMM divergente tem de gerar aviso; alertas: ${JSON.stringify(doc.alertas)}`);
});

test('F5: chave bem formada e coerente não gera aviso', () => {
  const doc = parseXML(nfe({}), 'f5d.xml');

  assert.equal(doc.alertas.filter((a) => a.nivel === 'erro').length, 0,
    `nota íntegra não deve gerar erro; alertas: ${JSON.stringify(doc.alertas)}`);
  assert.equal(doc.chave, chaveValidaDe());
});

test('F5: a chave do XML de exemplo que vem no repositório é válida', () => {
  // Lê o arquivo distribuído com o site, não a constante interna — o que o usuário
  // baixa tem de passar na própria validação.
  const amostra = readFileSync(new URL('../sample-nfe-reforma.xml', import.meta.url), 'utf8');
  const doc = parseXML(amostra, 'amostra.xml');

  assert.equal(doc.alertas.filter((a) => a.nivel === 'erro').length, 0,
    `a amostra do site é inválida: ${JSON.stringify(doc.alertas)}`);
});