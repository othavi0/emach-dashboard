# Sincronização automática do schema dashboard → ecommerce — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar a cópia do schema Drizzle do repo dashboard para o repo ecommerce via GitHub Action que abre Pull Request, eliminando o sync manual.

**Architecture:** Um workflow no repo `emach-dashboard` (fonte de verdade), disparado em push na `main` que toca `packages/db/src/**`, espelha `schema/` + `queries/` + `sql/triggers.sql` para o repo `emach-ecommerce` e abre/atualiza um PR via `peter-evans/create-pull-request`. O repo ecommerce ganha um CI mínimo de `check-types` para validar esse PR. Direção unidirecional dashboard → ecommerce.

**Tech Stack:** GitHub Actions, `actions/checkout@v4`, `peter-evans/create-pull-request@v7`, `oven-sh/setup-bun@v2`, Bun 1.3.11, Turborepo, fine-grained PAT.

**Repos envolvidos:**
- Dashboard: `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard` — GitHub `othavioquiliao/emach-dashboard` (privado)
- Ecommerce: `/home/othavio/Projects/emach/emach-ecommerce` — GitHub `othavioquiliao/emach-ecommerce` (privado)

**Spec:** `docs/superpowers/specs/2026-05-18-sync-schema-ecommerce-design.md` · **ADR:** `docs/adr/0007-sync-schema-via-ci.md`

---

### Task 1: Reconciliar o path dos triggers no repo ecommerce

**Repo:** ecommerce

**Files:**
- Move: `packages/db/src/migrations/_triggers.sql` → `packages/db/src/sql/triggers.sql`
- Modify: `packages/db/scripts/apply-triggers.ts`
- Delete: `packages/db/src/migrations/` (pasta morta — ADR-0006)

- [ ] **Step 1: Mover o arquivo de triggers**

```bash
cd /home/othavio/Projects/emach/emach-ecommerce
mkdir -p packages/db/src/sql
git mv packages/db/src/migrations/_triggers.sql packages/db/src/sql/triggers.sql
rmdir packages/db/src/migrations 2>/dev/null || true
```

- [ ] **Step 2: Corrigir o path em `apply-triggers.ts`**

Em `/home/othavio/Projects/emach/emach-ecommerce/packages/db/scripts/apply-triggers.ts`, trocar:

```ts
	const sqlPath = resolve(scriptDir, "../src/migrations/_triggers.sql");
```

por:

```ts
	const sqlPath = resolve(scriptDir, "../src/sql/triggers.sql");
```

- [ ] **Step 3: Verificar que os triggers ainda aplicam**

Pré-requisito: env do ecommerce com `DATABASE_URL` populado.

Run: `cd /home/othavio/Projects/emach/emach-ecommerce && bun --cwd packages/db db:apply-triggers`
Expected: `[apply-triggers] OK`

- [ ] **Step 4: Commit (repo ecommerce)**

```bash
cd /home/othavio/Projects/emach/emach-ecommerce
git add packages/db
git commit -m "refactor: move triggers de migrations para sql"
```

---

### Task 2: CI mínimo de check-types no repo ecommerce

**Repo:** ecommerce

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar o workflow de CI**

Criar `/home/othavio/Projects/emach/emach-ecommerce/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.11
      - run: bun install --frozen-lockfile
      - run: bun check-types
```

- [ ] **Step 2: Validar a sintaxe YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('/home/othavio/Projects/emach/emach-ecommerce/.github/workflows/ci.yml'))" && echo "YAML OK"`
Expected: `YAML OK`

- [ ] **Step 3: Commit (repo ecommerce)**

```bash
cd /home/othavio/Projects/emach/emach-ecommerce
git add .github/workflows/ci.yml
git commit -m "ci: adiciona check-types em pull request"
```

Nota: este workflow precisa estar na `main` do ecommerce para rodar nos PRs. Mergear o branch deste trabalho na `main` do ecommerce antes do primeiro PR de sync (Task 5).

---

### Task 3: Workflow de sync no repo dashboard

**Repo:** dashboard

**Files:**
- Create: `.github/workflows/sync-db-schema.yml`

- [ ] **Step 1: Criar o workflow**

