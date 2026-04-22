# Catálogo: Expansão de Ferramentas + Estoque

> **Status geral**: 🟡 em andamento (Fase 0 concluída, Fase 1 pendente)
> **Doc vivo**: marcar checkboxes conforme tarefas forem entregando. Cada fase termina com commit + atualização deste arquivo.
> **Última atualização**: 2026-04-22

## Contexto

Schema `tool` + `stock_level` foram expandidos para cobrir a planilha Master Part List (34 SKUs emach com códigos fiscais HS/NCM/CEST, variantes de voltagem, classificação Machine/Equipment) e para suportar operações de estoque com parâmetros de reposição (`minQty`, `reorderPoint`). Este plano implementa consumo desses campos em toda a UI do dashboard, importa a planilha no banco e adiciona alertas visuais de estoque baixo.

Fora de escopo: rotas públicas `/ferramentas/[slug]`. Site público consumirá o mesmo banco do dashboard quando for construído; queries vão filtrar `status = 'active' AND visibleOnSite = true`.

## Decisões travadas

1. **Doc tracking**: este arquivo (`docs/roadmap/catalog-expansion.md`), versionado.
2. **Escopo**: schema/import + admin UI (form/table/filters) + stock UI (min/reorder/alerta). Site público fora.
3. **Min imagens**: `status = 'active'` exige ≥3 imagens. `draft`/`discontinued`/`out_of_stock` aceitam 0.
4. **Commits**: granularidade por subtarefa (~6–8 commits), Conventional Commits em PT.
5. **Banco compartilhado**: sem APIs públicas separadas; queries do site reaproveitam schema atual.

---

## Fase 0 — Schema + migração (✅ concluída)

- [x] Expandir `packages/db/src/schema/tools.ts` (`model`, `invoiceModel`, `productType`, `status`, fiscais, físicos, técnicos, identificação)
- [x] Expandir `packages/db/src/schema/inventory.ts` (`minQty`, `reorderPoint` + check `reorder >= min`)
- [x] Gerar migrações (`0000_puzzling_zombie.sql` baseline + `0001_glossy_yellow_claw.sql` diff)
- [x] `bunx tsc --noEmit` passa em `packages/db`
- [x] Script importer `packages/db/src/scripts/import-master-part-list.ts` + dep `xlsx`
- [x] Dry-run do importer: 34 linhas, 0 skipped
- [x] Atualizar `.claude/CLAUDE.md` com contexto de schema

**Commit-alvo**: `feat(db): expande schema tool + stock_level com fiscais/físicos/técnicos/status + importer XLSX`

Arquivos modificados prontos p/ commit:
- `packages/db/src/schema/tools.ts`, `inventory.ts`
- `packages/db/src/migrations/0000_*.sql`, `0001_*.sql`, `meta/`
- `packages/db/src/scripts/import-master-part-list.ts`
- `packages/db/package.json` + `bun.lock` (dep `xlsx`)
- `.claude/CLAUDE.md`
- `docs/roadmap/catalog-expansion.md` (este arquivo)

---

## Fase 1 — Aplicar migração + import real (pendente)

**Objetivo**: banco de dev com 34 tools da planilha importadas em status `draft`.

- [ ] `bun db:push` contra banco de dev (Supabase) — aplica schema novo
- [ ] Rodar `bun run packages/db/src/scripts/import-master-part-list.ts "/home/othavio/Downloads/Master Part List with HS and NCM code (1).xlsx"`
- [ ] Validar no `bun db:studio`: 34 rows em `tool`, `productType` correto, `hsCode`/`ncm` preenchidos, SAMPLES com `sku = SAMPLES-<invoiceModel>`, todos `status = 'draft'`, `visibleOnSite = false`
- [ ] Spot-check SQL: `SELECT COUNT(*) FROM tool WHERE product_type = 'machine';` deve bater com planilha (~27)

**Commit-alvo**: `chore(db): importa Master Part List (34 SKUs) em status draft`

Nenhum arquivo no repo muda aqui — só estado do DB. Commit registra execução via mensagem.

---

## Fase 2 — Zod schema + form expandido (pendente)

**Objetivo**: admin consegue editar todos os novos campos via `/dashboard/tools/new` e `/dashboard/tools/[id]/edit`.

### 2.1 Zod schema (`tool-schema.ts`)

- [ ] Adicionar enums `PRODUCT_TYPE_OPTIONS`, `TOOL_STATUS_OPTIONS`
- [ ] Adicionar campos ao `toolFormSchema`:
  - `model`, `invoiceModel`, `barcode`, `manufacturerName`, `countryOfOrigin` (strings opcionais)
  - `productType` (enum opcional), `status` (enum obrigatório, default `draft`)
  - `hsCode`, `ncm`, `cest` (strings opcionais)
  - `weightKg`, `lengthCm`, `widthCm`, `heightCm` (number opcionais, nonnegative)
  - `powerWatts`, `frequencyHz`, `warrantyMonths` (int opcionais, nonnegative)
- [ ] Reformular regra de imagens: `superRefine` — se `status === 'active'`, exige `images.length >= 3`; senão permite 0

### 2.2 Form sections (`tool-form.tsx`)

Adicionar 4 seções novas na ordem:

