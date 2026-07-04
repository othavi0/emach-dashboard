# Ativação de tool transicional + correção do seed (#290)

> Design doc. Data: 2026-07-03. Origem: issue #290 (`fix(seed): Compressor active não passa em MIN_SPECS_ACTIVE`).

## Problema

Editar qualquer tool `status='active'` do seed e salvar falha na validação (`Ativar exige ao menos 4 especificações preenchidas`), bloqueando **toda** edição — inclusive campos não relacionados a specs. O issue reportou só o "Compressor de Ar 100L 2HP", mas a verificação contra o banco real (`wrxohbzepoyscsacjzvd`) mostrou um problema **sistêmico e mais profundo** que o descrito.

### Verificação das suposições do issue

- **"Qualquer edição é bloqueada"** — ✅ verdadeiro. `updateTool` roda `toolFormSchema.safeParse` em todo submit; o `superRefine` exige specs≥4 sempre que `status==='active'`. Com 2 specs, editar só o nome falha.
- **As "duas mensagens" são um bloqueio só** — ⚠️ origens diferentes. `Ativar exige ≥4 especificações` é o bloqueio real (superRefine). `A categoria principal está incompleta` é um **aviso inline** `text-warning` (`identity-fields.tsx:194`) que aparece porque a categoria tem <4 atributos efetivos; carrega `data-error="true"`, então o `focusFirstError` rola até ele. No server, `primaryCategoryIncompleteError` só barra se a categoria **mudar** (`actions.ts:187`).
- **Causa "seed criou active antes da regra"** — ⚠️ parcial. Mais fundo: a categoria "Compressores de Ar" tem só **2 atributos efetivos** (pai "Equipamentos" = 0). Como `MIN_SPECS_ACTIVE` espelha `MIN_CATEGORY_ATTRIBUTES=4`, é **impossível** ter 4 specs naturais ali. O seed insere via `INSERT` direto — **bypassa** o `toolFormSchema` inteiro.
- **Escopo (só o Compressor)** — ❌ refutado. **10 de 10** tools `active` falham na régua de ativação.
- **Caminho "atualizar seed p/ ≥4 specs"** — ⚠️ insuficiente isolado: 5 tools estão em categorias com <4 atributos (sem 4 specs naturais) e 5 tools têm <3 imagens. NCM está OK em todos.

### Estado real (banco de dev)

| Tool | specs | imgs | cat. efetivos | falha em |
|---|---|---|---|---|
| Furadeira Impacto 650W | 4 | 2 | 5 | imagens |
| Serra Circular 7¼" | 3 | 3 | 5 | specs |
| Esmerilhadeira 720W | 2 | 3 | 4 | specs |
| Serra Tico-Tico 500W | 1 | 2 | 5 | specs + imagens |
| Parafusadeira 18V | 2 | 2 | 5 | specs + imagens |
| Lixadeira Orbital | 2 | 2 | 3 | specs + imagens + categoria |
| **Compressor 100L 2HP** | 2 | 3 | 2 | specs + categoria |
| Alicate Universal 8" | 2 | 3 | 2 | specs + categoria |
| Martelo Carpinteiro | 2 | 3 | 2 | specs + categoria |
| Disco de Corte Inox | 1 | 2 | 2 | specs + imagens + categoria |

Categorias com <4 atributos efetivos que são primary de algum tool: Discos (2), Compressores (2), Alicates (2), Martelos (2), Lixadeiras (3), Plainas (3). O `verify.ts` do seed valida 11 invariantes mas **não** "active cumpre a régua de ativação" — a lacuna que deixou tudo passar.

## Decisões (aprovadas)

1. **Regra transicional + correção de dados** (não só um dos dois).
2. **Semântica:** o gate de requisitos dispara **só na transição `draft/discontinued → active`**. Depois de active, editar nunca re-bloqueia por requisito (nem se reduzir specs — aceito como raro e visível). Criar já-active também é transição de entrada → valida.
3. **Categorias pobres:** enriquecer com **atributos reais** (dados de seed), não baixar limiares nem rebaixar tools.

## Design

### Frente A — Regra de ativação transicional

O `toolFormSchema.superRefine` mistura dois tipos de regra; separá-los:

- **Invariantes estruturais** (sempre, qualquer status) — **ficam no schema base incondicional**: vídeo+poster juntos; `primaryCategoryId ∈ categoryIds`; exatamente 1 variante `isDefault`; SKU/barcode únicos entre variantes; `attributeValues ⊆ attributeAssignments`.
- **Requisitos de ativação** (`status='active'`): `images.length ≥ MIN_IMAGES_ACTIVE`, `ncm` preenchido, `countFilledSpecs ≥ MIN_SPECS_ACTIVE`. **Saem do superRefine** para uma função pura exportada:

```ts
// tool-schema.ts
export interface ActivationIssue { path: (keyof ToolFormValues)[]; message: string; }
export function activationRequirementIssues(data: ToolFormValues): ActivationIssue[];
```

Aplicação com contexto (o schema puro não conhece o status anterior):

| Caller | Enforça requisitos quando |
|---|---|
| `parseToolForm(values, { enforceActivation })` (client) | create: `values.status==='active'`; edit: `initialStatus!=='active' && values.status==='active'` |
| `createTool` (server) | `data.status==='active'` |
| `updateTool` (server) | `previousStatus!=='active' && data.status==='active'` |

