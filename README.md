# DANFE Reforma Tributária — NT 2026.010 v1.00

Gerador local (sem servidor) de DANFE no **layout da Reforma Tributária**, com IBS, CBS, IS e CRT.

## Uso local
1. Abra `index.html` com duplo clique (funciona em `file://`).
2. Clique em **Selecionar XML** ou arraste a NF-e modelo 55 autorizada.
3. Confira o DANFE: bloco **Total do IBS/CBS/IS**, por item **cClassTrib + bases + alíquotas + valores** e **CRT do emitente**.
4. **Imprimir / Salvar PDF** pelo navegador. CSV de conferência incluído.

Teste rápido: use `sample-nfe-reforma.xml` (homologação, com IBS/CBS/IS).

## Publicar no GitHub Pages
1. Crie o repositório e suba estes arquivos na raiz.
2. Settings → Pages → Deploy from branch → `main` → `/(root)`.
3. Acesse a URL do Pages.

## Base legal
- DANFE: Ajuste SINIEF 07/05 + MOC NF-e v7 Anexo III.
- Reforma: EC 132/2023, LC 214/2025.
- **NT 2026.010 v1.00** — DANFE da Reforma: 8 campos de total (vIBSUF, vIBSMun, vCBS, vIS, vIBSMono, vCBSMono, vIBSMonoReten, vCBSMonoReten), tipo de regime de apuração do IBS/CBS, BASES/ALÍQUOTAS/VALOR DOS TRIBUTOS por item, QR Code. **Produção: 01/12/2026.**
- **NT 2025.002 v1.52** — leiaute dos grupos de IBS/CBS/IS (`IBSCBS`, `IBSCBSTot`, `ISTot`). **Produção: 03/11/2026.**
- **NT 2026.004 v1.01** — CNPJ e chave de acesso alfanuméricos. **Em produção desde 01/07/2026.**
- **NT 2026.008 v1.00** — `vUnComLiq`, `vProdLiq`, `vProdLiqTot`, `ICMSPrevistoPagtoAntecip`. Produção: 03/11/2026.
- **NT 2026.007 v1.10** — NF-e sem inscrição estadual para contribuinte exclusivo de IBS/CBS. Produção: 03/11/2026.
- **NT 2026.002 v1.11** — DANFE Simplificado Tipo 2 (`tpImp=6`). Regras até 14/12/2026.

Vigência: o IBS/CBS tem valor jurídico desde **01/01/2026** e o preenchimento dos grupos é obrigatório em produção desde **03/08/2026** (CRT 3). Documento anterior a essas datas continua legível e é sinalizado como “sem grupos de IBS/CBS/IS”.

## Regras de leitura
- O parser usa **apenas os nomes canônicos do leiaute** — não há tag inventada.
- **Só é impresso o que consta no XML.** Total ausente fica em branco (“—”); a soma dos itens nunca é apresentada como total declarado.
- Divergência entre total declarado e soma dos itens, e chave de acesso inválida, geram alerta no próprio DANFE.
- Campos condicionais (vFCP, vFCPST, vICMSUFDest, vFCPUFDest, qBCMono, vICMSMono, qBCMonoReten, vICMSMonoReten, vProdLiqTot, ICMSPrevistoPagtoAntecip) só aparecem quando o XML os traz.
- CNPJ/CPF e chave aceitam o formato numérico e o alfanumérico (NT 2026.004); o DV é módulo 11 sobre caracteres, com letras valendo `ASCII − 48`.

## Testes
```
node --test test/
```
60 testes, sem dependências. Cobrem o leiaute real (`IBSCBS`/`IBSCBSTot`/`ISTot`), CNPJ alfanumérico, ausência de inferência, QR Code, `tpImp=6`, campos condicionais e o CSS de impressão.

## Terceiros
- `vendor/jsbarcode.min.js` — código de barras CODE-128.
- `vendor/qrcode.js` — QR Code (MIT, Kazuhiko Arase). Sem rede: tudo roda no navegador.