- [ ] **Identificação extra**: `model`, `invoiceModel`, `barcode`, `manufacturerName`, `countryOfOrigin`
- [ ] **Classificação fiscal**: `productType` (select), `hsCode`, `ncm`, `cest`
- [ ] **Dimensões & peso**: `weightKg`, `lengthCm`, `widthCm`, `heightCm` (grid 4 col)
- [ ] **Especificações técnicas**: `powerWatts`, `frequencyHz`, `warrantyMonths`
- [ ] Seção "Classificação" atual: trocar switch `visibleOnSite` por **pair**: select `status` + switch `visibleOnSite`

Visual Companion será acionado aqui para comparar layouts (seções em accordion vs. abas vs. cards verticais).

### 2.3 Server actions (`tools/actions.ts`)

- [ ] `createTool` e `updateTool` aceitam/persistem campos novos (string vazia → null, number inválido → null)
- [ ] Preservar comportamento atual de imagens (insert+delete em `tool_image`)

### 2.4 Pages de detalhe

- [ ] `tools/[id]/page.tsx`: renderizar novos campos em seções
- [ ] `tools/[id]/edit/page.tsx`: mapear novos campos de `row` p/ `defaultValues`

**Commit-alvo** (pode quebrar em 2): `feat(tools): expande form com identificação/fiscal/físico/técnico + status enum`

---

## Fase 3 — Tabela + filtros (pendente)

**Objetivo**: lista `/dashboard/tools` reflete novos campos e permite filtrar.

### 3.1 Tabela (`tools-table.tsx`)

- [ ] Colunas novas: `Model` (curto), `Status` (badge colorido por valor)
- [ ] Badge `visibleOnSite` atual continua; `Status` adiciona semântica extra
- [ ] Responsivo: esconder colunas menos críticas em mobile

### 3.2 Filtros (`tool-filters.tsx`)

- [ ] Filtro `status` (multi-select)
- [ ] Filtro `productType` (multi-select)
- [ ] Filtro `ncm` (texto livre, prefix match)
- [ ] Query em `tools/page.tsx` aceita novos params

### 3.3 Page query (`tools/page.tsx`)

- [ ] Selecionar colunas novas no SQL
- [ ] Aplicar filtros adicionais (WHERE dinâmico)

Visual Companion será acionado para comparar placement dos filtros (sidebar vs topbar vs collapsible).

**Commit-alvo**: `feat(tools): tabela exibe model/status + filtros productType/status/ncm`

---

## Fase 4 — Stock UI: min/reorder + alerta (pendente)

**Objetivo**: operador define `minQty` e `reorderPoint` por filial; UI destaca stock baixo.

### 4.1 Zod + server actions (`stock/actions.ts`)

- [ ] Aceitar `minQty` e `reorderPoint` em update de stock level
- [ ] Validar `reorderPoint >= minQty` no server (check já existe no DB; aqui traduz erro)

### 4.2 UI de edição por filial (`stock/branches/[branchId]`)

- [ ] Form de stock por tool-branch ganha inputs `minQty`, `reorderPoint`
- [ ] Tabela mostra ambos + badge **"Repor"** quando `quantity <= reorderPoint`
- [ ] Badge **"Crítico"** quando `quantity <= minQty`

Visual Companion será acionado para definir cores/thresholds dos badges.

### 4.3 Dashboard resumo

- [ ] Card "Itens para repor" no `/dashboard` (contagem de `stockLevel` onde `quantity <= reorderPoint`)

**Commit-alvo**: `feat(stock): adiciona minQty/reorderPoint + badges de reposição`

---

## Fase 5 — Revisão final (pendente)

- [ ] `bunx tsc --noEmit` em `apps/web` e `packages/db` passa limpo
- [ ] `bun x ultracite check` passa (ou warnings justificados)
- [ ] `bun dev` sobe e smoke test manual: criar tool draft, preencher campos novos, transicionar p/ active (deve exigir 3 imgs), filtrar por status, editar stock com reorder/min, ver badge de reposição
- [ ] Atualizar este doc marcando tudo ✅
- [ ] Commit final `docs(roadmap): catalog-expansion concluído`

---

## Arquivos críticos

| Arquivo | Fase |
|---|---|
| `packages/db/src/schema/tools.ts` | 0 ✅ |
| `packages/db/src/schema/inventory.ts` | 0 ✅ |
| `packages/db/src/scripts/import-master-part-list.ts` | 0 ✅ / 1 |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-schema.ts` | 2 |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` | 2 |
| `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` | 2 |
| `apps/web/src/app/dashboard/(inventory)/tools/[id]/page.tsx` | 2 |
| `apps/web/src/app/dashboard/(inventory)/tools/[id]/edit/page.tsx` | 2 |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tools-table.tsx` | 3 |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-filters.tsx` | 3 |
| `apps/web/src/app/dashboard/(inventory)/tools/page.tsx` | 3 |
| `apps/web/src/app/dashboard/(inventory)/stock/actions.ts` | 4 |
| `apps/web/src/app/dashboard/(inventory)/stock/_components/*` | 4 |
| `apps/web/src/app/dashboard/(inventory)/stock/branches/**` | 4 |
| `apps/web/src/app/dashboard/page.tsx` | 4 |

## Verificação global

1. `bun --filter @emach/db db:generate` produz diff vazio após fase 2 (schema já final)
2. Migração aplicada: `SELECT column_name FROM information_schema.columns WHERE table_name='tool';` retorna 30 colunas
3. Smoke test manual completo por fase (ver checklist de cada seção)
4. Git log mostra commits na ordem das fases com mensagens Conventional Commits PT
