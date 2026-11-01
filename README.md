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
- **NT 2026.005 v1.00** — Simples Nacional no IBS/CBS: `tpRegimeIBSCBS` (C21a) no emitente, `cAtivSN` (I17d) no item e `gTribSN` (UB115a) no item e nos totais (`total/IBSCBSTot/gTribSN`). RVs conferidas: W59h-10/20, W59i-10, W59j-10. MEI (CRT 4) não informa o grupo IBSCBS. **Homologação até 26/10/2026; produção: 16/11/2026.**
- **NT 2026.008 v1.01** — `vUnComLiq`, `vProdLiq`, `vProdLiqTot` e `ICMSPrevistoPagtoAntecip` (grupo NB01 do ICMS do item). RVs conferidas: I11c-20, W01a-10/20 e NB01-10/20/30. **Homologação até 26/10/2026; produção: 16/11/2026.**
- **NT 2026.007 v1.11** — NF-e sem inscrição estadual para contribuinte exclusivo de IBS/CBS. RVs conferidas: N01-10 (ICMS vedado, exceto devolução `finNFe=4`), UB12-11 (IBS/CBS obrigatório), C17-42 (NFC-e vedada), C17-43 (CNPJ obrigatório) e C18-50 (IEST vedado). **Homologação até 26/10/2026; produção: 16/11/2026.**
- **NT 2026.002 v1.11** — DANFE Simplificado Tipo 2 (`tpImp=6`). Regras até 14/12/2026.
- **NT 2026.006 v1.00** — vinculação com a transação de pagamento (**split payment**), grupo YC: `gPgtoVinc`/`gPgto`, com `nPag` e `idTransacao` como **atributos**. O DANFE imprime a seção de pagamento vinculado; RVs conferidas: YC04-20 (`idTransacao` duplicado), YC05-10 (meio de pagamento fora de 2 dígitos), YC06-10 (CNPJ do recebedor).
- **NT 2026.001 v1.02b** — **PAA** (Provedor de Assinatura e Autorização): `procEmi=4`, série 970-989, grupo `infPAA` com `CNPJPAA` e `PAASignature`. RVs conferidas no XML: 450, 667, 668, 670, 867, 893 — o DANFE cita o número da RV no alerta. A exceção de produtor rural do RV 668 não é verificável no XML e por isso não é avaliada.
- **IT 2025.002 v1.70** — tabelas de classificação do IBS/CBS e do IS: `cClassTrib` com **6 dígitos**, cujos **três primeiros são o CST**; `cClassTribIS` (UB03) do Imposto Seletivo, também impresso no item.
- **MOC NF-e v7 Anexo III** — **contingência** por `tpEmis`, com o texto exigido em cada modalidade (FS-IA, EPEC, FS-DA, SVC-AN, SVC-RS) e impressão de `xJust`/`dhCont`. `tpEmis=3` (SCAN, desativado) e `tpEmis=9` (contingência offline da NFC-e) são recusados no modelo 55.

Vigência: o IBS/CBS tem valor jurídico desde **01/01/2026** e o preenchimento dos grupos é obrigatório em produção desde **03/08/2026** (CRT 3). Documento anterior a essas datas continua legível e é sinalizado como “sem grupos de IBS/CBS/IS”.

## Regras de leitura
- O parser usa **apenas os nomes canônicos do leiaute** — não há tag inventada.
- **Só é impresso o que consta no XML.** Total ausente fica em branco (“—”); a soma dos itens nunca é apresentada como total declarado.
- Divergência entre total declarado e soma dos itens, e chave de acesso inválida, geram alerta no próprio DANFE.
- Campos condicionais (vFCP, vFCPST, vICMSUFDest, vFCPUFDest, qBCMono, vICMSMono, qBCMonoReten, vICMSMonoReten, vUnComLiq, vProdLiq, vProdLiqTot, ICMSPrevistoPagtoAntecip) só aparecem quando o XML os traz.
- **`gTribSN`** (NT 2026.005) é lido no item — dentro de `IBSCBS`, aceitando também a posição dentro de `gIBSCBS` — e nos totais em `IBSCBSTot/gTribSN`. Item com `gTribSN` exige o total (W59h-10) e total sem item é indevido (W59h-20); `vIBSSN`/`vCBSSN` do total são conferidos contra a soma dos itens (W59i-10/W59j-10).
- **`ICMSPrevistoPagtoAntecip`** (NT 2026.008) é lido no grupo `ICMS` do item (N01), não em `ICMSTot`: NB01-10 veda em NFC-e, NB01-20 exige `tpNFDebito=06` ou `tpOperGov=4` e NB01-30 avisa a ausência a partir de 01/02/2027.
- **Emitente sem IE** (NT 2026.007) é identificado como contribuinte exclusivo do IBS/CBS; o ICMS do item é vedado, exceto em devolução (`finNFe=4`), e o grupo IBS/CBS é obrigatório em cada item.
- **Simples Nacional** (NT 2026.005): `tpRegimeIBSCBS` é impresso com descrição, `cAtivSN` aparece junto ao item e o MEI (CRT 4) é avisado quando informa o grupo IBSCBS.
- CNPJ/CPF e chave aceitam o formato numérico e o alfanumérico (NT 2026.004); o DV é módulo 11 sobre caracteres, com letras valendo `ASCII − 48`.
- Grupos que a nota não traz não viram seção no DANFE: sem `gPgtoVinc` não há seção de split payment, sem `infPAA` não há linha de PAA. `tpEmis` diferente de 1 sempre ganha faixa de contingência.
- **Limite conhecido do `cClassTrib`**: só a *forma* é validada (6 dígitos e prefixo igual ao CST). A tabela oficial de códigos é publicada no portal do DF-e (`dfe-portal.svrs.rs.gov.br`) e em JSON via CFF, não no PDF do IT 2025.002 — confirmar a existência do código exigiria baixar essa tabela, e o gerador é offline.

## Testes
```
node --test test/
```
108 testes, sem dependências. Cobrem o leiaute real (`IBSCBS`/`IBSCBSTot`/`ISTot`), CNPJ alfanumérico, ausência de inferência, QR Code, `tpImp=6`, campos condicionais, o CSS de impressão, o grupo YC do split payment, o `infPAA`/PAA, a forma do `cClassTrib`/`cClassTribIS`, as modalidades de contingência do MOC 7 Anexo III, o Simples Nacional (`tpRegimeIBSCBS`/`cAtivSN`/`gTribSN`), a emissão sem IE (N01-10, UB12-11, C17-43, C18-50) e o valor líquido/ICMS previsto (I11c-20, W01a, NB01).

## Terceiros
- `vendor/jsbarcode.min.js` — código de barras CODE-128.
- `vendor/qrcode.js` — QR Code (MIT, Kazuhiko Arase). Sem rede: tudo roda no navegador.
