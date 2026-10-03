// Carrega o `app.js` — que é script clássico, não módulo — dentro de um contexto
// `vm` do Node, para que os testes possam chamar `parseXML` e `renderDANFE`.
//
// Por que `vm` e não `import`: o site promete funcionar por `file://` com duplo
// clique, e o navegador bloqueia módulos ES em `file://`. Transformar `app.js` em
// módulo quebraria essa promessa, então ele continua script clássico e o Node o
// avalia num contexto isolado.
//
// Sem `document` no contexto, o bloco de interface do `app.js` não executa: só as
// funções puras de leitura e de desenho são definíveis aqui.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DOMParserShim } from './dom-xml.mjs';

const ALVOS = ['document', 'window', 'alert', 'confirm', 'prompt', 'scrollIntoView'];

export function carregarApp() {
  const fonte = readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
  const contexto = vm.createContext({
    DOMParser: DOMParserShim,
    console,
    Blob,
    URL,
  });
  vm.runInContext(fonte, contexto, { filename: 'app.js' });
  return contexto;
}

/** Confirma que a interface realmente não rodou — se rodar, o teste vira falso positivo. */
export function contextoLimpo(ctx) {
  for (const alvo of ALVOS) {
    if (typeof ctx[alvo] !== 'undefined') {
      throw new Error(`o app.js expôs "${alvo}" no contexto de teste`);
    }
  }
  return ctx;
}

const IDE = `<ide><cUF>35</cUF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie>
  <nNF>456</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>1</tpAmb>
  <tpEmis>1</tpEmis><finNFe>1</finNFe></ide>`;

const EMIT = `<emit><CNPJ>12345678000195</CNPJ><xNome>EMPRESA EXEMPLO LTDA</xNome>
  <IE>123456789</IE><CRT>3</CRT><enderEmit><xLgr>RUA A</xLgr><nro>100</nro><xBairro>CENTRO</xBairro>
  <xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit></emit>`;

const DEST = `<dest><CNPJ>98765432000110</CNPJ><xNome>CLIENTE EXEMPLO SA</xNome>
  <enderDest><xLgr>AV B</xLgr><nro>200</nro><xBairro>CENTRO</xBairro><xMun>RIO DE JANEIRO</xMun>
  <UF>RJ</UF><CEP>20010000</CEP></enderDest></dest>`;

/** Chave com dígito verificador válido para os dados padrão deste arquivo de teste. */
export function chaveValidaDe(opcoes = {}) {
  const cUF = opcoes.cUF ?? '35';
  const aamm = opcoes.aamm ?? '2611';
  const cnpj = opcoes.cnpj ?? '12345678000195';
  const mod = opcoes.mod ?? '55';
  const serie = (opcoes.serie ?? '1').padStart(3, '0');
  const nNF = (opcoes.nNF ?? '456').padStart(9, '0');
  const tpEmis = opcoes.tpEmis ?? '1';
  const base = `${cUF}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}` + '0'.repeat(8);
  const dv = digitoVerificador(base);
  return base.slice(0, 43) + dv;
}

/** Módulo 11 com pesos 2..9 da direita para a esquerda, sobre 43 dígitos. */
export function digitoVerificador(base43) {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const d = 11 - (soma % 11);
  return d >= 10 ? '0' : String(d);
}

/**
 * Monta uma NF-e mínima e bem formada, com o `imposto` do item exatamente como o
 * chamador passar — a ordem das tags dentro de `<imposto>` é o que reproduz os bugs.
 */
export function nfe({
  imposto = '<imposto><ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><vICMS>3.60</vICMS></ICMS00></ICMS></imposto>',
  total = '<ICMSTot><vProd>20.00</vProd><vICMS>3.60</vICMS><vNF>20.00</vNF></ICMSTot>',
  infAdic = '',
  chave = null,
  ide = IDE,
  emit = EMIT,
  dest = DEST,
  prot = '<protNFe><infProt><nProt>135260000000001</nProt><dhRecbto>2026-11-20T10:01:00-03:00</dhRecbto></infProt></protNFe>',
} = {}) {
  const id = `NFe${chaveValidaDe()}`.replace(/#/g, '');
  const idFinal = chave === null ? id : `NFe${chave}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
<NFe><infNFe Id="${idFinal}">
${ide}
${emit}
${dest}
<det nItem="1"><prod><cProd>001</cProd><xProd>PRODUTO</xProd><NCM>84713000</NCM><CFOP>5102</CFOP>
<uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>10.0000</vUnCom><vProd>20.00</vProd></prod>
${imposto}
</det>
<total>${total}</total>
${infAdic}
</infNFe></NFe>
${prot}
</nfeProc>`;
}

export const ICMS_SEM_RTC = '<imposto><ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC>'
  + '<pICMS>18.00</pICMS><vICMS>3.60</vICMS></ICMS00></ICMS></imposto>';

/** Item com grupo `IS` (Imposto Seletivo) e nenhum grupo de IBS/CBS. */
export const ICMS_COM_IS = `<imposto>
  <ICMS><ICMS00><CST>00</CST><vBC>20.00</vBC><vICMS>3.60</vICMS></ICMS00></ICMS>
  <IS><CSTIS>10</CSTIS><cClassTribIS>000001</cClassTribIS><vBCIS>20.00</vBCIS><pIS>5.00</pIS><vIS>1.00</vIS></IS>
</imposto>`;

/** Mesmo ICMS, porem o grupo `UB` de IBS/CBS vem ANTES do ICMS dentro de `<imposto>`. */
export const UB_ANTES_DO_ICMS = `<imposto>
  <UB><gIBSCBS><vBC>555.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.56</vIBSUF></gIBSUF>
    <gCBS><pCBS>0.90</pCBS><vCBS>50.00</vCBS></gCBS></gIBSCBS></UB>
  <ICMS><ICMS00><CST>00</CST><vBC>7000.00</vBC><pICMS>18.00</pICMS><vICMS>1260.00</vICMS></ICMS00></ICMS>
</imposto>`;