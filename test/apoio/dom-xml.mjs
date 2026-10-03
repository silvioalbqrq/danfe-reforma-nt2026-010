// DOM XML mínimo para exercitar o `app.js` dentro do Node.
//
// O Node não tem `DOMParser`. Este shim implementa apenas a superfície de API que o
// `app.js` realmente usa — `getElementsByTagName`, `children`, `getAttribute` e
// `textContent` — e nem sabe o que é namespace, porque `parseXML` remove o `xmlns`
// do texto antes deAnalysisar.
//
// Ele existe para os testes de regressão dos bugs de leitura. A conferência final
// continua sendo feita no navegador de verdade.

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function desescapa(texto) {
  return texto.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (achado, ref) => {
    if (ref[0] === '#') {
      const base = ref[1] === 'x' || ref[1] === 'X' ? 16 : 10;
      const n = parseInt(ref.slice(2), base);
      return Number.isFinite(n) ? String.fromCodePoint(n) : achado;
    }
    return ENTIDADES[ref] ?? achado;
  });
}

function leAtributos(trecho) {
  const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const saida = [];
  let m;
  while ((m = re.exec(trecho))) {
    saida.push([m[1], desescapa(m[2] !== undefined ? m[2] : m[3])]);
  }
  return saida;
}

class No {
  constructor(nome) {
    this.nodeName = nome;
    this.localName = nome;
    this._atributos = [];
    this._filhos = [];
    this._texto = '';
  }

  get children() {
    return this._filhos;
  }

  getAttribute(nome) {
    const achado = this._atributos.find(([chave]) => chave === nome);
    return achado ? achado[1] : null;
  }

  get textContent() {
    return this._texto + this._filhos.map((f) => f.textContent).join('');
  }

  getElementsByTagName(tag) {
    const saida = [];
    const visita = (no) => {
      for (const filho of no._filhos) {
        if (filho.nodeName === tag) saida.push(filho);
        visita(filho);
      }
    };
    visita(this);
    return saida;
  }

  getElementsByTagNameNS(_ns, tag) {
    return this.getElementsByTagName(tag);
  }

  querySelector(sel) {
    return sel.startsWith('parsererror')
      ? (this.getElementsByTagName('parsererror')[0] ?? null)
      : null;
  }
}

class Elemento extends No {
  constructor(nome, atributos) {
    super(nome);
    this._atributos = atributos;
  }

  _recebe(texto) {
    this._texto += texto;
  }
}

class Documento extends No {
  constructor() {
    super('#documento');
  }

  _recebe(texto) {
    this._texto += texto;
  }

  _marcaComoInvalido(motivo) {
    const erro = new Elemento('parsererror', []);
    erro._recebe(motivo);
    this._filhos.push(erro);
  }
}

const TOKEN = new RegExp(
  [
    '<!--[\\s\\S]*?-->',            // comentário
    '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>', // CDATA
    '<\\?[^>]*\\?>',                  // declaração XML
    '<!DOCTYPE[^>]*>',                // DOCTYPE
    '<\\/([^>\\s]+)\\s*>',             // tag de fechamento
    '<([^\\s/>]+)((?:\\s[^\\s=>]+(?:\\s*=\\s*(?:"[^"]*"|\'[^\']*\'))?)*)\\s*(\\/?)>', // tag de abertura
    '[^<]+',                          // texto
  ].join('|'),
  'g',
);

export function parseXml(texto) {
  const doc = new Documento();
  const pilha = [doc];
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(texto)) !== null) {
    const achado = m[0];
    if (achado.startsWith('<!--') || achado.startsWith('<?') || achado.startsWith('<!DOCTYPE')) {
      continue;
    }
    const topo = pilha[pilha.length - 1];
    if (achado.startsWith('<![CDATA[')) {
      topo._recebe(achado.slice(9, -3));
      continue;
    }
    if (achado.startsWith('</')) {
      if (pilha.length === 1) {
        doc._marcaComoInvalido('tag de fechamento sem abertura');
        return doc;
      }
      pilha.pop();
      continue;
    }
    if (m[2] !== undefined) {
      // Grupos 2, 3 e 4 são os da alternativa "tag de abertura" (o grupo 1 pertence
      // à alternativa "tag de fechamento"). Só a abertura define m[2].
      const el = new Elemento(m[2], leAtributos(m[3] || ''));
      topo._filhos.push(el);
      if (!m[4]) pilha.push(el);
      continue;
    }
    topo._recebe(desescapa(achado));
  }
  if (pilha.length > 1) {
    doc._marcaComoInvalido('tag não fechada');
  }
  return doc;
}

export class DOMParserShim {
  parseFromString(texto) {
    return parseXml(texto);
  }
}