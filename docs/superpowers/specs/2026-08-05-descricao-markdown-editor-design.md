# Descrição de ferramenta com formatação rica (editor WYSIWYG + render fiel)

- **Data:** 2026-08-05
- **Issue:** fecha othavi0/emach-dashboard#364 (decisão do dono: a separação de campos
  `highlights`/`boxContents` pedida lá fica **fora de escopo** conscientemente — registrar no
  body do PR para o restante não morrer sem registro)
- **Decisões tomadas no brainstorm:** editor WYSIWYG (mockup opção B, escolhido pelo critério
  "selecionar palavra → clicar B → fica em negrito na hora"); sem headings na toolbar; render
  com estilos próprios em vez de `@tailwindcss/typography`.

## Problema

1. **Edição:** o campo Descrição do cadastro de ferramenta é um `Textarea` cru. O tooltip diz
   "Aceita Markdown", mas quem cadastra precisa saber sintaxe de cabeça — sem botões, sem
   preview. O pedido: selecionar uma palavra, clicar **B** e ela ficar em negrito ali mesmo.
2. **Exibição:** `<ToolDescription>` (react-markdown + rehype-sanitize) tem dois defeitos:
   - As classes `prose prose-sm` são **no-op** — `@tailwindcss/typography` não está instalado
     em lugar nenhum do monorepo. Listas renderizam sem marcador, sem hierarquia visual.
   - Markdown padrão **colapsa quebra de linha simples** (Enter sem linha em branco vira
     espaço) — quebras digitadas somem no render.
3. **Storefront:** a PDP do `emach-ecommerce` trata `description` como texto plano (PR #213
   de lá). Markdown gravado aqui apareceria com `**asteriscos**` crus na loja.

## Solução

### 1. `MarkdownEditor` (componente client novo)

- **Lib:** Tiptap (`@tiptap/react`, `@tiptap/starter-kit`) + `tiptap-markdown` para ler/gravar
  Markdown. Carregado via `next/dynamic` para o chunk (~50 kB) ficar restrito à tela de tool.
- **Extensões permitidas (whitelist):** paragraph, bold, italic, bulletList, orderedList,
  listItem, hardBreak (Shift+Enter), history. **Nada além** — sem headings, tabela, imagem,
  link, cor. Colar rico (Word/marketplace) preserva o subset e descarta o resto.
- **Toolbar:** 4 botões (negrito, itálico, lista com marcadores, lista numerada) com estado
  ativo; atalhos Ctrl+B / Ctrl+I nativos do Tiptap.
- **Contrato:** `value: string` (Markdown) + `onChange(markdown: string)` — drop-in no lugar
  do `Textarea` em `identity-fields.tsx`. Wizard e edição ganham juntos (fonte única
  `tool-sections.ts`). Repassa `aria-invalid` ao contêiner editável para o `focusFirstError`
  (padrão `LabeledField` do CLAUDE.md de apps/web).
- **Dados:** `tool.description` continua Markdown puro. **Sem mudança de schema, sem
  migração** — descrições legadas (texto plano ou blob) abrem no editor como parágrafos.

### 2. Render fiel em `<ToolDescription>`

- Adicionar **`remark-breaks`**: Enter simples vira `<br>` de verdade (também conserta o
  render das descrições legadas com quebras de texto plano).
- Substituir as classes `prose` mortas por **estilos próprios do subset** (p, strong, em, ul,
  ol, li), seguindo DESIGN.md. Sem instalar `@tailwindcss/typography` (plugin inteiro para 6
  elementos, defaults brigam com o sistema visual).
- Sanitização inalterada: `rehype-sanitize` preset `defaultSchema`.
- Bônus: a página de fornecedor (`suppliers/[id]`) reusa o componente e herda o conserto.

### 3. Invariante WYSIWYG

O editor só produz o que o render estiliza. O que aparece no campo = o que aparece no
detalhe = o que a loja vai renderizar quando consumir a issue derivada.

## Fluxo de entrega

1. PR único neste repo, `Closes #364`, body registrando o descarte consciente da separação
   de campos.
2. Pós-merge: **criar issue no `othavi0/emach-ecommerce`** — renderizar `tool.description`
   como Markdown na PDP (mesmo subset + `remark-breaks` + sanitize), substituindo o
   tratamento de texto plano do PR #213 de lá.

## Verificação

- `bun verify` (check-types + check + test).
- Unit: round-trip do editor (markdown → doc → markdown) para o subset.
- Smoke visual (3 provas): cadastrar descrição com negrito/listas/quebras no wizard; conferir
  o render no detalhe contra o mockup aprovado; conferir dado real gravado (markdown limpo,
  sem HTML).

## Fora de escopo

- Campos `highlights`/`boxContents` e migração de specs para atributos (#364, partes 1–3).
- Editor em outros campos (fornecedores etc.) — só o render melhora lá.
- Render na loja (vira issue no repo do ecommerce).
