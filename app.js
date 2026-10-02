/* DANFE Reforma NT 2026.010 v1.00 — parser + render empresarial, 100% local
   Grupos tolerantes a variações de nome (UB/IBSCBS/gIBSCBS, VB/IS/gIS, W03/IBSCBSTot):
   - item: cClassTrib, CST IBS/CBS, vBC, pIBSUF/pIBSMun/pCBS, vIBSUF/vIBSMun/vCBS, IS: vBCIS/pIS/vIS
   - totais: soma dos itens quando o grupo de totais não existir
   - emit.CRT sempre exibido
*/
const $ = s => document.querySelector(s);
const dropzone = $('#dropzone'), fileInput = $('#fileInput');
const loteList = $('#loteList'), loteBar = $('#loteBar'), loteInfo = $('#loteInfo');
const docNav = $('#docNav'), docPos = $('#docPos'), paper = $('#danfePaper'), empty = $('#danfeEmpty');
let docs = [], cur = 0;
const MAX_FILES = 100, MAX_BYTES = 5 * 1024 * 1024;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const onlyD = s => String(s || '').replace(/\D/g, '');
const fmtBRL = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num2 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num4 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
function maskDoc(s) { s = onlyD(s); if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); return s || '—'; }
function fmtChave(c) { c = onlyD(c); return c.replace(/(\d{4})(?=\d)/g, '$1.'); }
function fmtData(iso) { if (!iso || iso === '—') return '—'; const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; }
function fmtHora(iso) { const m = String(iso || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; }
function fmtNF(n) { const d = onlyD(String(n || '')); if (!d) return '—'; const p = d.padStart(9, '0'); return p.slice(0, 3) + '.' + p.slice(3, 6) + '.' + p.slice(6, 9); }

/* --- XML helpers tolerantes a namespace --- */
function el1(parent, tag) {
  if (!parent) return null;
  try { const l = parent.getElementsByTagName(tag); if (l && l.length) return l[0]; } catch {}
  try { if (parent.getElementsByTagNameNS) { const l = parent.getElementsByTagNameNS('*', tag); if (l && l.length) return l[0]; } } catch {}
  return null;
}
function allBy(parent, tag) {
  if (!parent) return [];
  try { const l = parent.getElementsByTagName(tag); if (l && l.length) return [...l]; } catch {}
  return [];
}
function tx(parent, tag, fb = '') { const e = el1(parent, tag); return e && e.textContent != null ? e.textContent.trim() : fb; }
function num(parent, ...tags) { for (const t of tags) { const e = el1(parent, t); if (e && e.textContent.trim() !== '') { const v = parseFloat(e.textContent.trim().replace(',', '.')); if (!isNaN(v)) return v; } } return 0; }
function str(parent, ...tags) { for (const t of tags) { const v = tx(parent, t, ''); if (v) return v; } return ''; }
function firstEl(parent, ...tags) { for (const t of tags) { const e = el1(parent, t); if (e) return e; } return null; }

/* --- Reforma por item --- */
function reformaItem(det, prod) {
  // Grupo IBS/CBS: tenta UB, IBSCBS, gIBSCBS, imposto/UB...
  const imp = el1(det, 'imposto') || det;
  const ub = firstEl(det, 'UB') || firstEl(imp, 'UB') || firstEl(det, 'IBSCBS') || firstEl(imp, 'IBSCBS') || firstEl(det, 'gIBSCBS') || firstEl(imp, 'gIBSCBS');
  const ubScope = ub || det;
  const gTrib = firstEl(ubScope, 'gIBSCBS') || ubScope;
  const gIBSUF = firstEl(gTrib, 'gIBSUF'), gIBSMun = firstEl(gTrib, 'gIBSMun'), gCBS = firstEl(gTrib, 'gCBS');
  const cClassTrib = str(ubScope, 'cClassTrib') || str(det, 'cClassTrib');
  const cst = str(ubScope, 'CST') || str(gTrib, 'CST');
  const vBC = num(gTrib, 'vBC') || num(ubScope, 'vBCIBS') || num(ubScope, 'vBCBS') || num(det, 'vBCIBS');
  const pIBSUF = num(gIBSUF || gTrib, 'pIBSUF', 'pIBS');
  const pIBSMun = num(gIBSMun || gTrib, 'pIBSMun');
  const pCBS = num(gCBS || gTrib, 'pCBS');
  const vIBSUF = num(gIBSUF || gTrib, 'vIBSUF', 'vIBS');
  const vIBSMun = num(gIBSMun || gTrib, 'vIBSMun');
  const vCBS = num(gCBS || gTrib, 'vCBS');
  // IS: grupo VB / IS / gIS
  const isEl = firstEl(det, 'IS') || firstEl(imp, 'IS') || firstEl(det, 'gIS') || firstEl(imp, 'gIS') || firstEl(det, 'VB') || firstEl(imp, 'VB');
  const cstIS = isEl ? str(isEl, 'CSTIS', 'CST') : '';
  const vBCIS = isEl ? num(isEl, 'vBCIS', 'vBC') : 0;
  const pIS = isEl ? num(isEl, 'pIS', 'pISCOFINS') : 0;
  const vIS = isEl ? num(isEl, 'vIS') : (num(det, 'vIS') || 0);
  const has = !!(ub || isEl || cClassTrib || vIBSUF || vIBSMun || vCBS || vIS);
  return { has, cClassTrib, cst, vBC, pIBSUF, pIBSMun, pCBS, vIBSUF, vIBSMun, vCBS, vIBSTot: vIBSUF + vIBSMun, cstIS, vBCIS, pIS, vIS };
}

/* --- Parser NF-e --- */
function parseNFe(xml, name) {
  const inf = el1(xml, 'infNFe'), scope = inf || xml;
  const ide = el1(scope, 'ide') || el1(xml, 'ide');
  const emit = el1(scope, 'emit') || el1(xml, 'emit');
  const dest = el1(scope, 'dest') || el1(xml, 'dest');
  const eEmit = firstEl(emit, 'enderEmit', 'enderEmi', 'ender');
  const eDest = firstEl(dest, 'enderDest', 'enderEnt', 'ender');
  const total = el1(xml, 'ICMSTot'), issTot = el1(xml, 'ISSQNtot');
  const transp = el1(scope, 'transp') || el1(xml, 'transp');
  const infAdic = el1(scope, 'infAdic') || el1(xml, 'infAdic');
  const fat = el1(scope, 'fat') || el1(xml, 'fat');
  const dups = allBy(fat || xml, 'dup').filter(d => fat ? true : false).map(d => ({ nDup: tx(d, 'nDup'), dVenc: fmtData(tx(d, 'dVenc')), vDup: num(d, 'vDup') }));
  const dets = allBy(scope, 'det').length ? allBy(scope, 'det') : allBy(xml, 'det');
  const itens = dets.map(det => {
    const prod = el1(det, 'prod') || det;
    const icmsEl = el1(det, 'ICMS');
    let cstIcms = '';
    if (icmsEl && icmsEl.children) for (const c of icmsEl.children) { const s = el1(c, 'CST') || el1(c, 'CSOSN'); if (s && s.textContent.trim()) { cstIcms = s.textContent.trim(); break; } }
    const ref = reformaItem(det, prod);
    return {
      cProd: tx(prod, 'cProd'), xProd: tx(prod, 'xProd'), infAdProd: tx(det, 'infAdProd'),
      NCM: tx(prod, 'NCM'), CFOP: tx(prod, 'CFOP'), uCom: tx(prod, 'uCom'), qCom: tx(prod, 'qCom'),
      vUnCom: num(prod, 'vUnCom'), vProd: num(prod, 'vProd'), vDesc: num(prod, 'vDesc'),
      CST: cstIcms, BC: num(det, 'vBC') || num(icmsEl, 'vBC'),
      vICMS: num(det, 'vICMS') || num(icmsEl, 'vICMS'), aliqICMS: str(icmsEl, 'pICMS'),
      vIPI: num(det, 'vIPI') || num(el1(det, 'IPI'), 'vIPI'), aliqIPI: str(el1(det, 'IPI'), 'pIPI'),
      ...ref
    };
  });
  // Totais Reforma W03 (vários nomes possíveis)
  const w03 = firstEl(xml, 'W03') || firstEl(xml, 'IBSCBSTot') || firstEl(xml, 'gIBSCBSTot') || firstEl(xml, 'ISTot') || firstEl(xml, 'totIBS');
  const tIBS = w03 ? (num(w03, 'vIBS', 'vIBSTot', 'vTotIBS') || num(w03, 'vIBSUF') + num(w03, 'vIBSMun')) : 0;
  const tCBS = w03 ? num(w03, 'vCBS', 'vCBSTot', 'vTotCBS') : 0;
  const tIS = w03 ? num(w03, 'vIS', 'vISTot', 'vTotIS') : (num(xml, 'vISTot') || 0);
  const sumIBS = itens.reduce((a, i) => a + (i.vIBSTot || 0), 0);
  const sumCBS = itens.reduce((a, i) => a + (i.vCBS || 0), 0);
  const sumIS = itens.reduce((a, i) => a + (i.vIS || 0), 0);
  const chave = (onlyD(inf && inf.getAttribute('Id')) || '').slice(-44) || onlyD(tx(xml, 'chNFe'));
  const protEl = el1(xml, 'protNFe');
  const E = n => firstEl(emit, n) ? tx(emit, n) : '';
  const eo = eEmit ? { lgr: tx(eEmit, 'xLgr'), nro: tx(eEmit, 'nro'), bairro: tx(eEmit, 'xBairro'), mun: tx(eEmit, 'xMun'), uf: tx(eEmit, 'UF'), cep: tx(eEmit, 'CEP'), fone: tx(eEmit, 'fone') } : {};
  const doo = eDest ? { lgr: tx(eDest, 'xLgr'), nro: tx(eDest, 'nro'), bairro: tx(eDest, 'xBairro'), mun: tx(eDest, 'xMun'), uf: tx(eDest, 'UF'), cep: tx(eDest, 'CEP'), fone: tx(eDest, 'fone') } : {};
  return {
    fileName: name, chave: chave || '—', nNF: tx(ide, 'nNF'), serie: String(tx(ide, 'serie', '1')).padStart(3, '0'),
    natOp: tx(ide, 'natOp'), dhEmi: tx(ide, 'dhEmi') || tx(ide, 'dEmi'), dhSai: tx(ide, 'dhSaiEnt'),
    tpNF: tx(ide, 'tpNF', '1'), tpAmb: tx(ide, 'tpAmb', '1'), tpEmis: tx(ide, 'tpEmis', '1'),
    emit: { nome: tx(emit, 'xNome'), doc: tx(emit, 'CNPJ') || tx(emit, 'CPF'), IE: tx(emit, 'IE'), IEST: tx(emit, 'IEST'), IM: tx(emit, 'IM'), CRT: tx(emit, 'CRT'), ender: eo },
    dest: { nome: tx(dest, 'xNome') || '—', doc: tx(dest, 'CNPJ') || tx(dest, 'CPF'), IE: tx(dest, 'IE'), email: tx(dest, 'email'), ender: doo },
    fat: fat ? { vLiq: num(fat, 'vLiq') } : null, dups,
    tot: total ? { vBC: num(total, 'vBC'), vICMS: num(total, 'vICMS'), vBCST: num(total, 'vBCST'), vST: num(total, 'vST'), vProd: num(total, 'vProd'), vFrete: num(total, 'vFrete'), vSeg: num(total, 'vSeg'), vDesc: num(total, 'vDesc'), vII: num(total, 'vII'), vIPI: num(total, 'vIPI'), vPIS: num(total, 'vPIS'), vCOFINS: num(total, 'vCOFINS'), vOutro: num(total, 'vOutro'), vNF: num(total, 'vNF'), vTotTrib: num(total, 'vTotTrib') } : { vNF: 0 },
    reforma: { vIBS: tIBS || sumIBS, vCBS: tCBS || sumCBS, vIS: tIS || sumIS, temNoXML: !!(w03 || sumIBS || sumCBS || sumIS || itens.some(i => i.has)) },
    transp: transp ? { modFrete: tx(transp, 'modFrete'), tNome: tx(el1(transp, 'transporta'), 'xNome'), tDoc: tx(el1(transp, 'transporta'), 'CNPJ') || tx(el1(transp, 'transporta'), 'CPF'), vols: allBy(transp, 'vol').map(v => ({ qVol: tx(v, 'qVol'), esp: tx(v, 'esp'), pesoB: tx(v, 'pesoB'), pesoL: tx(v, 'pesoL') })) } : null,
    iss: issTot ? { vServ: num(issTot, 'vServ'), vISS: num(issTot, 'vISS') } : null,
    infCpl: tx(infAdic, 'infCpl'), infFisco: tx(infAdic, 'infAdFisco'),
    prot: protEl ? { nProt: tx(protEl, 'nProt'), dh: tx(protEl, 'dhRecbto') } : null,
    itens
  };
}

function parseXML(text, name) {
  const clean = String(text || '').replace(/xmlns(:\w+)?="[^"]*"/g, '');
  const xml = new DOMParser().parseFromString(clean, 'text/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('XML inválido');
  if (!el1(xml, 'infNFe')) throw new Error('Este gerador lê NF-e modelo 55 (infNFe).');
  return parseNFe(xml, name);
}

/* --- Render DANFE empresarial NT 2026.010 --- */
function barcodeSVG(chave) {
  const c = onlyD(chave);
  if (c.length !== 44 || typeof JsBarcode === 'undefined') return `<div class="d-key">${esc(fmtChave(chave))}</div>`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try { JsBarcode(svg, c, { format: 'CODE128C', displayValue: false, height: 46, margin: 0 }); } catch { return `<div class="d-key">${esc(fmtChave(chave))}</div>`; }
  return `<div class="d-bar">${svg.outerHTML}</div><div class="d-key">${esc(fmtChave(chave))}</div>`;
}
const FRETE = { '0': '0-Remetente', '1': '1-Destinatário', '2': '2-Terceiros', '9': '9-Sem frete' };

function renderDANFE(d) {
  const eo = d.emit.ender || {}, doo = d.dest.ender || {};
  const endEmit = `${eo.lgr || ''}${eo.nro ? ', ' + eo.nro : ''} - ${eo.bairro || ''} - ${eo.mun || ''}/${eo.uf || ''} ${eo.cep ? 'CEP ' + eo.cep : ''}`.replace(/^[ -]+/, '');
  const endDest = `${doo.lgr || ''}${doo.nro ? ', ' + doo.nro : ''} - ${doo.bairro || ''} - ${doo.mun || ''}/${doo.uf || ''}`.replace(/^[ -]+/, '');
  const stripes =
    (d.tpAmb === '2' ? `<div class="stripe hom">SEM VALOR FISCAL — AMBIENTE DE HOMOLOGAÇÃO (tpAmb=2)</div>` : '') +
    ((d.tpEmis && d.tpEmis !== '1') ? `<div class="stripe cont">EMISSÃO EM CONTINGÊNCIA — tpEmis ${esc(d.tpEmis)} · consulte o XML / EPEC</div>` : '') +
    (!d.prot ? `<div class="stripe noprot">SEM PROTOCOLO DE AUTORIZAÇÃO NO XML — não transite com a mercadoria</div>` : '');
  const itensHTML = d.itens.map((it, i) => {
    const ref = it.has
      ? `<span class="tag">IBS ${esc(it.cst || '—')}</span> cClassTrib <b>${esc(it.cClassTrib || '—')}</b> · BC ${num2(it.vBC)} · alíq UF ${num2(it.pIBSUF)}% / Mun ${num2(it.pIBSMun)}% / CBS ${num2(it.pCBS)}% · vIBS ${num2(it.vIBSTot)} (UF ${num2(it.vIBSUF)} + Mun ${num2(it.vIBSMun)}) · vCBS ${num2(it.vCBS)}` +
        (it.vIS || it.cstIS ? ` · <span class="tag is">IS ${esc(it.cstIS || '')}</span> BC ${num2(it.vBCIS)} alíq ${num2(it.pIS)}% vIS ${num2(it.vIS)}` : ` · IS —`)
      : `<span style="color:#5b6b7f">Sem grupos da Reforma neste item (XML anterior à NT 2026.010 ou operação sem IBS/CBS/IS).</span>`;
    return `<tr>
      <td>${String(it.cProd || '—').slice(0, 18)}</td><td><b>${esc(it.xProd)}</b>${it.infAdProd ? `<br><i>${esc(it.infAdProd).slice(0, 220)}</i>` : ''}</td>
      <td>${esc(it.NCM)}</td><td>${esc(it.CST)}</td><td>${esc(it.CFOP)}</td><td>${esc(it.uCom)}</td>
      <td style="text-align:right">${esc(it.qCom)}</td><td style="text-align:right">${num4(it.vUnCom)}</td>
      <td style="text-align:right">${num2(it.vProd)}</td><td style="text-align:right">${num2(it.BC)}</td>
      <td style="text-align:right">${num2(it.vICMS)}</td><td style="text-align:right">${num2(it.vIPI)}</td>
    </tr><tr class="reforma"><td colspan="12">${ref}</td></tr>`;
  }).join('');

  const r = d.reforma;
  const blocoReforma = r.temNoXML
    ? `<div class="d-tot-reforma">
        <div><span class="d-lab">Total IBS (UF + Mun)</span><div class="v">${fmtBRL(r.vIBS)}</div></div>
        <div><span class="d-lab">Total CBS</span><div class="v">${fmtBRL(r.vCBS)}</div></div>
        <div><span class="d-lab">Total Imposto Seletivo (IS)</span><div class="v">${fmtBRL(r.vIS)}</div></div>
      </div>`
    : `<div class="d-tot-reforma"><div colspan="3"><span class="d-lab">IBS / CBS / IS</span><div class="d-val norm">Sem valores da Reforma no XML — correto para documento anterior a 01/12/2026 ou emitente em adaptação.</div></div></div>`;

  return `<div class="danfe">
    <div class="d-canhoto"><div class="t">RECEBEMOS DE <b>${esc(d.emit.nome)}</b> OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA ABAIXO<br>DATA DE RECEBIMENTO ___/___/______ &nbsp;&nbsp; IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR ___________________________________</div><div class="nf">NF-e<br>Nº ${esc(fmtNF(d.nNF))}<br><span style="font-size:10px">Série ${esc(d.serie)}</span></div></div>
    <div class="d-row first">
      <div class="d-cell" style="flex:1.2"><span class="d-lab">Identificação do emitente</span><div class="d-val">${esc(d.emit.nome)}<br><span style="font-weight:normal;font-size:9px">${esc(endEmit || '—')}<br>${esc(maskDoc(d.emit.doc))} · IE ${esc(d.emit.IE || '—')}${d.emit.IM ? ' · IM ' + esc(d.emit.IM) : ''}</span></div></div>
      <div class="d-cell" style="width:150px;text-align:center"><span class="d-lab">Danfe</span><div class="d-val" style="font-size:15px">DANFE</div><div style="font-size:8px">Doc. Auxiliar da NF-e</div><div style="font-size:10px;margin-top:2px">${d.tpNF === '0' ? '0-ENTRADA' : '1-SAÍDA'}</div><div style="font-size:10px;font-weight:bold">Série ${esc(d.serie)}</div><div style="font-size:11px;font-weight:bold">Nº ${esc(fmtNF(d.nNF))}</div></div>
      <div class="d-cell" style="flex:1.3;text-align:center"><span class="d-lab">Controle do fisco — chave de acesso</span>${barcodeSVG(d.chave)}<div style="font-size:7.5px">Consulta em nfe.fazenda.gov.br/portal</div></div>
    </div>
    ${stripes}
    <div class="d-row first" style="margin-top:${stripes ? '0' : '4px'}">
      <div class="d-cell" style="flex:1.4"><span class="d-lab">Natureza da operação</span><div class="d-val">${esc(d.natOp || '—')}</div></div>
      <div class="d-cell" style="flex:1"><span class="d-lab">Protocolo de autorização de uso</span><div class="d-val">${d.prot ? esc(d.prot.nProt) + ' · ' + esc(fmtData(d.prot.dh)) + ' ' + esc(fmtHora(d.prot.dh)) : 'SEM PROTOCOLO'}</div></div>
    </div>
    <div class="d-row">
      <div class="d-cell" style="width:24%"><span class="d-lab">Inscrição estadual</span><div class="d-val">${esc(d.emit.IE || '')}</div></div>
      <div class="d-cell" style="width:26%"><span class="d-lab">Inscr. estadual subst. trib.</span><div class="d-val">${esc(d.emit.IEST || '')}</div></div>
      <div class="d-cell" style="width:26%"><span class="d-lab">CNPJ / CPF + CRT</span><div class="d-val">${esc(maskDoc(d.emit.doc))} <span class="tag crt">CRT ${esc(d.emit.CRT || '—')}</span></div></div>
      <div class="d-cell" style="width:24%"><span class="d-lab">Chave (44 dígitos)</span><div class="d-val" style="font-size:8.5px">${esc(fmtChave(d.chave))}</div></div>
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
    <div class="d-sec green">Total do IBS / CBS / IS — Reforma Tributária (NT 2026.010)</div>
    ${blocoReforma}
    <div class="d-sec">Transportador / volumes</div>
    <div class="d-row first"><div class="d-cell" style="flex:1"><div class="d-val norm">${d.transp ? `${esc(FRETE[d.transp.modFrete] || d.transp.modFrete)} · ${esc(d.transp.tNome || '—')} ${esc(maskDoc(d.transp.tDoc || ''))} · Vols: ${d.transp.vols.map(v => `${esc(v.qVol || '')} ${esc(v.esp || '')}`).join(' | ') || '—'}` : 'Frete conforme XML (sem informação quando em branco).'}</div></div></div>
    <div class="d-sec gold">Dados dos produtos / serviços + IBS · CBS · IS por item (NT 2026.010)</div>
    <table class="d-itens">
      <thead><tr><th>Cód</th><th>Descrição</th><th>NCM</th><th>CST</th><th>CFOP</th><th>UN</th><th>Qtd</th><th>V.Unit</th><th>V.Total</th><th>BC ICMS</th><th>V.ICMS</th><th>V.IPI</th></tr></thead>
      <tbody>${itensHTML}</tbody>
    </table>
    ${d.iss && (d.iss.vServ || d.iss.vISS) ? `<div class="d-sec">Cálculo do ISSQN</div><div class="d-row first"><div class="d-cell"><div class="d-val">V.Serv ${num2(d.iss.vServ)} · V.ISS ${num2(d.iss.vISS)}</div></div></div>` : ''}
    <div class="d-sec">Dados adicionais</div>
    <div class="d-row first"><div class="d-cell" style="flex:1"><span class="d-lab">Informações complementares</span><div class="d-val norm">${esc([d.infCpl, d.infFisco].filter(Boolean).join(' | ') || '—')}</div></div><div class="d-cell" style="width:180px"><span class="d-lab">Reservado ao fisco</span><div class="d-val norm">NT 2026.010 v1.00 · produção 01/12/2026</div></div></div>
    <div class="d-foot"><span>Gerado localmente a partir do XML · ${esc(d.fileName)} · Impresso em ${new Date().toLocaleString('pt-BR')}</span><span>DANFE — sem valor fiscal isolado · validade no XML autorizado</span></div>
  </div>`;
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

async function handleFiles(files) {
  let list = [...files].filter(f => /\.xml$/i.test(f.name));
  if (!list.length) return alert('Selecione arquivos .xml de NF-e.');
  list = list.filter(f => f.size <= MAX_BYTES);
  if (docs.length + list.length > MAX_FILES) { alert(`Limite de ${MAX_FILES}.`); list = list.slice(0, MAX_FILES - docs.length); }
  for (const f of list) {
    try {
      const text = await f.text();
      if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) throw new Error('XML com DTD/ENTITY bloqueado');
      docs.push(parseXML(text, f.name));
    } catch (e) { alert(`${f.name}: ${e.message}`); }
  }
  cur = Math.max(0, docs.length - list.length);
  refreshLote();
  if (docs.length) $('#danfeArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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
  window.print();
  setTimeout(() => { document.title = prev; }, 500);
};
$('#btnPrintAll').onclick = () => {
  if (!docs.length) return;
  const prev = document.title;
  const keep = paper.innerHTML;
  document.title = docs.length === 1 ? printName(docs[0]) : `Danfes_${docs.length}_documentos`;
  paper.innerHTML = `<div class="danfe-print-all">${docs.map(renderDANFE).join('')}</div>`;
  window.print();
  setTimeout(() => { paper.innerHTML = keep; document.title = prev; }, 500);
};
$('#btnCsv').onclick = () => {
  if (!docs.length) return;
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['numero', 'serie', 'emissao', 'emitente', 'emit_doc', 'CRT', 'destinatario', 'dest_doc', 'vNF', 'vIBS', 'vCBS', 'vIS', 'tem_reforma', 'chave', 'protocolo'];
  const lines = [head.join(';')].concat(docs.map(d => [d.nNF, d.serie, fmtData(d.dhEmi), d.emit.nome, d.emit.doc, d.emit.CRT, d.dest.nome, d.dest.doc, d.tot.vNF.toFixed(2), d.reforma.vIBS.toFixed(2), d.reforma.vCBS.toFixed(2), d.reforma.vIS.toFixed(2), d.reforma.temNoXML ? 'SIM' : 'NAO', d.chave, d.prot ? d.prot.nProt : 'SEM'].map(q).join(';')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'conferencia-danfe-reforma.csv'; a.click();
};

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
<NFe><infNFe Id="NFe35260912345678000195550010000004561000004561">
<ide><cUF>35</cUF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>456</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><tpNF>1</tpNF><tpAmb>2</tpAmb><tpEmis>1</tpEmis><finNFe>1</finNFe></ide>
<emit><CNPJ>12345678000195</CNPJ><xNome>EMPRESA EXEMPLO LTDA</xNome><IE>123456789</IE><CRT>3</CRT><enderEmit><xLgr>RUA DAS PALMEIRAS</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP><fone>1133334444</fone></enderEmit></emit>
<dest><CNPJ>98765432000110</CNPJ><xNome>CLIENTE EXEMPLO SA</xNome><IE>987654321</IE><enderDest><xLgr>AV BRASIL</xLgr><nro>200</nro><xBairro>CENTRO</xBairro><xMun>RIO DE JANEIRO</xMun><UF>RJ</UF><CEP>20010000</CEP></enderDest></dest>
<det nItem="1"><prod><cProd>001</cProd><xProd>NOTEBOOK CORPORATIVO 14pol</xProd><NCM>84713000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>3500.0000</vUnCom><vProd>7000.00</vProd></prod><imposto><ICMS><ICMS00><CST>00</CST><vBC>7000.00</vBC><pICMS>18.00</pICMS><vICMS>1260.00</vICMS></ICMS00></ICMS><UB><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>7000.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>7.00</vIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun><gCBS><pCBS>0.90</pCBS><vCBS>63.00</vCBS></gCBS></gIBSCBS></UB><IS><CSTIS>00</CSTIS><vBCIS>7000.00</vBCIS><pIS>0.00</pIS><vIS>0.00</vIS></IS></imposto></det>
<det nItem="2"><prod><cProd>002</cProd><xProd>REFRIGERANTE LATA 350ML CX C/12 (IS)</xProd><NCM>22021000</NCM><CFOP>5102</CFOP><uCom>CX</uCom><qCom>10.0000</qCom><vUnCom>60.0000</vUnCom><vProd>600.00</vProd></prod><imposto><ICMS><ICMS00><CST>00</CST><vBC>600.00</vBC><pICMS>18.00</pICMS><vICMS>108.00</vICMS></ICMS00></ICMS><UB><CST>000</CST><cClassTrib>000002</cClassTrib><gIBSCBS><vBC>600.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF><vIBSUF>0.60</vIBSUF></gIBSUF><gCBS><pCBS>0.90</pCBS><vCBS>5.40</vCBS></gCBS></gIBSCBS></UB><IS><CSTIS>10</CSTIS><vBCIS>600.00</vBCIS><pIS>5.00</pIS><vIS>30.00</vIS></IS></imposto></det>
<total><ICMSTot><vBC>7600.00</vBC><vICMS>1368.00</vICMS><vProd>7600.00</vProd><vFrete>0.00</vFrete><vNF>7600.00</vNF><vTotTrib>1500.00</vTotTrib></ICMSTot><W03><vIBS>7.60</vIBS><vCBS>68.40</vCBS><vIS>30.00</vIS></W03></total>
<transp><modFrete>9</modFrete></transp>
<infAdic><infCpl>AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL. NT 2026.010 v1.00 - demonstracao IBS/CBS/IS.</infCpl></infAdic>
</infNFe></NFe>
<protNFe><infProt><nProt>135260000000001</nProt><dhRecbto>2026-11-20T10:01:00-03:00</dhRecbto><chNFe>35260912345678000195550010000004561000004561</chNFe></infProt></protNFe>
</nfeProc>`;
function downloadSample() {
  const blob = new Blob([SAMPLE], { type: 'text/xml' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exemplo-nfe-reforma-nt2026-010.xml'; a.click();
}
$('#btnSample').onclick = e => { e.stopPropagation(); downloadSample(); };
$('#btnSampleTop').onclick = downloadSample;
