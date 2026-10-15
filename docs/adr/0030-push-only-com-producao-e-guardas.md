# ADR 0030 — Schema push-only com produção ativa, sob guardas

**Data:** 2026-10-14
**Status:** Aceito — **estende o ADR-0006**
**Relaciona:** ADR-0004 (DB compartilhada), ADR-0006 (push-only), ADR-0009 (sync de schema via CI), ADR-0014 (RLS deny-all, aplicada pelo `db:apply-sql`).

## Contexto

O ADR-0006 abandonou as migrations versionadas "enquanto não houver produção" e previu gerar um baseline `0000` quando a produção chegasse. A produção chegou e o baseline nunca foi gerado:

- O banco Supabase é único e compartilhado: dev = prod = ecommerce (aviso no topo do `CLAUDE.md` da raiz).
- O dashboard roda na Vercel em `gru1` (`apps/web/vercel.json`).
- `packages/db/src/` não tem pasta `migrations`. O `bun db:sync` é `drizzle-kit push && bun run db:apply-sql` (`packages/db/package.json`), e o `drizzle.config.ts` lê o `DATABASE_URL` de `apps/web/.env`. Rodar `db:sync` é, portanto, escrever no banco de produção.

O push direto tem dois limites conhecidos (`packages/db/CLAUDE.md`, seção Schema workflow): o `drizzle-kit push` pede confirmação em TTY para mudança destrutiva ou rename ambíguo, e não faz diff do predicado `WHERE` de índice parcial. Com produção ativa, os riscos reais são três: push sem autorização (inclusive o de uma branch que não é a `main`), rename e drop de coluna ou tabela que o ecommerce ainda lê.

## Decisão

O schema continua push-only. Os arquivos TS de `packages/db/src/schema/` são a fonte de verdade e não há pasta de migrations. Valem as guardas abaixo:

- **Autorização.** `bun db:sync` e `bun db:push` contra o `DATABASE_URL` do `.env` só rodam com autorização do dono na sessão. Subagente só roda com essa autorização colada no prompt.
- **Sem sync por branch.** Nunca rodar `db:sync` por troca de branch. O banco não espelha a branch em checkout.
- **Adição.** Coluna ou tabela nova é aditiva: nullable ou com default, aplicada antes do código que a usa.
- **Rename e drop por expand-contract**, em PRs separados:
  1. Fase 1 adiciona a coluna (ou tabela) nova e o código grava nas duas.
  2. Fase 2 faz o backfill e muda os leitores nos dois apps. O PR de sync do ecommerce (ADR-0009) precisa estar mergeado antes da fase 3.
  3. Fase 3, num PR separado, remove a coluna antiga do schema TS e do banco.

  Nunca rename direto.
- **CHECK novo** só depois de corrigir as linhas que o violam; senão o push falha com SQLSTATE `23514`.
- **`DROP SCHEMA public CASCADE`** não é caminho de schema: só em Postgres local ou descartável. No banco único, só com autorização explícita do dono na sessão.

## Opções consideradas

- **Baseline `0000` e migrations versionadas.** Rejeitada. Os motivos do ADR-0006 continuam valendo: o histórico acumulou drift irrecuperável e a numeração colidia entre branches paralelas (issue #44). O risco que a produção trouxe está em rename, drop e push sem autorização, e as guardas cobrem esses três casos sem trazer de volta o histórico.
- **Push-only sem guarda.** Rejeitada. Rename e drop chegariam ao ecommerce sem aviso, e qualquer branch poderia sobrescrever o schema de produção.
- **Push-only com guardas.** Escolhida.

## Consequências

- O baseline `0000` previsto na primeira Consequência do ADR-0006 não será gerado.
- O sync do ADR-0009 continua espelhando só `schema/`, `queries/`, `utils.ts`, os SQL (`triggers.sql`, `rls.sql`) e o contrato `docs/integration/admin-ecommerce.md`. Não há pasta de migrations para espelhar.
- Mudança destrutiva (rename ou drop) gera pelo menos dois PRs no dashboard e exige o PR de sync do ecommerce mergeado entre eles.
- As guardas são regra escrita. O script `db:sync` não exige confirmação nem imprime o host; uma guarda mecânica fica para ticket próprio.
