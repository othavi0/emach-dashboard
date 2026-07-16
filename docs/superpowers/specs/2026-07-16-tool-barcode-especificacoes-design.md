# Código de barras no perfil da ferramenta + Especificações em ficha técnica

Data: 2026-07-16 · Status: aprovado no brainstorming (mockups em `.superpowers/brainstorm/90008-1784205811/content/`)

## Problema

1. O código de barras (`tool_variant.barcode`, notNull, unique, 1 por variante) não é reconhecível em lugar nenhum do perfil da ferramenta. Ele existe na aba Variantes & preços, mas o dado mocado é `barcode = sku` em 17/17 variantes — a coluna parece um SKU duplicado. Na Visão geral não aparece de forma alguma. Na separação, o chip do item exibe o mesmo texto do SKU pela mesma razão.
2. A seção Especificações da Visão geral é um grid solto de 3 colunas com "—" espalhado e espaço morto — leitura em zigue-zague, sem hierarquia de valor.

## Decisões (brainstorming com mockups)

- **Barcode — opção A:** card "Códigos de barras" na sidebar da Visão geral + popover com barcode grande na aba Variantes.
- **Uso:** consulta + etiqueta escaneável → renderizar EAN-13 em SVG, não só texto.
- **Especificações — opção A (com ajuste de largura):** ficha técnica com leader pontilhado, em 2 colunas de linhas em telas largas.

## Escopo

### 1. Dados: EAN-13 realistas (banco + seed)

Prefixo GS1 Brasil mock `7891234` + item ref sequencial + dígito verificador. Mapeamento fixo (17 variantes, ordenadas por `tool.created_at, sort_order`):

| SKU | EAN-13 |
|---|---|
| `PE-82600-127` | `7891234501011` |
| `GSS280AVE-127` | `7891234501028` |
| `CSA100B-127` | `7891234501035` |
| `MC-27H-UN` | `7891234501042` |
| `AU-8-BC-UN` | `7891234501059` |
| `DC-115-INOX-10-UN` | `7891234501066` |
| `DHP453Z-127` | `7891234501073` |
| `DDF458Z-18V` | `7891234501080` |
| `GKS185S-127` | `7891234501097` |
| `ST8000E-127` | `7891234501103` |
| `GWS720-115-BIV` | `7891234501110` |
| `DHP453Z-220` | `7891234501127` |
| `ST8000E-220` | `7891234501134` |
| `GSS280AVE-220` | `7891234501141` |
| `GKS185S-220` | `7891234501158` |
| `CSA100B-220` | `7891234501165` |
| `GKS185S-BIV` | `7891234501172` |

- **Banco:** UPDATE pontual por SKU (17 linhas, autorizado — dado seed descartável; sem truncate/reset).
- **Seed:** `packages/db/scripts/seed/catalog.ts` troca os `barcode:` hardcoded pelos EANs da tabela acima.
- **Verify:** `packages/db/scripts/seed/verify.ts` ganha check `barcode !~ '^[0-9]{13}$'` → falha (mantém os checks de nulo/duplicado existentes).
- **Separação:** o matching de scan é **exclusivamente** por `barcode` (`picking-logic.ts:18`) — passa a aceitar os EANs sem mudança de código. **Mudança de comportamento intencional:** hoje digitar o SKU no campo de bipe funciona por acidente (barcode = sku); após o UPDATE, só o EAN coincide. É o comportamento correto (o campo lê o código de barras físico), mas quem testava digitando SKU vai precisar do EAN.
- **Mesma mudança vale para as outras superfícies de scan/busca por barcode** (achado do review final): o scan da página de Estoque (`branch-stock-infinite.tsx` / `lookupVariantByBarcodeAction`) e a busca da listagem de Ferramentas casam pelo `tool_variant.barcode` — pós-UPDATE, aceitam o EAN (verificado no smoke) e não mais o SKU como "barcode". Sessões de picking **iniciadas antes** do UPDATE continuam casando pelo snapshot antigo (`variant_snapshot` jsonb) — by design.

### 2. Encoder + componente `BarcodeEan13`

- `apps/web/src/lib/ean13.ts` — funções puras, sem dependência externa:
  - `isValidEan13(code: string): boolean` — `^\d{13}$` + dígito verificador.
  - `ean13Modules(code: string): string` — os 95 módulos (guards + L/G/R pela paridade do 1º dígito). Pré-condição: código já validado; com entrada inválida lança `Error` (consumidores sempre gateiam com `isValidEan13` antes).
  - Testes unit: dígito verificador (casos válidos/ inválidos), módulos de um código conhecido, paridade.
