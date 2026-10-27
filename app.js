/* DANFE Reforma — NT 2026.010 v1.00 (DANFE) sobre o leiaute da NT 2025.002 v1.52
   Grupos lidos pelos nomes canônicos do leiaute (nada de tag inventada):
   - item: <IBSCBS><CST><cClassTrib><gIBSCBS>, com gIBSUF/gIBSMun/gCBS e <IS>
   - totais: <total><ISTot><vIS> e <total><IBSCBSTot>, com gIBS/gIBSUF, gIBSMun, gCBS, gMono
   - só é impresso o que o XML declara: total ausente fica em branco, nunca é estimado
   - emit.CRT exibido com descrição; chave e CNPJ aceitam o formato alfanumérico (NT 2026.004)
*/
// Em Node (testes) não existe `document`: o seletor devolve null e o bloco de
// interface, no fim do arquivo, nem chega a rodar. No navegador é idêntico ao de antes.
const $ = s => (typeof document === 'undefined' ? null : document.querySelector(s));
const dropzone = $('#dropzone'), fileInput = $('#fileInput');
const loteList = $('#loteList'), loteBar = $('#loteBar'), loteInfo = $('#loteInfo');
const docNav = $('#docNav'), docPos = $('#docPos'), paper = $('#danfePaper'), empty = $('#danfeEmpty');
let docs = [], cur = 0;
const MAX_FILES = 100, MAX_BYTES = 5 * 1024 * 1024;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const onlyD = s => String(s || '').replace(/\D/g, '');
/* NT 2026.004: a chave de acesso e o CNPJ passaram a ser alfanuméricos. A comparação
   é feita sempre em caixa alta e sem separadores — `onlyD` continua reservado para os
   campos que são numéricos de fato (nNF, série, protocolo). */
