# DB workflow é push-only até produção

O monorepo compartilha um único banco Supabase e ainda não tem ambiente de produção. O histórico de migrations versionadas (`packages/db/src/migrations/`) acumulou drift irrecuperável — hashes divergentes na `drizzle.__drizzle_migrations`, `_journal.json` incoerente e colisões de numeração entre branches paralelas (issue #44). Decidimos abandonar as migrations versionadas enquanto não houver produção: o fluxo de schema é só `bun db:push`, e a fonte de verdade do schema são os arquivos TypeScript em `packages/db/src/schema/` — não a pasta de migrations (deletada) nem o banco vivo.

Sem produção, um histórico de migrations não tem nada que o consuma; mantê-lo "reparado" seria trabalho recorrente sem valor, e a colisão de numeração entre branches era ativamente nociva ao trabalho paralelo. `db:generate` e `db:migrate` foram removidos para que ninguém — humano ou agente — recrie a pasta por engano.

## Consequências

- Quando produção entrar no horizonte, gerar um baseline `0000` limpo a partir do schema atual e versionar a partir daí.
- O repo do app e-commerce sincroniza o schema contra os arquivos TS de `packages/db/src/schema/`, não contra migrations.
- O banco compartilhado espelha a branch em checkout (`db:push` após cada `git checkout`); não é um ambiente estável.