Criar `.github/workflows/sync-db-schema.yml` (repo dashboard):

```yaml
name: Sync DB schema to ecommerce

on:
  push:
    branches: [main]
    paths:
      - "packages/db/src/schema/**"
      - "packages/db/src/queries/**"
      - "packages/db/src/sql/triggers.sql"
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout dashboard
        uses: actions/checkout@v4
        with:
          path: dashboard

      - name: Checkout ecommerce
        uses: actions/checkout@v4
        with:
          repository: othavioquiliao/emach-ecommerce
          token: ${{ secrets.ECOMMERCE_SYNC_TOKEN }}
          path: ecommerce

      - name: Mirror schema, queries e triggers
        run: |
          set -euo pipefail
          src="dashboard/packages/db/src"
          dst="ecommerce/packages/db/src"
          mkdir -p "$dst/sql"
          rsync -a --delete "$src/schema/" "$dst/schema/"
          rsync -a --delete "$src/queries/" "$dst/queries/"
          cp "$src/sql/triggers.sql" "$dst/sql/triggers.sql"

      - name: Create or update pull request
        uses: peter-evans/create-pull-request@v7
        with:
          token: ${{ secrets.ECOMMERCE_SYNC_TOKEN }}
          path: ecommerce
          branch: chore/sync-db-schema
          base: main
          commit-message: "chore: sincroniza schema da DB com o dashboard"
          title: "chore: sincroniza schema da DB com o dashboard"
          body: |
            PR automático do workflow `sync-db-schema` (repo dashboard).

            Espelha `packages/db/src/{schema,queries,sql/triggers.sql}` do dashboard,
            que é a fonte de verdade do schema (ADR-0007). Não editar estes arquivos
            diretamente neste repo — mudanças nascem no dashboard.

            Commit de origem: ${{ github.sha }}
```

- [ ] **Step 2: Validar a sintaxe YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/sync-db-schema.yml'))" && echo "YAML OK"`
Expected: `YAML OK`

- [ ] **Step 3: Commit (repo dashboard)**

```bash
git add .github/workflows/sync-db-schema.yml \
        docs/adr/0007-sync-schema-via-ci.md \
        docs/superpowers/specs/2026-05-18-sync-schema-ecommerce-design.md \
        docs/superpowers/plans/2026-05-18-sync-schema-ecommerce.md
git commit -m "ci: adiciona sync de schema para o ecommerce"
```

---

### Task 4: [MANUAL — só o usuário pode fazer] Criar o PAT e o secret

Esta tarefa **não pode ser feita por um agente** — exige a interface web do GitHub e a posse do token. O orquestrador deve pausar aqui e pedir para o usuário executar.

- [ ] **Step 1: Criar um fine-grained PAT**

Em <https://github.com/settings/personal-access-tokens> → **Generate new token**:
- **Token name:** `emach sync-db-schema`
- **Resource owner:** `othavioquiliao`
- **Expiration:** à escolha (ex.: 90 dias)
- **Repository access:** *Only select repositories* → marcar **`emach-ecommerce`**
- **Permissions → Repository permissions:**
  - `Contents`: **Read and write**
  - `Pull requests`: **Read and write**
- Gerar e **copiar o token** (só aparece uma vez).

- [ ] **Step 2: Guardar o token como secret no repo dashboard**

Rodar você mesmo, trocando `<TOKEN>` pelo valor copiado:

```
! gh secret set ECOMMERCE_SYNC_TOKEN --repo othavioquiliao/emach-dashboard --body "<TOKEN>"
```

Alternativa via web: repo `emach-dashboard` → Settings → Secrets and variables → Actions → New repository secret → nome `ECOMMERCE_SYNC_TOKEN`.

- [ ] **Step 3: Confirmar**

Run: `! gh secret list --repo othavioquiliao/emach-dashboard`
Expected: `ECOMMERCE_SYNC_TOKEN` aparece na lista.

---

### Task 5: Disparar e validar o primeiro sync

**Repo:** dashboard (+ revisão no ecommerce)

Pré-requisitos: Tasks 1–4 concluídas, e os commits do dashboard (Task 3) **mergeados na `main`** do dashboard — Actions só rodam a partir do branch default. O CI do ecommerce (Task 2) também já deve estar na `main` do ecommerce.

