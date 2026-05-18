# Tornar Tool–Category obrigatória e remover catch-alls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover as duas categorias-raiz catch-all vazias (`sem-categoria` e `geral`) do seed e do banco, e confirmar que a obrigatoriedade de ≥1 Category real por Tool já está garantida.

**Architecture:** Trabalho puramente estrutural — issue #39 confirmou 0 attribute definitions e 0 tools sob os catch-alls, então não há migração de dados, apenas um `DELETE` de duas linhas. A validação Zod do form de Tool (`categoryIds.min(1)` + `primaryCategoryId`) e o `safeParse` nas server actions `createTool`/`updateTool` **já exigem** ≥1 categoria com uma primary — não é preciso recodificar, apenas verificar. Após remover os catch-alls do banco, eles deixam de aparecer no seletor de categorias (que carrega todas as categorias da DB), de modo que toda categoria selecionável passa a ser "real".

**Tech Stack:** Bun 1.3.11, Drizzle 0.45, Postgres (Supabase), TypeScript 6.0, Biome/Ultracite.

**Decisões fechadas (AskUserQuestion, 2026-05-17):**
- O SQL de remoção vai em `packages/db/manual-migrations/` (padrão já estabelecido para DML que `drizzle-kit generate` não gera — ver `2026-05-17-review-verified-purchase.sql`), aplicado manualmente antes de `bun db:migrate`. Não é uma migration versionada `0006_*`.
- O critério "validação Zod + server action" já está 100% satisfeito no código atual; o plano apenas o **verifica** via smoke test, sem adicionar código redundante.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `packages/db/manual-migrations/2026-05-17-remove-catchall-categories.sql` | Create | SQL de remoção das duas categorias-raiz catch-all, com pré/pós-validações documentadas. |
| `packages/db/scripts/seed-categories.ts` | Modify | Remover a linha `sem-categoria` do array `ROOTS` para o seed parar de recriar o catch-all. |
| `CLAUDE.md` | Modify | Remover a nota (linha ~166) que descreve o catch-all "Sem Categoria" como smell pendente. |
| `CONTEXT.md` | Modify | Atualizar o glossário de Category (linha ~54) e a ambiguidade resolvida (linha ~124) para refletir que os catch-alls foram removidos. |

Nenhum código de aplicação (`apps/web`) muda — o seletor de categorias e a validação já funcionam corretamente.

---

## Task 1: SQL de remoção das categorias catch-all

**Files:**
- Create: `packages/db/manual-migrations/2026-05-17-remove-catchall-categories.sql`

- [ ] **Step 1: Criar o arquivo SQL**

Conteúdo exato de `packages/db/manual-migrations/2026-05-17-remove-catchall-categories.sql`:

```sql
-- Issue #41 — Remoção das categorias-raiz catch-all `sem-categoria` e `geral`.
--
-- Decisão de domínio (CONTEXT.md, "Ambiguidades resolvidas"): toda Tool deve ter
-- >=1 Category real; não existe categoria-raiz catch-all. A investigação da issue
-- #39 confirmou 0 attribute definitions e 0 tools sob esses dois nós — nada a
-- realojar. `sem-categoria` vinha do seed (removido nesta mesma branch);
-- `geral` é resquício de uma migration antiga e nunca esteve no seed.
--
-- Aplicação: manual, antes de `bun db:migrate` (padrão manual-migrations/).
--
-- Pré-condições — rodar antes de aplicar; TODAS devem retornar 0:
--   SELECT count(*) FROM category WHERE parent_id IN
--     (SELECT id FROM category WHERE slug IN ('sem-categoria', 'geral'));
--   SELECT count(*) FROM tool_category WHERE category_id IN
--     (SELECT id FROM category WHERE slug IN ('sem-categoria', 'geral'));
--   SELECT count(*) FROM attribute_definition WHERE category_id IN
--     (SELECT id FROM category WHERE slug IN ('sem-categoria', 'geral'));
--
-- Nota de segurança: `tool_category.category_id` e `attribute_definition.category_id`
-- têm FK `onDelete: "restrict"` — se algo ainda referenciar os catch-alls, este
-- DELETE falha de forma explícita em vez de apagar dados em silêncio.

DELETE FROM "category" WHERE "slug" IN ('sem-categoria', 'geral');

-- Validação pós-execução — deve retornar 0:
--   SELECT count(*) FROM category WHERE slug IN ('sem-categoria', 'geral');
```