- `apps/web/src/components/barcode-ean13.tsx` — componente (server-safe, sem estado) que renderiza `<svg>` com `<rect>` por módulo, `aria-label` com o código. Props: `code`, `height?`, `className?`.
- **Degradação graciosa:** se `!isValidEan13(barcode)`, os consumidores renderizam só o número em `font-mono` (sem barras, sem erro). O schema/form NÃO ganham validação de formato — `barcode` continua `text` livre (produtos reais podem usar DUN-14/CODE128; exibição degrada, cadastro não bloqueia).

### 3. Card "Códigos de barras" na Visão geral

- Novo `SectionCard title="Códigos de barras"` na coluna lateral de `overview-tab.tsx`, entre **Estoque** e **Carrinho (ecommerce)**.
- `OverviewTab` recebe prop nova `variants` (o `detail` de `tool-detail-data.ts` já carrega barcode por variante; `page.tsx` passa adiante). Ordem: a mesma da aba Variantes (`orderedVariantIds`/sortOrder).
- Cada variante = linha com: chips (voltagem quando houver + SKU, em mono), barras `BarcodeEan13`, número EAN em mono + botão copiar. Separador hairline entre linhas.
- **Copiar:** extrair o `CopyCodeButton` de `promotions/_components/copy-code-button.tsx` para `apps/web/src/components/copy-button.tsx` (props: `value`, `ariaLabel?`); promotions passa a importar do novo caminho (sem re-export shim).
- Edge: variante sem voltagem → só chip de SKU. Barcode não-EAN13 → número mono sem barras.

### 4. Popover na aba Variantes

- **Read-only row:** o texto do barcode vira trigger clicável (estilo link discreto) → popover com `BarcodeEan13` grande (~240px), número mono e copiar.
- **Editable row:** botão ícone (barcode/scan, `lucide`) ao lado do input → mesmo popover (renderiza o valor salvo atual).
- Popover do `@emach/ui` (base-ui) já usado no design system. Fecha em Esc/clique fora.

### 5. Especificações — ficha técnica com leader pontilhado

Reescrever a renderização de `tool-specs.tsx` (a lógica de grouping/divergência não muda):

- Cada spec = linha `label ····· valor`: label `text-muted-foreground text-xs` à esquerda, leader `border-b border-dotted` flexível, valor `font-medium text-sm` à direita.
- **Largura:** container das linhas em `grid gap-x-8 md:grid-cols-2` (2 colunas de linhas em ≥md, 1 em mobile) — o pontilhado nunca atravessa a largura toda do card.
- **Vazios:** campos `null` saem do corpo; rodapé do card ganha nota `N campos sem valor: <labels>` (hairline `border-t`, `text-muted-foreground text-xs`). Grupo com 0 preenchidos some do corpo (os campos dele entram na nota). Todas as specs vazias → só a nota (estado mínimo).
- **Header de grupo:** mantém o h3 uppercase atual + contagem `N de M` (`text-muted-foreground`, menor).
- **Mono:** valores de Modelo, Modelo NF, HS Code, NCM, CEST em `font-mono text-xs`.
- **Mantidos:** `HelpTooltip` nos labels (Modelo, Modelo NF, HS/NCM/CEST), `DivergenceMark` (⚠ warning) em Potência/Peso/atributos divergentes, agrupamento `Técnicas · <categoria>`.

## Fora de escopo

- Impressão de etiquetas em lote (o popover já serve de etiqueta unitária; lote é feature futura).
- Validação de formato EAN-13 no form de variante.
- Mudanças no fluxo/UI da separação.
- Exibir barcode no header do perfil (rejeitado: esconde variantes não-padrão).

## Testes & verificação

- Unit: `ean13.ts` (check digit, módulos, inválidos); helper puro de partição preenchido/vazio das specs se extraído.
- `bun verify` (check-types + check + test) e smoke visual com dado real:
  1. `/dashboard/tools/c34d8e82-…` Visão geral — card com 2 EANs escaneáveis + ficha técnica nova (screenshot lado a lado com o padrão irmão).
  2. Aba Variantes — popover abre com barcode grande nos dois modos (read-only e editável).
  3. `/dashboard/separacao/…` — chip do item mostra EAN e o scan por EAN conta unidade.
  4. Banco: 17 barcodes `^\d{13}$`, únicos (query do verify).