- [ ] **Step 1: Disparar o workflow manualmente**

Run: `! gh workflow run sync-db-schema.yml --repo othavioquiliao/emach-dashboard`

- [ ] **Step 2: Acompanhar a execução**

Run: `! gh run watch --repo othavioquiliao/emach-dashboard`
Expected: run com conclusão `success`.

- [ ] **Step 3: Conferir o PR criado no ecommerce**

Run: `! gh pr list --repo othavioquiliao/emach-ecommerce --head chore/sync-db-schema`
Expected: um PR aberto na branch `chore/sync-db-schema`.

- [ ] **Step 4: Revisar o diff do primeiro PR**

O primeiro sync é grande (catch-up: 8 arquivos de `schema/` divergentes + `client-audit.ts`/`client-export.ts`, que o ecommerce ainda não tinha). Confirmar que o diff toca **apenas** `packages/db/src/{schema,queries,sql/triggers.sql}`. Onde dashboard e ecommerce divergiam, o dashboard vence (ADR-0007).

Run: `! gh pr diff <PR_NUMBER> --repo othavioquiliao/emach-ecommerce`

- [ ] **Step 5: Mergear o PR após o CI passar**

O CI `check-types` (Task 2) roda dentro do PR. Com ele verde e o diff revisado:

Run: `! gh pr merge <PR_NUMBER> --repo othavioquiliao/emach-ecommerce --squash`

---

### Task 6: [Opcional] Job detector de drift no CI do ecommerce

Reforço opcional. O PR de sync aberto já sinaliza drift; este job torna o CI do próprio ecommerce vermelho enquanto houver divergência. Como o repo dashboard é privado, exige um segundo PAT (somente leitura no dashboard). Pular esta task é uma escolha válida — o setup fica mais enxuto.

**Repo:** ecommerce

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Criar o PAT de leitura e o secret**

Fine-grained PAT — resource owner `othavioquiliao`, repositório **`emach-dashboard`**, permissão `Contents: Read-only`. Guardar como secret no repo ecommerce:

```
! gh secret set DASHBOARD_READ_TOKEN --repo othavioquiliao/emach-ecommerce --body "<TOKEN>"
```

- [ ] **Step 2: Adicionar o job ao `ci.yml` do ecommerce**

Acrescentar ao final de `/home/othavio/Projects/emach/emach-ecommerce/.github/workflows/ci.yml`:

```yaml
  schema-drift:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout ecommerce
        uses: actions/checkout@v4
        with:
          path: ecommerce
      - name: Checkout dashboard (main)
        uses: actions/checkout@v4
        with:
          repository: othavioquiliao/emach-dashboard
          ref: main
          token: ${{ secrets.DASHBOARD_READ_TOKEN }}
          path: dashboard
      - name: Comparar arquivos compartilhados de DB
        run: |
          set -euo pipefail
          diff -r dashboard/packages/db/src/schema  ecommerce/packages/db/src/schema
          diff -r dashboard/packages/db/src/queries ecommerce/packages/db/src/queries
          diff    dashboard/packages/db/src/sql/triggers.sql ecommerce/packages/db/src/sql/triggers.sql
          echo "Schema sincronizado com o dashboard."
```

- [ ] **Step 3: Validar YAML e commitar**

```bash
cd /home/othavio/Projects/emach/emach-ecommerce
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML OK"
git add .github/workflows/ci.yml
git commit -m "ci: adiciona detector de drift de schema"
```

---

## Atualização de documentação (após o sync funcionar)

Não é uma task de código, mas faz parte do "pronto":

- `packages/db/CLAUDE.md` (dashboard **e** ecommerce) — a seção de sync passa de "cópia byte-a-byte manual" para "PR automático via workflow `sync-db-schema` (ADR-0007)".
- `docs/integration/admin-ecommerce.md` — citado na `CLAUDE.md` raiz mas ainda não existe; criar com o contrato da DB compartilhada + este mecanismo.
- Espelhar `docs/adr/0007-sync-schema-via-ci.md` e a seção atualizada de `packages/db/CLAUDE.md` no repo `emach-ecommerce`.