- [ ] **Step 2: Aplicar o SQL no banco de dev**

O usuário deve rodar manualmente (ambiente sem TTY/psql interativo do agente). Sugerir ao usuário digitar no prompt:

```
! psql "$DATABASE_URL" -f packages/db/manual-migrations/2026-05-17-remove-catchall-categories.sql
```

Expected: `DELETE 2` (ou `DELETE 1` se `geral` não existir neste banco específico — aceitável; o objetivo é o estado final sem os catch-alls).

- [ ] **Step 3: Verificar o estado do banco**

O usuário roda:

```
! psql "$DATABASE_URL" -c "SELECT slug FROM category WHERE slug IN ('sem-categoria','geral');"
```

Expected: `(0 rows)`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/manual-migrations/2026-05-17-remove-catchall-categories.sql
git commit -m "feat: remover categorias-raiz catch-all do banco"
```

---

## Task 2: Remover `sem-categoria` do seed de categorias

**Files:**
- Modify: `packages/db/scripts/seed-categories.ts:5-11`

- [ ] **Step 1: Editar o array `ROOTS`**

Remover a linha do catch-all. O array `ROOTS` deve ficar exatamente assim:

```typescript
const ROOTS = [
	{ slug: "ferramentas-eletricas", name: "Ferramentas Elétricas" },
	{ slug: "ferramentas-manuais", name: "Ferramentas Manuais" },
	{ slug: "acessorios", name: "Acessórios" },
	{ slug: "pecas", name: "Peças" },
];
```

(Removida a linha `{ slug: "sem-categoria", name: "Sem Categoria" },`.)

- [ ] **Step 2: Verificar que o seed roda sem recriar o catch-all**

O usuário roda:

```
! bun --cwd packages/db db:seed-categories
```

Expected: log `[seed-categories] OK ferramentas-eletricas, ferramentas-manuais, acessorios, pecas` — sem `sem-categoria` na lista. O `onConflictDoNothing` garante idempotência das 4 raízes restantes.

- [ ] **Step 3: Commit**

```bash
git add packages/db/scripts/seed-categories.ts
git commit -m "chore: remover sem-categoria do seed de categorias"
```

---

## Task 3: Atualizar documentação (CLAUDE.md + CONTEXT.md)

**Files:**
- Modify: `CLAUDE.md` (seção "Especificações técnicas dinâmicas — herança", primeiro bullet ~linha 166)
- Modify: `CONTEXT.md` (glossário "Category" ~linha 54; "Ambiguidades" ~linha 124)

- [ ] **Step 1: Atualizar `CLAUDE.md`**

Trocar o bullet atual:

```markdown
- `attribute_definition.categoryId` é **NOT NULL** — não há atributo global. A categoria-raiz catch-all "Sem Categoria" (slug `sem-categoria`) recebeu os anteriormente globais durante a migration. Nota: essa raiz é um smell — ver ADR/CONTEXT.md, a associação Tool–Category deve virar obrigatória.
```

por:

```markdown
- `attribute_definition.categoryId` é **NOT NULL** — não há atributo global; toda `attribute_definition` pertence a uma categoria real. Toda Tool tem ≥1 Category real (uma primary) — não existe categoria-raiz catch-all (issue #41).
```

- [ ] **Step 2: Atualizar `CONTEXT.md` — glossário de Category (~linha 54)**

Trocar o trecho final do bullet **Category**:

```
Regra de domínio: **toda Tool deve ter ≥1 Category real** — ver Ambiguidades sobre o fallback "Sem Categoria".
```

por:

```
Regra de domínio: **toda Tool deve ter ≥1 Category real** (uma primary), garantida na validação Zod do form de Tool.
```

- [ ] **Step 3: Atualizar `CONTEXT.md` — ambiguidade resolvida (~linha 124)**

Trocar o bullet **Catch-all de categoria**:

```
- **Catch-all de categoria** — existem duas categorias-raiz catch-all vazias: `sem-categoria` (no seed) e `geral` (resquício de migration, fora do seed). Investigação na issue #39: **0 attribute definitions e 0 tools** sob elas — nada a realojar, todas as tools já têm Category real. Resolvido: toda Tool deve ter uma Category real e os dois catch-alls são removidos (issue #41); não há migração de dados.
```

por:

```
- **Catch-all de categoria** — historicamente existiam duas categorias-raiz catch-all vazias (`sem-categoria` no seed, `geral` resquício de migration). Issue #39 confirmou **0 attribute definitions e 0 tools** sob elas. Issue #41 removeu ambas do seed e do banco: toda Tool tem uma Category real, sem fallback.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md CONTEXT.md
git commit -m "docs: remover nota dos catch-alls de categoria"
```

---

## Task 4: Verificação final

**Files:** nenhum — só validação.

- [ ] **Step 1: `check-types` no monorepo**

Run: `bun check-types`
Expected: PASS, sem erros de tipo. Nenhum código de aplicação mudou, então o esperado é verde.

- [ ] **Step 2: `check` (lint + format dry-run)**

Run: `bun check`
Expected: PASS. Caso o seed acuse formatação, rodar `bun fix` e re-commitar (`chore: aplicar formatação`).

- [ ] **Step 3: Smoke test — validação ≥1 Category já vigente**

O critério "Criação e edição de Tool exigem ≥1 Category real" já é garantido por `apps/web/src/app/dashboard/tools/_components/tool-schema.ts:85-88` (`categoryIds.min(1)` + `primaryCategoryId.min(1)`) e pelo `safeParse` em `createTool`/`updateTool` (`apps/web/src/app/dashboard/tools/actions.ts`). Confirmar em runtime:

```
! bun dev:web
```

Abrir `http://localhost:3001/dashboard/tools/new`, preencher o form **sem selecionar nenhuma categoria** e tentar salvar.
Expected: o painel de erros vermelho no topo lista `Categorias: Selecione ao menos uma categoria` — o form não submete. Confirmar também que `sem-categoria` e `geral` **não aparecem** na lista de checkboxes de categorias.

- [ ] **Step 4: Atualizar a issue #41 (opcional, ao abrir o PR)**

Ao criar o PR, marcar no corpo os acceptance criteria atendidos e linkar `Closes #41`.

---

## Self-Review

**Spec coverage (acceptance criteria da issue #41):**
- ✅ "Criação e edição de Tool exigem ≥1 Category real" — Task 4 Step 3 (já satisfeito; verificado, não recodificado, por decisão do usuário).
- ✅ "Categoria-raiz `sem-categoria` removida do `seed-categories.ts` e do banco" — Task 2 (seed) + Task 1 (banco).
- ✅ "Categoria-raiz `geral` removida do banco" — Task 1.
- ✅ "`CLAUDE.md` atualizado — nota do catch-all sai" — Task 3 Step 1.
- ✅ "`bun check-types` e `bun check` passam" — Task 4 Steps 1-2.
- ➕ Extra: `CONTEXT.md` atualizado (Task 3 Steps 2-3) — não está nos critérios, mas necessário para o glossário de domínio não ficar com referência morta ao fallback.

**Placeholders:** nenhum — todo SQL, edição de docs e comando estão explícitos.

**Consistência:** slugs `sem-categoria`/`geral` usados de forma idêntica em todas as tasks; nome do arquivo de migration consistente entre Task 1 Steps 1-2 e o commit.
