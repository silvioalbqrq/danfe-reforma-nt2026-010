# DANFE Reforma Tributária — NT 2026.010 v1.00

Gerador local (sem servidor) de DANFE no **novo layout** com IBS, CBS, IS e CRT.

## Uso local
1. Abra `index.html` com duplo clique (funciona em `file://`).
2. Clique em **Selecionar XML** ou arraste a NF-e modelo 55 autorizada.
3. Confira o DANFE empresarial: bloco **Total do IBS/CBS/IS**, por item **cClassTrib + base + alíquotas + valores**, e **CRT do emitente**.
4. **Imprimir / Salvar PDF** pelo navegador. CSV de conferência incluído.

Teste rápido: use `sample-nfe-reforma.xml` (homologação, com IBS/CBS/IS).

## Publicar no GitHub Pages
1. Crie o repositório e suba estes arquivos na raiz.
2. Settings → Pages → Deploy from branch → `main` → `/(root)`.
3. Acesse a URL do Pages.

## Base legal
- DANFE: Ajuste SINIEF 07/05 + MOC NF-e v7 Anexo III.
- Reforma: EC 132/2023, LC 214/2025, **NT 2026.010 v1.00** — IBS/CBS/IS no DANFE, CRT do emitente.
- **Produção do novo leiaute: 01/12/2026.** XMLs sem grupos da Reforma são sinalizados como "sem valores da Reforma" (normal antes da vigência).

Parser pelos nomes canônicos da NT (IBSCBS/UB com gIBSCBS, IS, W03/IBSCBSTot). Só imprime o que consta no XML; divergência entre total declarado e soma dos itens, e chave de acesso inválida, geram alerta no DANFE.