const soAlfanum = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num2 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num4 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
function maskDoc(s) {
  const v = soAlfanum(s);
  if (v.length === 14) return v.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
  if (v.length === 11) return v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v || '—';
}
function fmtChave(c) { const v = soAlfanum(c); return v.length ? (v.match(/.{1,4}/g) || []).join('.') : '—'; }
function fmtData(iso) {
  if (!iso || iso === '—') return '—';
  const s = String(iso).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // Já em dd/mm/aaaa é aceito; qualquer outra coisa vira "—" em vez de lixo no DANFE.
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s : '—';
}
function fmtHora(iso) { const m = String(iso || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; }
function fmtNF(n) { const d = onlyD(String(n || '')); if (!d) return '—'; const p = d.padStart(9, '0'); return p.slice(0, 3) + '.' + p.slice(3, 6) + '.' + p.slice(6, 9); }

/* --- Acesso a nós: SEMPRE por filho direto ---
   `getElementsByTagName` varre a subárvore inteira. Foi essa varredura que produziu
   dois bugs de número fiscal: o CST do ICMS aparecia impresso como CST de IBS/CBS e a
   base do IBS/CBS caía na coluna "BC ICMS" — nos dois casos o XML estava certo e a
   ordem das tags dentro de `<imposto>` decidia o que era lido. Aqui a busca é estrutural:
   cada grupo é filho direto de outro, como no leiaute da NT.
   A única busca ampla que sobra é a do documento inteiro, para achar `infNFe`. */
function noDoc(xml, tag) { const l = xml.getElementsByTagName(tag); return l && l.length ? l[0] : null; }
const filhosDe = parent => (parent && parent.children ? Array.from(parent.children) : []);
const filhoDe = (parent, tag) => filhosDe(parent).find(el => el.nodeName === tag) || null;
const grupoDe = (parent, tags) => { for (const t of tags) { const e = filhoDe(parent, t); if (e) return e; } return null; };
const primeiroFilhoDe = parent => filhosDe(parent)[0] || null;
function tx(parent, tag, fb = '') { const e = filhoDe(parent, tag); return e && e.textContent != null ? e.textContent.trim() : fb; }
function num(parent, ...tags) { for (const t of tags) { const v = numOuNull(parent, t); if (v !== null) return v; } return 0; }
/* Devolve null quando o campo não existe, para não confundir "ausente" com zero —
   num documento fiscal, zero inventado é pior que célula em branco. */
function numOuNull(parent, ...tags) {
  for (const t of tags) {
    const e = filhoDe(parent, t);
    if (e && e.textContent.trim() !== '') { const v = parseFloat(e.textContent.trim().replace(',', '.')); if (!isNaN(v)) return v; }
  }
  return null;
}
function str(parent, ...tags) { for (const t of tags) { const v = tx(parent, t, ''); if (v) return v; } return ''; }

/* --- Reforma por item ---
   `imp` é o <imposto> do item. O grupo de IBS/CBS é filho direto dele: <IBSCBS>.
   Nada é buscado "em qualquer lugar dentro do item": é esse escopo estrito que
   impede o CST do ICMS de virar CST de IBS/CBS. */
function reformaItem(imp) {
  const ibsCBS = filhoDe(imp, 'IBSCBS') || filhoDe(imp, 'gIBSCBS');
  const gTrib = (ibsCBS ? filhoDe(ibsCBS, 'gIBSCBS') : null) || ibsCBS;
  const gIBSUF = filhoDe(gTrib, 'gIBSUF'), gIBSMun = filhoDe(gTrib, 'gIBSMun'), gCBS = filhoDe(gTrib, 'gCBS');
  // cClassTrib e CST saem SÓ do grupo de IBS/CBS. Antes eles eram procurados a partir
  // do item inteiro e acertavam o <CST> do ICMS quando o item não tinha IBS/CBS.
  const cClassTrib = ibsCBS ? str(ibsCBS, 'cClassTrib') : '';
  const cst = ibsCBS ? str(ibsCBS, 'CST') : '';
  const vBC = gTrib ? num(gTrib, 'vBC') : 0;
  // NT §4.3: cada alíquota sai vigente ou efetiva (gRed/pAliqEfet); o item marca
  // efetiva quando qualquer uma das três vier do gRed.
  const aUF = gIBSUF ? aliqEscolhida(gIBSUF, 'pIBSUF', 'pIBS') : { valor: 0, efetiva: false };
  const aMun = gIBSMun ? aliqEscolhida(gIBSMun, 'pIBSMun') : { valor: 0, efetiva: false };
  const aCBS = gCBS ? aliqEscolhida(gCBS, 'pCBS') : { valor: 0, efetiva: false };
  const pIBSUF = aUF.valor;
  const pIBSMun = aMun.valor;
  const pCBS = aCBS.valor;
  const efetiva = aUF.efetiva || aMun.efetiva || aCBS.efetiva;
  const vIBSUF = gIBSUF ? num(gIBSUF, 'vIBSUF') : 0;
  const vIBSMun = gIBSMun ? num(gIBSMun, 'vIBSMun') : 0;
  const vCBS = gCBS ? num(gCBS, 'vCBS') : 0;
  const isEl = grupoDe(imp, ['IS', 'gIS']);
  const cstIS = isEl ? str(isEl, 'CSTIS') : '';
  const vBCIS = isEl ? num(isEl, 'vBCIS') : 0;
  const pIS = isEl ? num(isEl, 'pIS') : 0;
  const vIS = isEl ? num(isEl, 'vIS') : 0;
  const temIbsCbs = !!ibsCBS;
  const temIS = !!isEl;
  return {
    temIbsCbs, temIS, cClassTrib, cst, vBC, pIBSUF, pIBSMun, pCBS, efetiva,
    vIBSUF, vIBSMun, vCBS, vIBSTot: vIBSUF + vIBSMun, cstIS, vBCIS, pIS, vIS,
    has: temIbsCbs || temIS
  };
}

/* NT §4.3: com redução (gRed/pAliqEfet) vale a efetiva; sem ela, a vigente.
   Compra governamental sem pAliqEfet não inventa efetiva. */
function aliqEscolhida(grupo, ...tagsVig) {
  const red = filhoDe(grupo, 'gRed');
  const ef = red ? str(red, 'pAliqEfet') : '';
  if (ef !== '') { const v = parseFloat(ef.replace(',', '.')); if (!isNaN(v)) return { valor: v, efetiva: true }; }
  return { valor: num(grupo, ...tagsVig), efetiva: false };
}

/* --- Reconciliação e chave de acesso --- */

/* Dígito verificador da chave: módulo 11 sobre os 43 primeiros caracteres, com os
   multiplicadores 2, 3, 4 … 9 aplicados da direita para a esquerda. O DV é o 44º
   caractere. (Manual de Orientação do Contribuinte, MOC NF-e.)
   NT 2026.004: a chave passou a admitir CNPJ alfanumérico. Cada caractere vale o
   próprio código ASCII menos 48 — 0-9 valem 0-9 e A-Z valem 17-42 —, a mesma regra
   usada no DV do CNPJ alfanumérico. */
const valorCaractere = c => c.charCodeAt(0) - 48;
function digitoVerificador(base43) {
  let soma = 0, peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += valorCaractere(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const d = 11 - (soma % 11);
  return d >= 10 ? 0 : d;
}

/* A chave não é só um identificador: ela carrega UF, AAMM, CNPJ, modelo, série,
   número, forma de emissão e o próprio DV. Conferir esses campos contra o XML é o
   que pega arquivo trocado, renomeado ou adulterado — e é o que o gerador não fazia.
   Devolve a lista de problemas encontrados; lista vazia significa chave coerente. */
function validarChave(chave, ref) {
  const p = [];
  const c = soAlfanum(chave);
  if (!/^[0-9A-Z]{44}$/.test(c)) {
    if (c) p.push(`Chave de acesso fora do padrão: esperado 44 caracteres (NT 2026.004 admite letras), veio "${c}" (${c.length} caracteres).`);
    return p;
  }
  const dv = valorCaractere(c[43]), calculado = digitoVerificador(c.slice(0, 43));
  if (dv !== calculado) {
    p.push(`Chave de acesso com dígito verificador inválido: o 44º caractere vale ${dv}, mas o módulo 11 dos 43 primeiros dá ${calculado}.`);
  }
  const compara = (rotulo, naChave, noXml) => {
    if (!naChave || !noXml) return;
    if (soAlfanum(naChave) !== soAlfanum(noXml)) {
      p.push(`Chave de acesso com ${rotulo} divergente do XML: a chave diz ${naChave}, o XML diz ${noXml}.`);
    }
  };
  compara('UF do emitente', c.slice(0, 2), String(ref.cUF || '').padStart(2, '0'));
  compara('mês de emissão (AAMM)', c.slice(2, 6), String(ref.aamm || ''));
  if (ref.doc && soAlfanum(ref.doc).length === 14) compara('CNPJ do emitente', c.slice(6, 20), ref.doc);
  compara('modelo', c.slice(20, 22), String(ref.mod || ''));
  compara('série', c.slice(22, 25), String(ref.serie || ''));
  compara('número da nota', c.slice(25, 34), String(ref.nNF || ''));
  compara('forma de emissão', c.slice(34, 35), String(ref.tpEmis || ''));
  return p;
}

/* --- Parser NF-e --- */
function parseNFe(xml, name) {
  const scope = noDoc(xml, 'infNFe') || xml;
  const ide = filhoDe(scope, 'ide');
  const emit = filhoDe(scope, 'emit');
  const dest = filhoDe(scope, 'dest');
  const eEmit = grupoDe(emit, ['enderEmit', 'enderEmi', 'ender']);
  const eDest = grupoDe(dest, ['enderDest', 'enderEnt', 'ender']);
  const grupoTotal = filhoDe(scope, 'total');
  const total = filhoDe(grupoTotal, 'ICMSTot'), issTot = filhoDe(grupoTotal, 'ISSQNtot');
  const transp = filhoDe(scope, 'transp');
  const infAdic = filhoDe(scope, 'infAdic');
  const fat = filhoDe(scope, 'fat');
  const dups = filhosDe(fat).filter(d => d.nodeName === 'dup').map(d => ({ nDup: tx(d, 'nDup'), dVenc: fmtData(tx(d, 'dVenc')), vDup: num(d, 'vDup') }));
  const dets = filhosDe(scope).filter(d => d.nodeName === 'det');
  const itens = dets.map((det, i) => {
    const prod = filhoDe(det, 'prod') || det;
    const imp = filhoDe(det, 'imposto');
    // O ICMS do item mora em <ICMS><ICMS00|ICMS10|…><vBC/><pICMS/><vICMS/>. Ler a base
    // direto de <imposto> pegava o <vBC> do grupo de IBS/CBS quando ele vinha antes.
    const icmsEl = filhoDe(imp, 'ICMS');
    const grupoICMS = primeiroFilhoDe(icmsEl);
    const ipiEl = filhoDe(imp, 'IPI');
    const ref = reformaItem(imp || det);
    return {
      nItem: (det.getAttribute && det.getAttribute('nItem')) || String(i + 1),
      cProd: tx(prod, 'cProd'), xProd: tx(prod, 'xProd'), infAdProd: tx(det, 'infAdProd'),
      NCM: tx(prod, 'NCM'), CFOP: tx(prod, 'CFOP'), uCom: tx(prod, 'uCom'), qCom: tx(prod, 'qCom'),
      vUnCom: num(prod, 'vUnCom'), vProd: num(prod, 'vProd'),
      // NT 2026.008: valores líquidos do item (002/003/004), usados quando a operação
      // tem redução/desconto próprio. Ficam nulos quando o XML não os traz.
      vUnComLiq: numOuNull(prod, 'vUnComLiq'), vProdLiq: numOuNull(prod, 'vProdLiq'),
      CST: grupoICMS ? (str(grupoICMS, 'CST') || str(grupoICMS, 'CSOSN')) : '',
      BC: grupoICMS ? num(grupoICMS, 'vBC') : 0,
      BCST: grupoICMS ? num(grupoICMS, 'vBCST') : 0,
      vST: grupoICMS ? num(grupoICMS, 'vST') : 0,
      vICMS: grupoICMS ? num(grupoICMS, 'vICMS') : 0, aliqICMS: grupoICMS ? str(grupoICMS, 'pICMS') : '',
      vIPI: num(ipiEl, 'vIPI'), aliqIPI: str(ipiEl, 'pIPI'),
      ...ref
    };
  });
  // --- Totais da Reforma: o XML declara, os itens conferem ---
  // Leiaute NT 2025.002 v1.52: <total><ISTot><vIS> e <total><IBSCBSTot>, com
  // gIBS/gIBSUF, gIBSMun, gCBS e gMono. O gerador procurava um grupo "W03" (que não
  // existe no leiaute) e buscava vCBS dentro de gIBS — por isso CBS e IS nunca eram
  // lidos do XML e o DANFE imprimia a soma dos itens como se fosse total declarado.
  const ibsCbsTot = filhoDe(grupoTotal, 'IBSCBSTot');
  const isTot = filhoDe(grupoTotal, 'ISTot');
  const gIBS = filhoDe(ibsCbsTot, 'gIBS'), gCBS = filhoDe(ibsCbsTot, 'gCBS'), gMono = filhoDe(ibsCbsTot, 'gMono');
  const gIBSUF = filhoDe(gIBS, 'gIBSUF'), gIBSMun = filhoDe(gIBS, 'gIBSMun');
  const campoTotal = (escopos, ...tags) => {
    for (const s of escopos) { if (!s) continue; const v = numOuNull(s, ...tags); if (v !== null) return v; }
    return null;
  };
  const declarado = {
    vIBS: campoTotal([ibsCbsTot, gIBS], 'vIBS', 'vIBSTot'),
    vIBSUF: campoTotal([gIBSUF, gIBS], 'vIBSUF'),
    vIBSMun: campoTotal([gIBSMun, gIBS], 'vIBSMun'),
    vCBS: campoTotal([gCBS, ibsCbsTot], 'vCBS', 'vCBSTot'),
    vIS: campoTotal([isTot], 'vIS', 'vISTot'),
    vIBSMono: campoTotal([gMono], 'vIBSMono'),
    vCBSMono: campoTotal([gMono], 'vCBSMono'),
    vIBSMonoReten: campoTotal([gMono], 'vIBSMonoReten'),
    vCBSMonoReten: campoTotal([gMono], 'vCBSMonoReten')
  };
  const soma = {
    vIBS: itens.reduce((a, i) => a + i.vIBSTot, 0),
    vIBSUF: itens.reduce((a, i) => a + i.vIBSUF, 0),
    vIBSMun: itens.reduce((a, i) => a + i.vIBSMun, 0),
    vCBS: itens.reduce((a, i) => a + i.vCBS, 0),
    vIS: itens.reduce((a, i) => a + i.vIS, 0)
  };
  const ROTULOS = { vIBS: 'IBS', vIBSUF: 'IBS UF', vIBSMun: 'IBS Município', vCBS: 'CBS', vIS: 'IS' };
  const origem = {};
  const alertas = [];
  const semTotal = [];
  for (const campo of ['vIBS', 'vIBSUF', 'vIBSMun', 'vCBS', 'vIS']) {
    const d = declarado[campo], s = soma[campo];
    const temNoItem = itens.some(i => campo === 'vIS' ? i.temIS : i.temIbsCbs);
    if (d !== null) {
      origem[campo] = 'xml';
      if (temNoItem && Math.abs(d - s) > 0.01) {
        alertas.push({
          nivel: 'erro', campo,
          texto: `Divergência no total de ${ROTULOS[campo]}: o XML declara ${num2(d)} e o valor dos itens dá ${num2(s)}. O DANFE mostra o valor do XML — confira o arquivo.`
        });
      }
    } else if (temNoItem) {
      // NT 2026.010: é vedado criar, inferir ou imprimir informação que não exista no
      // XML. Sem o grupo de totais, o campo fica em branco e a ausência é avisada.
      origem[campo] = 'ausente';
      semTotal.push(`${ROTULOS[campo]} (${num2(s)} nos itens)`);
    } else {
      origem[campo] = null;
    }
  }
  if (semTotal.length) {
    alertas.push({
      nivel: 'aviso', campo: 'totais',
      texto: `O XML não traz, no grupo de totais: ${semTotal.join('; ')}. O campo fica em branco — valor não declarado não é estimado.`
    });
  }
  const reforma = {
    vIBS: declarado.vIBS,
    vIBSUF: declarado.vIBSUF,
    vIBSMun: declarado.vIBSMun,
    vCBS: declarado.vCBS,
    vIS: declarado.vIS,
    vIBSMono: declarado.vIBSMono,
    vCBSMono: declarado.vCBSMono,
    vIBSMonoReten: declarado.vIBSMonoReten,
    vCBSMonoReten: declarado.vCBSMonoReten,
    origem,
    temNoXML: !!(ibsCbsTot || isTot || itens.some(i => i.has))
  };

  // --- Chave de acesso ---
  // NT 2026.004: 44 caracteres alfanuméricos (o trecho do CNPJ pode ter letras).
  const idNFe = soAlfanum(scope.getAttribute && scope.getAttribute('Id'));
  const chave = (idNFe.length >= 44 ? idNFe.slice(-44) : idNFe)
    || soAlfanum(tx(filhoDe(noDoc(xml, 'protNFe'), 'infProt'), 'chNFe'));
  const problemasChave = validarChave(chave, {
    cUF: tx(ide, 'cUF'),
    // AAMM na chave são 4 dígitos: os dois últimos do ano mais o mês (2026-11 → 2611).
    aamm: (tx(ide, 'dhEmi') || tx(ide, 'dEmi')).replace(/\D/g, '').slice(2, 6),
    doc: tx(emit, 'CNPJ') || tx(emit, 'CPF'),
    mod: tx(ide, 'mod', '55'),
    serie: String(tx(ide, 'serie', '1')).padStart(3, '0'),
    nNF: String(tx(ide, 'nNF', '0')).padStart(9, '0'),
    tpEmis: tx(ide, 'tpEmis', '1')
  });
  for (const p of problemasChave) alertas.push({ nivel: 'erro', campo: 'chave', texto: p });
  const protEl = noDoc(xml, 'protNFe');
  // nProt e dhRecbto moram em <protNFe><infProt>, não como filhos diretos de <protNFe>.
  // Ler no nível errado deixava o protocolo em branco ("· —") sem acusar SEM PROTOCOLO.
  const infProt = filhoDe(protEl, 'infProt') || protEl;
  const nProt = tx(infProt, 'nProt'), dhProt = tx(infProt, 'dhRecbto');
  const eo = eEmit ? { lgr: tx(eEmit, 'xLgr'), nro: tx(eEmit, 'nro'), bairro: tx(eEmit, 'xBairro'), mun: tx(eEmit, 'xMun'), uf: tx(eEmit, 'UF'), cep: tx(eEmit, 'CEP'), fone: tx(eEmit, 'fone') } : {};
  const doo = eDest ? { lgr: tx(eDest, 'xLgr'), nro: tx(eDest, 'nro'), bairro: tx(eDest, 'xBairro'), mun: tx(eDest, 'xMun'), uf: tx(eDest, 'UF'), cep: tx(eDest, 'CEP'), fone: tx(eDest, 'fone') } : {};
  // --- QR Code (NT 2026.010) ---
  // Vem em <infNFeSupl><qrCode> (leiaute da NF-e) ou no grupo <ZX02> quando o emissor
  // já o traz. Sem conteúdo no XML, o campo fica vazio — nunca "espaço reservado".
  const supl = noDoc(xml, 'infNFeSupl');
  const zx02 = filhoDe(scope, 'ZX02');
  const qr = tx(supl, 'qrCode') || tx(zx02, 'qrCode');
  const urlChave = tx(supl, 'urlChave');
  return {
    fileName: name, chave: chave || '—', nNF: tx(ide, 'nNF'), serie: String(tx(ide, 'serie', '1')).padStart(3, '0'),
    natOp: tx(ide, 'natOp'), dhEmi: tx(ide, 'dhEmi') || tx(ide, 'dEmi'), dhSai: tx(ide, 'dhSaiEnt'),
    tpNF: tx(ide, 'tpNF', '1'), tpAmb: tx(ide, 'tpAmb', '1'), tpEmis: tx(ide, 'tpEmis', '1'), tpImp: tx(ide, 'tpImp', '1'),
    emit: { nome: tx(emit, 'xNome'), doc: tx(emit, 'CNPJ') || tx(emit, 'CPF'), IE: tx(emit, 'IE'), IEST: tx(emit, 'IEST'), IM: tx(emit, 'IM'), CRT: tx(emit, 'CRT'), ender: eo },
    dest: { nome: tx(dest, 'xNome') || '—', doc: tx(dest, 'CNPJ') || tx(dest, 'CPF'), IE: tx(dest, 'IE'), ender: doo },
    fat: fat ? { vLiq: num(fat, 'vLiq') } : null, dups,
    tot: total ? { vBC: num(total, 'vBC'), vICMS: num(total, 'vICMS'), vBCST: num(total, 'vBCST'), vST: num(total, 'vST'), vProd: num(total, 'vProd'), vFrete: num(total, 'vFrete'), vSeg: num(total, 'vSeg'), vDesc: num(total, 'vDesc'), vII: num(total, 'vII'), vIPI: num(total, 'vIPI'), vPIS: num(total, 'vPIS'), vCOFINS: num(total, 'vCOFINS'), vOutro: num(total, 'vOutro'), vNF: num(total, 'vNF'), vTotTrib: num(total, 'vTotTrib'),
      // NT 2026.010 §4.4: campos condicionais do ICMSTot. null = o XML não traz, e a
      // célula não é impressa — zero inventado num total é pior que célula vazia.
      vFCP: numOuNull(total, 'vFCP'), vFCPST: numOuNull(total, 'vFCPST'),
      vICMSUFDest: numOuNull(total, 'vICMSUFDest'), vFCPUFDest: numOuNull(total, 'vFCPUFDest'),
      qBCMono: numOuNull(total, 'qBCMono'), vICMSMono: numOuNull(total, 'vICMSMono'),
      qBCMonoReten: numOuNull(total, 'qBCMonoReten'), vICMSMonoReten: numOuNull(total, 'vICMSMonoReten'),
      // NT 2026.008: valores líquidos e ICMS previsto para pagamento antecipado.
      vProdLiqTot: numOuNull(total, 'vProdLiqTot'), ICMSPrevistoPagtoAntecip: numOuNull(total, 'ICMSPrevistoPagtoAntecip')
    } : { vNF: 0 },
    reforma, problemasChave, qr, urlChave,
    alertas,
    transp: transp ? (() => { const t = filhoDe(transp, 'transporta'); const peso = v => { const b = tx(v, 'pesoB'), l = tx(v, 'pesoL'); return (b || l) ? ` (${[b && `B ${b}`, l && `L ${l}`].filter(Boolean).join(' / ')} kg)` : ''; }; return { modFrete: tx(transp, 'modFrete'), tNome: tx(t, 'xNome'), tDoc: tx(t, 'CNPJ') || tx(t, 'CPF'), vols: filhosDe(transp).filter(v => v.nodeName === 'vol').map(v => ({ qVol: tx(v, 'qVol'), esp: tx(v, 'esp'), peso: peso(v) })) }; })() : null,
    iss: issTot ? { vServ: num(issTot, 'vServ'), vISS: num(issTot, 'vISS') } : null,
    // infCpl e infAdFisco são campos diferentes do leiaute: o primeiro vai para
    // "Informações complementares", o segundo para "Reservado ao fisco". O código
    // anterior juntava os dois no mesmo campo e ainda imprimia um texto fixo da
    // aplicação no lugar do fisco.
    infCpl: tx(infAdic, 'infCpl'), infFisco: tx(infAdic, 'infAdFisco'),
    prot: (nProt || dhProt) ? { nProt, dh: dhProt } : null,
    itens
  };
}

function parseXML(text, name) {
  const clean = String(text || '').replace(/xmlns(:\w+)?="[^"]*"/g, '');
  const xml = new DOMParser().parseFromString(clean, 'text/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
  if (!noDoc(xml, 'infNFe')) throw new Error('Este gerador lê NF-e modelo 55 (infNFe).');
  return parseNFe(xml, name);
}

/* --- Render DANFE empresarial NT 2026.010 --- */
/* A chave com pontos só pode quebrar de linha após o ponto, nunca no meio do
   grupo de 4 dígitos — <wbr> marca os únicos pontos de quebra permitidos. */
const chaveHtml = c => esc(fmtChave(c)).replace(/\./g, '.<wbr>');
/* NT 2026.004: com CNPJ alfanumérico a chave deixa de ser só numérica. CODE-128C só
   codifica pares de dígitos, então a chave alfanumérica usa CODE-128 (auto). */
function barcodeSVG(chave) {
  const c = soAlfanum(chave);
  const semBarra = `<div class="sem-barra">Código de barras indisponível — confira pela chave digitada</div>`;
  if (c.length !== 44 || typeof JsBarcode === 'undefined') return `<div class="d-key">${chaveHtml(chave)}</div>${semBarra}`;
  const formato = /^\d{44}$/.test(c) ? 'CODE128C' : 'CODE128';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try { JsBarcode(svg, c, { format: formato, displayValue: false, height: 46, margin: 0 }); } catch { return `<div class="d-key">${chaveHtml(chave)}</div>${semBarra}`; }
  return `<div class="d-bar">${svg.outerHTML}</div><div class="d-key">${chaveHtml(chave)}</div>`;
}
/* QR Code do DANFE (NT 2026.010). Gerado localmente, sem rede, a partir do conteúdo
   que o XML traz. Sem a biblioteca, o campo informa o que aconteceu em vez de exibir
   um retângulo vazio com "regulamentação futura". */
function qrSVG(texto, largura = 74) {
  if (!texto) return '';
  if (typeof qrcode === 'undefined') return `<div class="sem-qr">QR Code não desenhado (biblioteca ausente).</div>`;
  try {
    const q = qrcode(0, 'M'); q.addData(texto); q.make();
    const n = q.getModuleCount(), m = 4, total = n + m * 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m},${y + m}h1v1h-1z`;
    return `<svg class="qr" viewBox="0 0 ${total} ${total}" width="${largura}" height="${largura}" shape-rendering="crispEdges" role="img" aria-label="QR Code da NF-e"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  } catch { return `<div class="sem-qr">QR Code inválido no XML.</div>`; }
}
/* CRT com a descrição do código, como o modelo do DANFE exige — não só o número. */
const CRT_DESC = { '1': '1 - Simples Nacional', '2': '2 - Simples Nacional, excesso de sublimite', '3': '3 - Regime Normal', '4': '4 - MEI' };
const crtTexto = c => CRT_DESC[String(c || '').trim()] || (c ? `${c} - não informado` : '—');
const FRETE = { '0': '0-Remetente', '1': '1-Destinatário', '2': '2-Terceiros', '9': '9-Sem frete' };
/* Nome + documento do transportador sem o "— —" quando o XML não traz transportadora. */
function transpId(t) {
  const nome = (t && t.tNome) || '', doc = onlyD(t && t.tDoc);
  if (nome && doc) return `${nome} ${maskDoc(doc)}`;
  return nome || (doc ? maskDoc(doc) : '—');
}
/* O infCpl às vezes traz metadados do emissor entre pipes (|md5: …|). Não é
   informação fiscal e polui o campo complementar. Só o padrão de metadado é removido:
   qualquer outro trecho entre pipes é conteúdo do contribuinte e fica preservado. */
const limpaInfCpl = s => String(s || '')
  .replace(/\|\s*(md5|hash|sha1|sha256)\s*:[^|]*\|/gi, ' ')
  .replace(/\s+/g, ' ').trim();

function renderDANFE(d) {
  const eo = d.emit.ender || {}, doo = d.dest.ender || {};
  const endEmit = `${eo.lgr || ''}${eo.nro ? ', ' + eo.nro : ''} - ${eo.bairro || ''} - ${eo.mun || ''}/${eo.uf || ''} ${eo.cep ? 'CEP ' + eo.cep : ''}`.replace(/^[ -]+/, '');
  const endDest = `${doo.lgr || ''}${doo.nro ? ', ' + doo.nro : ''} - ${doo.bairro || ''} - ${doo.mun || ''}/${doo.uf || ''}`.replace(/^[ -]+/, '');
  const stripes =
    (String(d.tpImp) === '6' ? `<div class="stripe simpl">DANFE SIMPLIFICADO — Tipo 2 (tpImp=6, NT 2026.002)</div>` : '') +
    (d.tpAmb === '2' ? `<div class="stripe hom">SEM VALOR FISCAL — AMBIENTE DE HOMOLOGAÇÃO (tpAmb=2)</div>` : '') +
    ((d.tpEmis && d.tpEmis !== '1') ? `<div class="stripe cont">EMISSÃO EM CONTINGÊNCIA — tpEmis ${esc(d.tpEmis)} · consulte o XML / EPEC</div>` : '') +
    (!d.prot ? `<div class="stripe noprot">SEM PROTOCOLO DE AUTORIZAÇÃO NO XML — não transite com a mercadoria</div>` : '');
  // NT 2026.002: o DANFE Simplificado (tpImp=6) não tem canhoto.
  const simplificado = String(d.tpImp) === '6';
  const canhoto = simplificado ? '' :
    `<div class="d-canhoto"><div class="t">RECEBEMOS DE <b>${esc(d.emit.nome)}</b> OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA ABAIXO<br>DATA DE RECEBIMENTO ___/___/______ &nbsp;&nbsp; IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR ___________________________________</div><div class="nf">NF-e<br>Nº ${esc(fmtNF(d.nNF))}<br><span style="font-size:8px">Série ${esc(d.serie)}</span></div></div>`;
  const itensHTML = d.itens.map(it => {
    const cel = v => `<td class="num">${v}</td>`;
    const par = (rotulo, valor) => `<span class="trib-l"><span>${rotulo}</span><b>${valor}</b></span>`;
    // NT 2026.010: cada item traz cClassTrib, o CST de IBS/CBS e o CST do IS junto à
    // descrição, e o detalhamento por tributo sai nos três quadros do modelo —
    // BASES DE CÁLCULO, ALÍQUOTAS e VALOR DOS TRIBUTOS —, não numa linha de texto.
    const idReforma = [
      it.temIbsCbs ? `cClassTrib <b>${esc(it.cClassTrib || '—')}</b> · CST IBS/CBS <b>${esc(it.cst || '—')}</b>` : '',
      it.temIS ? `CST IS <b>${esc(it.cstIS || '—')}</b>` : '',
      it.efetiva ? '<span class="tag">alíquota efetiva</span>' : ''
    ].filter(Boolean).join(' · ');
    return `<tr class="item">
      <td>${esc(String(it.cProd || '—').slice(0, 18))}</td>
      <td><b>${esc(it.xProd)}</b>${it.infAdProd ? `<div class="infadprod">${esc(it.infAdProd)}</div>` : ''}${idReforma ? `<div class="cclass">${idReforma}</div>` : ''}</td>
      <td>${esc(it.NCM)}</td><td>${esc(it.CST)}</td><td>${esc(it.CFOP)}</td><td>${esc(it.uCom)}</td>
      ${cel(esc(fmtQtd(it.qCom)))}${cel(num4(it.vUnCom))}${cel(num2(it.vProd))}
    </tr>
    <tr class="trib">
      <td colspan="3"><div class="trib-h">Bases de cálculo</div>${par('BC ICMS', num2(it.BC))}${it.BCST ? par('BC ICMS ST', num2(it.BCST)) : ''}${it.temIbsCbs ? par('BC IBS/CBS', num2(it.vBC)) : ''}${it.temIS ? par('BC IS', num2(it.vBCIS)) : ''}${!it.temIbsCbs && !it.temIS ? '<span class="sem-rtc">Sem grupos da Reforma neste item.</span>' : ''}</td>
      <td colspan="3"><div class="trib-h">Alíquotas</div>${par('ICMS', it.aliqICMS ? num2(it.aliqICMS) + '%' : '—')}${it.temIbsCbs ? par('IBS UF', num2(it.pIBSUF) + '%') + par('IBS Mun', num2(it.pIBSMun) + '%') + par('CBS', num2(it.pCBS) + '%') : ''}${it.temIS ? par('IS', num2(it.pIS) + '%') : ''}</td>
      <td colspan="3"><div class="trib-h">Valor dos tributos</div>${par('ICMS', num2(it.vICMS))}${par('IPI', num2(it.vIPI))}${it.temIbsCbs ? par('IBS UF', num2(it.vIBSUF)) + par('IBS Mun', num2(it.vIBSMun)) + par('CBS', num2(it.vCBS)) : ''}${it.temIS ? par('IS', num2(it.vIS)) : ''}</td>
    </tr>`;
  }).join('');

  // Faixa de alerta: divergência e chave inválida precisam aparecer no DANFE impresso,
  // não só na tela. Sem isso o contador leva para a papelada um número que o XML não
  // sustenta.
  const faixasAlerta = (d.alertas || []).filter(a => a.nivel === 'erro')
    .map(a => `<div class="stripe erro">⚠ ${esc(a.texto)}</div>`).join('');
  const avisos = (d.alertas || []).filter(a => a.nivel === 'aviso')
    .map(a => `<div class="stripe aviso">⚠ ${esc(a.texto)}</div>`).join('');

  const r = d.reforma;
  // NT 2026.010: o quadro tem 8 campos — vCBS, vIBSUF, vIBSMun, vIS e os quatro
  // monofásicos. Campo que o XML não declara sai como "—": o gerador não estima.
  const monoVals = [r.vIBSMono, r.vCBSMono, r.vIBSMonoReten, r.vCBSMonoReten];
  const temMono = monoVals.some(v => v !== null && v !== undefined);
  const fmtTot = v => (v === null || v === undefined) ? '—' : fmtBRL(v);
  const blocoReforma = r.temNoXML
    ? `<div class="d-tot-reforma">
        <div><span class="d-lab">Total IBS UF</span><div class="v">${fmtTot(r.vIBSUF)}</div></div>
        <div><span class="d-lab">Total IBS Município</span><div class="v">${fmtTot(r.vIBSMun)}</div></div>
        <div><span class="d-lab">Total CBS</span><div class="v">${fmtTot(r.vCBS)}</div></div>
        <div><span class="d-lab">Total Imposto Seletivo (IS)</span><div class="v">${fmtTot(r.vIS)}</div></div>
      </div>` +
      (temMono ? `<div class="d-tot-reforma">
        <div><span class="d-lab">IBS Monofásico</span><div class="v">${fmtTot(r.vIBSMono)}</div></div>
        <div><span class="d-lab">CBS Monofásica</span><div class="v">${fmtTot(r.vCBSMono)}</div></div>
        <div><span class="d-lab">IBS Mono por retenção</span><div class="v">${fmtTot(r.vIBSMonoReten)}</div></div>
        <div><span class="d-lab">CBS Mono por retenção</span><div class="v">${fmtTot(r.vCBSMonoReten)}</div></div>
      </div>` : '')
    : `<div class="d-tot-reforma"><div><span class="d-lab">IBS / CBS / IS</span><div class="d-val norm">Sem grupos de IBS/CBS/IS no XML — documento anterior ao preenchimento obrigatório (03/08/2026) ou operação sem incidência.</div></div></div>`;

  return `<div class="danfe">
    ${canhoto}
    <div class="d-row first">
      <div class="d-cell" style="flex:1.2"><span class="d-lab">Identificação do emitente</span><div class="d-val">${esc(d.emit.nome)}<br><span style="font-weight:normal;font-size:8px">${esc(endEmit || '—')}<br>${esc(maskDoc(d.emit.doc))} · IE ${esc(d.emit.IE || 'sem IE')}${d.emit.IM ? ' · IM ' + esc(d.emit.IM) : ''}</span></div></div>
      <div class="d-cell" style="width:150px;text-align:center"><div class="d-val" style="font-size:14px">DANFE${simplificado ? '<br>SIMPLIFICADO' : ''}</div><div style="font-size:8px">Documento Auxiliar da NF-e${simplificado ? ' — Tipo 2' : ''}</div><div style="font-size:9px;margin-top:2px">${d.tpNF === '0' ? '0-ENTRADA' : '1-SAÍDA'}</div><div style="font-size:9px;font-weight:bold">Série ${esc(d.serie)}</div><div style="font-size:10px;font-weight:bold">Nº ${esc(fmtNF(d.nNF))}</div><div style="font-size:8px">FOLHA 1/1</div></div>
      <div class="d-cell" style="flex:1.3;text-align:center"><span class="d-lab">Controle do fisco — chave de acesso</span>${barcodeSVG(d.chave)}<div style="font-size:8px">Consulta em ${esc(d.urlChave || 'nfe.fazenda.gov.br/portal')}</div></div>
    </div>
    ${faixasAlerta}${avisos}${stripes}
    <div class="d-row first" style="margin-top:${stripes || faixasAlerta || avisos ? '0' : '4px'}">
      <div class="d-cell" style="flex:1.4"><span class="d-lab">Descrição da operação</span><div class="d-val">${esc(d.natOp || '—')}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">Protocolo de autorização de uso</span><div class="d-val">${d.prot ? esc(d.prot.nProt) + ' · ' + esc(fmtData(d.prot.dh)) + ' ' + esc(fmtHora(d.prot.dh)) : 'SEM PROTOCOLO'}</div></div>
    </div>
    <div class="d-row">
      <div class="d-cell" style="width:22%"><span class="d-lab">Inscrição estadual</span><div class="d-val">${esc(d.emit.IE || '—')}${d.emit.IE ? '' : ' <span class="tag">SEM IE</span>'}</div></div>
      <div class="d-cell" style="width:20%"><span class="d-lab">Inscr. estadual subst. trib.</span><div class="d-val">${esc(d.emit.IEST || '—')}</div></div>
      <div class="d-cell" style="width:30%"><span class="d-lab">CNPJ / CPF + CRT</span><div class="d-val">${esc(maskDoc(d.emit.doc))} <span class="tag crt">${esc(crtTexto(d.emit.CRT))}</span></div></div>
      <div class="d-cell" style="width:28%"><span class="d-lab">Tipo de Regime de Apuração do IBS e da CBS</span><div class="d-val norm">— <span class="tag">campo reservado na NT</span></div></div>
    </div>
    <div class="d-sec">Destinatário / remetente</div>
    <div class="d-row first">
      <div class="d-cell" style="flex:1.5"><span class="d-lab">Nome / razão social</span><div class="d-val">${esc(d.dest.nome)}</div></div>
      <div class="d-cell" style="width:170px"><span class="d-lab">CNPJ / CPF</span><div class="d-val">${esc(maskDoc(d.dest.doc))}</div></div>
      <div class="d-cell" style="width:130px"><span class="d-lab">Data emissão</span><div class="d-val">${esc(fmtData(d.dhEmi))} ${esc(fmtHora(d.dhEmi))}</div></div>
    </div>
    <div class="d-row">
      <div class="d-cell" style="flex:1.4"><span class="d-lab">Endereço</span><div class="d-val norm">${esc(endDest || '—')}</div></div>
      <div class="d-cell" style="width:120px"><span class="d-lab">Bairro</span><div class="d-val norm">${esc(doo.bairro || '—')}</div></div>
      <div class="d-cell" style="width:90px"><span class="d-lab">CEP</span><div class="d-val">${esc(doo.cep || '—')}</div></div>
      <div class="d-cell" style="width:130px"><span class="d-lab">Data saída/entrada</span><div class="d-val">${esc(fmtData(d.dhSai) || fmtData(d.dhEmi))}</div></div>
    </div>
    <div class="d-row">
      <div class="d-cell" style="flex:1.2"><span class="d-lab">Município</span><div class="d-val">${esc(doo.mun || '—')}</div></div>
      <div class="d-cell" style="width:50px"><span class="d-lab">UF</span><div class="d-val">${esc(doo.uf || '—')}</div></div>
      <div class="d-cell" style="width:120px"><span class="d-lab">Fone</span><div class="d-val norm">${esc(doo.fone || '—')}</div></div>
      <div class="d-cell" style="width:140px"><span class="d-lab">Inscrição estadual</span><div class="d-val">${esc(d.dest.IE || '—')}</div></div>
      <div class="d-cell" style="width:110px"><span class="d-lab">Hora saída</span><div class="d-val">${esc(fmtHora(d.dhSai) || fmtHora(d.dhEmi))}</div></div>
    </div>
    <div class="d-sec">Fatura / duplicatas</div>
    <div class="d-row first"><div class="d-cell" style="flex:1"><div class="d-val norm">${d.dups.length ? d.dups.map(p => `Nº ${esc(p.nDup || '—')} · Venc ${esc(p.dVenc)} · ${fmtBRL(p.vDup)}`).join(' &nbsp;|&nbsp; ') : '—'}</div></div></div>
    <div class="d-sec">Cálculo do imposto (valores do XML)</div>
    <div class="d-row first">
      <div class="d-cell" style="flex:1"><span class="d-lab">BC ICMS</span><div class="d-val">${num2(d.tot.vBC)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">Valor ICMS</span><div class="d-val">${num2(d.tot.vICMS)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">BC ICMS ST</span><div class="d-val">${num2(d.tot.vBCST)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">Valor ICMS ST</span><div class="d-val">${num2(d.tot.vST)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">V. produtos</span><div class="d-val">${num2(d.tot.vProd)}</div></div>
    </div>
    <div class="d-row">
      <div class="d-cell" style="flex:1"><span class="d-lab">Frete</span><div class="d-val">${num2(d.tot.vFrete)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">Seguro</span><div class="d-val">${num2(d.tot.vSeg)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">Desconto</span><div class="d-val">${num2(d.tot.vDesc)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">Outras desp.</span><div class="d-val">${num2(d.tot.vOutro)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">V. total trib. (Lei 12.741)</span><div class="d-val">${num2(d.tot.vTotTrib)}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">V. total da nota</span><div class="d-val">${num2(d.tot.vNF)}</div></div>
    </div>
    ${(() => {
      // NT 2026.010 §4.4 + NT 2026.008: campos condicionais do ICMSTot. Só a célula
      // cujo campo existe no XML é impressa — nada de zero inventado.
      const opc = [
        ['V. FCP', d.tot.vFCP], ['V. FCP ST', d.tot.vFCPST],
        ['ICMS UF destino', d.tot.vICMSUFDest], ['FCP UF destino', d.tot.vFCPUFDest],
        ['QBC monofásico', d.tot.qBCMono], ['ICMS monofásico', d.tot.vICMSMono],
        ['QBC mono retido', d.tot.qBCMonoReten], ['ICMS mono retido', d.tot.vICMSMonoReten],
        ['V. produtos líquido', d.tot.vProdLiqTot], ['ICMS previsto p/ pagto antecipado', d.tot.ICMSPrevistoPagtoAntecip]
      ].filter(([, v]) => v !== null && v !== undefined);
      if (!opc.length) return '';
      return `<div class="d-row">${opc.map(([rot, v]) => `<div class="d-cell" style="flex:1"><span class="d-lab">${esc(rot)}</span><div class="d-val">${num2(v)}</div></div>`).join('')}</div>`;
    })()}
    <div class="d-sec green">Total do IBS / CBS / IS — Reforma Tributária (NT 2026.010)</div>
    ${blocoReforma}
    <div class="d-sec">Transportador / volumes</div>
    <div class="d-row first"><div class="d-cell" style="flex:1"><div class="d-val norm">${d.transp ? `${esc(FRETE[d.transp.modFrete] || d.transp.modFrete)} · ${esc(transpId(d.transp))} · Vols: ${d.transp.vols.map(v => `${esc(v.qVol || '')} ${esc(v.esp || '')}${esc(v.peso || '')}`).join(' | ') || '—'}` : 'Frete conforme XML (sem informação quando em branco).'}</div></div></div>
    <div class="d-sec gold">Dados dos produtos / serviços + IBS · CBS · IS por item (NT 2026.010)</div>
    <table class="d-itens">
      <thead><tr><th>Cód</th><th>Descrição</th><th>NCM</th><th>CST</th><th>CFOP</th><th>UN</th><th>Qtd</th><th>V.Unit</th><th>V.Total</th></tr></thead>
      <tbody>${itensHTML}</tbody>
    </table>
    ${d.iss && (d.iss.vServ || d.iss.vISS) ? `<div class="d-sec">Cálculo do ISSQN</div><div class="d-row first"><div class="d-cell"><div class="d-val">V.Serv ${num2(d.iss.vServ)} · V.ISS ${num2(d.iss.vISS)}</div></div></div>` : ''}
    <div class="d-sec">Dados adicionais</div>
    <div class="d-row first"><div class="d-cell" style="flex:1"><span class="d-lab">Informações complementares</span><div class="d-val norm">${esc(limpaInfCpl(d.infCpl) || '—')}</div></div><div class="d-cell" style="width:180px"><span class="d-lab">Reservado ao fisco</span><div class="d-val norm">${esc(d.infFisco || '—')}</div></div><div class="d-cell d-qr" style="width:96px;text-align:center"><span class="d-lab">QR Code</span>${d.qr ? qrSVG(d.qr) : '<div class="sem-qr">não informado no XML</div>'}</div></div>
    <div class="d-foot"><span>Gerado localmente a partir do XML · ${esc(d.fileName)} · Impresso em ${new Date().toLocaleString('pt-BR')}</span><span>DANFE — sem valor fiscal isolado · validade no XML autorizado</span></div>
  </div>`;
}

/* --- XML de exemplo distribuído com o site ---
   Leiaute da NT 2025.002 v1.52: itens em <IBSCBS>/<gIBSCBS> e totais em
   <IBSCBSTot> (com gIBS/gCBS) e <ISTot>. O exemplo anterior usava <UB> e <W03>,
   que não existem no leiaute — quem estudasse por ele aprendia a tag errada. */
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
<NFe><infNFe Id="NFe35261112345678000195550010000004561000004568">
<ide><cUF>35</cUF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>456</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>2</tpAmb><tpImp>1</tpImp><tpEmis>1</tpEmis><finNFe>1</finNFe></ide>
<emit><CNPJ>12345678000195</CNPJ><xNome>EMPRESA EXEMPLO LTDA</xNome><IE>123456789</IE><CRT>3</CRT><enderEmit><xLgr>RUA DAS PALMEIRAS</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP><fone>1133334444</fone></enderEmit></emit>
<dest><CNPJ>98765432000110</CNPJ><xNome>CLIENTE EXEMPLO SA</xNome><IE>987654321</IE><enderDest><xLgr>AV BRASIL</xLgr><nro>200</nro><xBairro>CENTRO</xBairro><xMun>RIO DE JANEIRO</xMun><UF>RJ</UF><CEP>20010000</CEP></enderDest></dest>
<det nItem="1"><prod><cProd>001</cProd><xProd>NOTEBOOK CORPORATIVO 14pol</xProd><NCM>84713000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>3500.0000</vUnCom><vProd>7000.00</vProd><vUnComLiq>3500.0000</vUnComLiq><vProdLiq>7000.00</vProdLiq></prod><imposto><ICMS><ICMS00><CST>00</CST><vBC>7000.00</vBC><pICMS>18.00</pICMS><vICMS>1260.00</vICMS></ICMS00></ICMS><IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>7000.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>7.00</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><gCBS><pCBS>0.90</pCBS><vCBS>63.00</vCBS></gCBS></gIBSCBS></IBSCBS><IS><CSTIS>00</CSTIS><vBCIS>7000.00</vBCIS><pIS>0.00</pIS><vIS>0.00</vIS></IS></imposto></det>
<det nItem="2"><prod><cProd>002</cProd><xProd>REFRIGERANTE LATA 350ML CX C/12 (IS)</xProd><NCM>22021000</NCM><CFOP>5102</CFOP><uCom>CX</uCom><qCom>10.0000</qCom><vUnCom>60.0000</vUnCom><vProd>600.00</vProd><vUnComLiq>60.0000</vUnComLiq><vProdLiq>600.00</vProdLiq></prod><imposto><ICMS><ICMS00><CST>00</CST><vBC>600.00</vBC><pICMS>18.00</pICMS><vICMS>108.00</vICMS></ICMS00></ICMS><IBSCBS><CST>000</CST><cClassTrib>000002</cClassTrib><gIBSCBS><vBC>600.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.60</vIBSUF></gIBSUF><gCBS><pCBS>0.90</pCBS><vCBS>5.40</vCBS></gCBS></gIBSCBS></IBSCBS><IS><CSTIS>10</CSTIS><vBCIS>600.00</vBCIS><pIS>5.00</pIS><vIS>30.00</vIS></IS></imposto></det>
<total><ICMSTot><vBC>7600.00</vBC><vICMS>1368.00</vICMS><vProd>7600.00</vProd><vFrete>0.00</vFrete><vNF>7600.00</vNF><vTotTrib>1500.00</vTotTrib><vProdLiqTot>7600.00</vProdLiqTot></ICMSTot><ISTot><vIS>30.00</vIS></ISTot><IBSCBSTot><vBCIBSCBS>7600.00</vBCIBSCBS><gIBS><gIBSUF><vIBSUF>7.60</vIBSUF></gIBSUF><gIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><vIBS>7.60</vIBS></gIBS><gCBS><vCBS>68.40</vCBS></gCBS></IBSCBSTot></total>
<transp><modFrete>9</modFrete></transp>
<infAdic><infCpl>AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL. NT 2026.010 v1.00 - demonstracao IBS/CBS/IS.</infCpl></infAdic>
</infNFe>
<infNFeSupl><qrCode>https://www.nfe.fazenda.gov.br/portal/consulta.aspx?chave=35261112345678000195550010000004561000004568</qrCode><urlChave>www.nfe.fazenda.gov.br/portal</urlChave></infNFeSupl>
</NFe>
<protNFe><infProt><nProt>135260000000001</nProt><dhRecbto>2026-11-20T10:01:00-03:00</dhRecbto><chNFe>35261112345678000195550010000004561000004568</chNFe></infProt></protNFe>
</nfeProc>`;
function downloadSample() {
  const blob = new Blob([SAMPLE], { type: 'text/xml' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exemplo-nfe-reforma-nt2026-010.xml'; a.click();
}

/* --- Lote / UI --- */
function refreshLote() {
  if (!docs.length) { loteBar.hidden = true; loteList.innerHTML = ''; docNav.hidden = true; paper.hidden = true; empty.hidden = false; return; }
  loteBar.hidden = false; docNav.hidden = false; paper.hidden = false; empty.hidden = true;
  loteInfo.textContent = `${docs.length} documento(s) · ${fmtBRL(docs.reduce((a, d) => a + (d.tot.vNF || 0), 0))}`;
  loteList.innerHTML = docs.map((d, i) => `<button class="lote-item ${i === cur ? 'active' : ''}" data-i="${i}"><span class="n">${String(d.nNF || '?').padStart(3, '0').slice(-6)}</span><span style="flex:1"><b>NF ${esc(fmtNF(d.nNF))}</b> · ${esc(d.emit.nome)} → ${esc(d.dest.nome)} · ${fmtBRL(d.tot.vNF)} ${d.reforma.temNoXML ? '<span class="badge b-ok">IBS/CBS/IS</span>' : '<span class="badge b-warn">sem Reforma</span>'} ${d.tpAmb === '2' ? '<span class="badge b-err">HOMOLOG</span>' : ''} ${!d.prot ? '<span class="badge b-err">SEM PROT</span>' : ''}</span></button>`).join('');
  loteList.querySelectorAll('.lote-item').forEach(b => b.onclick = () => { cur = +b.dataset.i; show(); });
  show();
}
function show() {
  const d = docs[cur]; if (!d) return;
  docPos.textContent = `${cur + 1} / ${docs.length}`;
  paper.innerHTML = renderDANFE(d);
  refreshLoteActive();
}
function refreshLoteActive() { loteList.querySelectorAll('.lote-item').forEach((b, i) => b.classList.toggle('active', i === cur)); }

/* --- Lote: funções puras (testáveis) --- */
/* Célula de CSV com defesa contra injeção de fórmula: texto que começa com
   = + - @ Tab ou CR ganha apóstrofo, para o Excel não executar como fórmula. */
function csvCelda(v) {
  const s = String(v ?? '');
  const perigosa = /^[=+\-@\t\r]/.test(s);
  const comAspas = s.replace(/"/g, '""');
  return `"${perigosa ? "'" + comAspas : comAspas}"`;
}
/* Chave "—"/vazia nunca é duplicata: só chave real de 44 dígitos conta. */
function chaveJaNoLote(lista, chave) {
  return !!chave && chave !== '—' && lista.some(d => d.chave === chave);
}
/* Um resumo só, em vez de um alert por arquivo. Vazio quando tudo entrou. */
function montaResumo({ ok, dups, grandes, excesso, erros }) {
  const partes = [];
  if (grandes.length) partes.push(`${grandes.length} acima de 5 MB ignorados: ${grandes.join(', ')}`);
  if (excesso.length) partes.push(`limite de ${MAX_FILES} documentos: ${excesso.length} não carregados`);
  if (dups) partes.push(`${dups} duplicado(s) ignorados (mesma chave de acesso)`);
  for (const e of erros) partes.push(e);
  if (!partes.length) return '';
  return `Carregados: ${ok}.\n` + partes.join('\n');
}
/* Restaura título/DOM quando a impressão termina (afterprint), com rede de
   segurança de 5 s. Sem window (testes), executa na hora. */
function aposImpressao(fn) {
  if (typeof window === 'undefined' || !window.addEventListener) { fn(); return; }
  let feito = false;
  const umaVez = () => { if (feito) return; feito = true; window.removeEventListener('afterprint', umaVez); fn(); };
  window.addEventListener('afterprint', umaVez);
  setTimeout(umaVez, 5000);
}
/* Quantidade com vírgula decimal; texto não numérico passa cru. */
function fmtQtd(q) {
  const v = parseFloat(String(q ?? '').replace(',', '.'));
  return isNaN(v) ? (q || '—') : num4(v);
}

async function handleFiles(files) {
  const lista = [...files].filter(f => /\.xml$/i.test(f.name));
  if (!lista.length) return alert('Selecione arquivos .xml de NF-e.');
  const margem = Math.max(MAX_FILES - docs.length, 0);
  const excesso = lista.length > margem ? lista.slice(margem).map(f => f.name) : [];
  const candidatos = lista.slice(0, margem);
  const grandes = candidatos.filter(f => f.size > MAX_BYTES).map(f => f.name);
  let ok = 0, dups = 0;
  const erros = [];
  for (const f of candidatos.filter(f => f.size <= MAX_BYTES)) {
    try {
      const text = await f.text();
      if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw new Error('XML com DTD/ENTITY bloqueado');
      const doc = parseXML(text, f.name);
      if (chaveJaNoLote(docs, doc.chave)) { dups++; continue; }
      docs.push(doc); ok++;
    } catch (e) { erros.push(`${f.name}: ${e.message}`); }
  }
  const resumo = montaResumo({ ok, dups, grandes, excesso, erros });
  if (resumo) alert(resumo);
  if (ok) cur = docs.length - ok;
  refreshLote();
  if (docs.length) $('#danfeArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* --- Interface: só existe no navegador --- */
function iniciar() {
dropzone.addEventListener('click', e => { if (e.target.closest('button')) return; fileInput.click(); });
$('#btnPick').onclick = e => { e.stopPropagation(); fileInput.click(); };
$('#btnPickTop').onclick = () => fileInput.click();
$('#btnTopConvert').onclick = () => $('#conversor').scrollIntoView({ behavior: 'smooth' });
fileInput.addEventListener('change', e => { handleFiles(e.target.files); fileInput.value = ''; });
['dragover', 'dragenter'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('over'); }));
dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
$('#btnClear').onclick = e => { e.stopPropagation(); docs = []; cur = 0; refreshLote(); };
$('#btnPrev').onclick = () => { if (docs.length) { cur = (cur - 1 + docs.length) % docs.length; show(); } };
$('#btnNext').onclick = () => { if (docs.length) { cur = (cur + 1) % docs.length; show(); } };
function printName(d) { const serie = String(d.serie || '000').padStart(3, '0'); return `Danfe_${serie}_${fmtNF(d.nNF)}`; }
$('#btnPrint').onclick = () => {
  const d = docs[cur]; if (!d) return;
  const prev = document.title;
  document.title = printName(d);
  aposImpressao(() => { document.title = prev; });
  window.print();
};
$('#btnPrintAll').onclick = () => {
  if (!docs.length) return;
  const prev = document.title;
  const keep = paper.innerHTML;
  document.title = docs.length === 1 ? printName(docs[0]) : `Danfes_${docs.length}_documentos`;
  paper.innerHTML = `<div class="danfe-print-all">${docs.map(renderDANFE).join('')}</div>`;
  aposImpressao(() => { paper.innerHTML = keep; document.title = prev; });
  window.print();
};
$('#btnCsv').onclick = () => {
  if (!docs.length) return;
  const head = ['numero', 'serie', 'emissao', 'emitente', 'emit_doc', 'CRT', 'destinatario', 'dest_doc', 'vNF', 'vIBS', 'vCBS', 'vIS', 'tem_reforma', 'chave', 'protocolo'];
  // Total ausente no XML vira célula vazia no CSV — nunca 0,00 inventado.
  const dec = v => (v === null || v === undefined) ? '' : v.toFixed(2);
  const lines = [head.join(';')].concat(docs.map(d => [d.nNF, d.serie, fmtData(d.dhEmi), d.emit.nome, d.emit.doc, d.emit.CRT, d.dest.nome, d.dest.doc, dec(d.tot.vNF), dec(d.reforma.vIBS), dec(d.reforma.vCBS), dec(d.reforma.vIS), d.reforma.temNoXML ? 'SIM' : 'NAO', d.chave, d.prot ? d.prot.nProt : 'SEM'].map(csvCelda).join(';')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'conferencia-danfe-reforma.csv'; a.click();
};
/* Rodapé padrão Hub Fiscal: botão Copiar (Pix/Lightning) e link ver completa. */
document.querySelectorAll('[data-copy]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const el = document.getElementById(btn.getAttribute('data-copy'));
    if (!el) return;
    const texto = (el.getAttribute('data-full') || el.textContent || '').trim();
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      const antes = btn.textContent;
      btn.textContent = 'Copiado!';
      setTimeout(() => { btn.textContent = antes; }, 1500);
    } catch (e) { console.warn('[DANFE] clipboard indisponível:', e && e.name); }
  });
});
document.querySelectorAll('[data-reveal]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const el = document.getElementById(link.getAttribute('data-reveal'));
    if (!el) return;
    const full = el.getAttribute('data-full') || '';
    if (!el.getAttribute('data-short')) el.setAttribute('data-short', el.textContent);
    const short = el.getAttribute('data-short');
    const mostrandoTudo = el.textContent === full;
    el.textContent = mostrandoTudo ? short : full;
    link.textContent = mostrandoTudo
      ? (link.getAttribute('data-reveal') === 'ln-address' ? 'ver invoice completa' : 'ver chave completa')
      : 'ocultar';
  });
});

}

if (typeof document !== 'undefined') iniciar();
