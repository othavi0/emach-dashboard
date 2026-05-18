# Design — Sincronização automática do schema dashboard → ecommerce

**Data:** 2026-05-18
**Status:** Design aprovado — aguardando revisão da spec antes do plano de implementação
**ADR relacionado:** `docs/adr/0007-sync-schema-via-ci.md`

## Problema

O dashboard e o site e-commerce são monorepos separados que compartilham um único banco Postgres no Supabase (ADR-0004). Cada repo tem sua própria cópia das definições Drizzle em `packages/db/src/`. Hoje essa cópia é sincronizada à mão — a `packages/db/CLAUDE.md` do ecommerce literalmente instrui "sincroniza byte-a-byte, cópia manual a cada mudança".

O sync manual já falhou. Comparando os dois repos em 2026-05-18:

| Estado | Arquivos de `schema/` |
|---|---|
| Divergem | `attributes`, `client`, `inventory`, `orders`, `promotions`, `reviews`, `stock-movements`, `tools`, `index` |
| Idênticos | `auth`, `categories`, `consent-log`, `shared-enums` |
| Só no dashboard | `client-audit`, `client-export` |

8 de 13 arquivos divergiam. Como o `db:push` espelha a branch em checkout (ADR-0006), quem faz push por último define o banco e o outro app fica com types mentindo. As docs também driftaram — a `packages/db/CLAUDE.md` do ecommerce ainda menciona `apiKey` e migrations, ambos removidos.

## Decisão

Automatizar a cópia com um GitHub Action no repo dashboard (fonte de verdade) que abre um Pull Request no repo ecommerce sempre que o schema muda.

Os repos continuam separados — o dashboard terá deploy independente e vai virar ferramenta interna além de site. Por isso descartamos:

- **Monorepo único:** juntaria os deploys, que precisam ficar separados.
- **Pacote `@emach/db` publicado num registry:** cobra `publish` + bump de versão a cada mudança de schema, sem haver consumidor externo nem produção. A fronteira "dura" de um pacote versionado só compensa com terceiros ou produção — nenhum dos dois existe hoje.

O espelhamento via CI é a menor mudança que elimina o sync manual sem inventar modelo mental novo: a doc já declarava "dashboard é fonte de verdade, ecommerce sincroniza".

## Arquitetura

### Direção

Unidirecional, `emach-dashboard` → `emach-ecommerce`. Toda mudança de schema nasce no dashboard. O ecommerce nunca edita schema/queries/triggers em isolamento.

### Superfície sincronizada

| Espelhado | Não espelhado (per-repo) |
|---|---|
| `packages/db/src/schema/**` — todos os 14 arquivos, incluindo `auth`, `client-audit`, `client-export` e o barrel `schema/index.ts` | `packages/db/src/index.ts` — factory `createDb`/`db`, wiring de runtime |
| `packages/db/src/queries/**` — `catalog.ts`, `reviews.ts` | `packages/db/src/utils.ts` |
| `packages/db/src/sql/triggers.sql` | `packages/db/scripts/**`, `drizzle.config.ts` |

Espelha o `schema/` inteiro de propósito: o ecommerce passa a ter o retrato completo do banco para agentes e devs trabalharem com contexto total. Ter o arquivo `schema/auth.ts` no repo não viola a invariante "ecommerce nunca importa `@emach/db/schema/auth`" — a invariante é sobre import no código do app, não sobre o arquivo existir.

### O Action

Arquivo: `.github/workflows/sync-db-schema.yml` no repo dashboard.

- **Trigger:** `on: push` em `main`, com `paths:` filtrando `packages/db/src/schema/**`, `packages/db/src/queries/**` e `packages/db/src/sql/triggers.sql`. Só roda quando arquivo de DB muda.
- **Passos:**
  1. Checkout do dashboard.
  2. Checkout do `emach-ecommerce` num subdiretório, usando um fine-grained PAT (secret `ECOMMERCE_SYNC_TOKEN`).
  3. Copia a superfície compartilhada por cima da árvore do ecommerce.
  4. `peter-evans/create-pull-request` abre — ou atualiza, se já existe — um PR no ecommerce numa branch fixa `chore/sync-db-schema`.
- **Autenticação:** fine-grained PAT escopado só ao repo `emach-ecommerce`, com permissões `Contents: read & write` + `Pull requests: read & write`. Guardado como secret do repo dashboard (`ECOMMERCE_SYNC_TOKEN`).

### Entrega via PR (não commit direto)

O Action abre PR em vez de commitar direto na `main` do ecommerce, para haver um checkpoint antes do merge. Hoje o repo ecommerce **não tem CI** — este trabalho cria um workflow mínimo de `check-types` no ecommerce, para que o PR de sync de fato barre quebras de código local contra o schema novo (ex.: uma coluna removida) antes de entrar na `main`.

### Rede de segurança — detector de drift repo-vs-repo (opcional)

Opcional. Um job no CI do ecommerce que falha se `packages/db/src/{schema,sql,queries}` divergir do `main` do dashboard, pegando o caso de um PR de sync aberto mas nunca mergeado. Como o repo dashboard é privado, esse job exige um token de leitura próprio guardado como secret no repo ecommerce. O sinal primário de drift é o próprio PR de sync aberto — por isso o job é um reforço opcional, não um pré-requisito.

## Item de limpeza one-time

O ecommerce hoje guarda os triggers em `packages/db/src/migrations/_triggers.sql` e o dashboard em `packages/db/src/sql/triggers.sql`. Como o ADR-0006 aposentou as migrations versionadas, o ecommerce deve adotar `sql/triggers.sql` e remover a pasta morta `migrations/`. O Action já escreve no path novo.

## Plano de verificação

- O Action roda sem erro num push de teste que toca `schema/`.
- O PR aparece no `emach-ecommerce` com o diff esperado.
- Um push que não toca `packages/db/src/**` não dispara o Action.
- O job de drift no ecommerce (se adotado) passa quando sincronizado e falha quando artificialmente dessincronizado.
- Após merge do PR de sync: `bun check-types` + `bun db:push` no ecommerce sem erro.

## Impacto em documentação

Ao implementar, atualizar:

- `docs/adr/0007-sync-schema-via-ci.md` — criado junto com esta spec (registro da decisão).
- `packages/db/CLAUDE.md` (dashboard **e** ecommerce) — a seção de sync passa de "cópia manual" para "PR automático via CI".
- `docs/integration/admin-ecommerce.md` — citado na `CLAUDE.md` raiz mas ainda não existe; criar com o contrato da DB compartilhada + este mecanismo.
- O ADR-0007 e a seção atualizada de `packages/db/CLAUDE.md` devem ser espelhados no repo `emach-ecommerce`.