- `parseToolForm` ganha 2º arg `{ enforceActivation }`; quando `true`, roda `activationRequirementIssues` e mescla no `fieldErrors` (mesma forma de `zodIssuesToFieldErrors`).
- `useToolSubmit` recebe `initialStatus` (vem de `defaultValues?.status ?? "draft"` no edit view / wizard) e computa `enforceActivation` por modo.
- `createTool`: após `safeParse`, `if (data.status==='active')` aplica requisitos.
- `updateTool`: já busca o tool; adicionar leitura de `previousStatus` (`SELECT status FROM tool WHERE id`) e `if (previousStatus!=='active' && data.status==='active')` aplica requisitos. O gate de `primaryCategoryIncompleteError` (só na troca de categoria) permanece como está.

### Frente B — Dados do seed + fechar a lacuna

1. **Enriquecer 6 categorias** no array `ATTRIBUTES` (`packages/db/scripts/seed/catalog.ts`) até ≥4 atributos efetivos, com atributos semanticamente reais:
   - Compressores (+2 próprios: ex. vazão pcm, potência HP)
   - Discos (+ próprios: diâmetro, espessura, furo, material abrasivo)
   - Alicates (+ próprios: abertura mm, tipo de corte)
   - Martelos (+ próprios: peso da cabeça, tipo de cabeça)
   - Lixadeiras (+1 próprio: ex. tipo de lixa / tamanho da base)
   - Plainas (+1 próprio: ex. largura de corte)

   A escolha final de slugs/labels/inputType/unit fica no plano; a invariante é ≥4 efetivos por categoria que recebe tool, mantendo semântica real. Dados de seed — **não** tocam schema TS nem disparam o sync CI do ecommerce.
2. **Specs dos 10 tools** (blocos `attributeValues` em `catalog.ts`) → ≥4 preenchidas, usando os atributos enriquecidos da própria categoria.
3. **Imagens:** `imageCount` dos 5 tools com <3 → ≥3.
4. **Novos checks em `verify.ts`** (cada um >0 → seed falha alto), separados para não falsear:
   - **"tool active fora da régua de ativação"** — tools `active` com specs preenchidas <4 (SQL espelhando `countFilledSpecs`: `value_text` não-vazio ∨ `value_numeric`/`value_numeric_max` not null ∨ `value_bool` not null) **OU** imagens <3 **OU** `ncm` nulo/vazio. Espelha exatamente a régua de ativação do app.
   - **"categoria primary incompleta com tool"** — categorias que são primary de algum tool e têm <4 atributos efetivos. Ortogonal à régua (é o invariante de `MIN_CATEGORY_ATTRIBUTES`); mantém a taxonomia do seed coerente. Não usar OR com o check acima — um active pode legitimamente atingir 4 specs via atributos extras de outra categoria.
5. Aplicar em dev: `bun db:seed-demo` (reconstrói; sem migration).

### Frente C — Polish do aviso (bug secundário)

Avisos informativos (`primaryIncomplete` e, se adicionado, contador soft de specs/imagens em active) não devem carregar `data-error="true"` — senão o `focusFirstError` (que roda em qualquer submit falho) ancora neles em vez do campo com erro real. Remover a âncora dos avisos puramente informativos; `data-error` fica só em `<FieldError>` de erros de submit reais.

## Arquivos afetados

- `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` — extrair `activationRequirementIssues`; enxugar `superRefine`.
- `apps/web/src/app/dashboard/tools/_components/tool-submit.ts` — `parseToolForm(values, { enforceActivation })`.
- `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts` — receber `initialStatus`, computar `enforceActivation`.
- `apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx` + `tool-wizard.tsx` — passar `initialStatus`.
- `apps/web/src/app/dashboard/tools/actions.ts` — `createTool`/`updateTool` aplicam requisitos condicionalmente; `updateTool` lê `previousStatus`.
- `apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx` (+ `spec-fields.tsx` se aplicável) — polish do aviso soft.
- `packages/db/scripts/seed/catalog.ts` — atributos + specs + imageCount.
- `packages/db/scripts/seed/verify.ts` — novo check de ativação.
- `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts` — cobrir a semântica transicional.

## Testes e verificação

- `tool-schema.test.ts`: `activationRequirementIssues` isolado (specs/imagens/ncm faltando → issue; completo → vazio); `parseToolForm` com `enforceActivation:false` **não** bloqueia active <4; com `true` bloqueia. Invariantes estruturais continuam sempre validados.
- Casos de transição: create active <4 → falha; edit `draft→active` <4 → falha; edit já-active <4 (sem mexer em specs) → **passa**.
- `verify.ts`: rodar `bun db:seed-demo` deve passar no novo check (0 tools active fora da régua).
- Gate: `bun verify` (check-types + check + test). Smoke no browser: editar o Compressor active (mudar só o nome) → salva; tentar ativar um draft com <4 specs → barra.

## Fora de escopo

- Trava anti-regressão (bloquear reduzir specs num tool já-active) — descartada nesta iteração (semântica escolhida: gate só na entrada).
- Enforcement no banco (CHECK/trigger de "active cumpre régua") — o `verify.ts` cobre o seed; enforcement DB é decisão à parte (ADR-0006 push-only complica).
- Baixar `MIN_SPECS_ACTIVE`/`MIN_CATEGORY_ATTRIBUTES` — rejeitado (enfraquece régua deliberada de 2026-06-13).
