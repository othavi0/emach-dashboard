# Canonizar RLS deny-all no dashboard (#142)

> Spec de brainstorming. Issue: othavioquiliao/emach-dashboard#142.
> Estado validado em 2026-06-11 (ver "Validação" abaixo).

## Objetivo

O `ENABLE ROW LEVEL SECURITY` (deny-all, sem policies) das 13 tabelas `public`
expostas via PostgREST passa a ser **SQL canônico versionado no dashboard**, que
é a fonte de verdade da infra DB (ADR-0009). O padrão espelha o precedente já
existente: `packages/db/src/sql/triggers.sql`.

**Nenhuma mudança no estado do banco.** O RLS já está aplicado e validado.

## Validação (estado em 2026-06-11)

| Item | Estado | Evidência |
|------|--------|-----------|
| RLS aplicado nas 13 tabelas no banco | feito | Advisor de segurança: 13× `rls_enabled_no_policy` (INFO, esperado p/ deny-all); zero `rls_disabled_in_public` |
| `rls.sql` versionado no ecommerce | feito | `emach-ecommerce/packages/db/src/sql/rls.sql` (header + 13 `ALTER TABLE`) |
| `rls.sql` canônico no dashboard | **falta** | Só existe `triggers.sql` |
| ADR documentando deny-all | **falta** | ADRs vão até 0013 |
| Sync `rls.sql` dashboard→ecommerce via CI | **falta** | `sync-db-schema.yml` espelha schema/queries/`triggers.sql`; `rls.sql` fora dos `paths` e do mirror |

As 13 tabelas (batem 1:1 com a issue): `tool`, `tool_variant`, `tool_image`,
`tool_category`, `tool_attribute_value`, `tool_attribute_assignment`,
`attribute_definition`, `category`, `branch`, `stock_level`, `promotion`,
`promotion_tool`, `review`.

## Decisões travadas (brainstorming)

- **Escopo de segurança:** espelho fiel — só `ENABLE ROW LEVEL SECURITY`. RLS sem
  policy já é deny-all real para `anon`/`authenticated`, independente de grants.
  Sem `REVOKE` explícito (redundante) nem `FORCE RLS` (arriscado p/ acesso
  server-side).
- **Mecanismo de apply:** generalizar `apply-triggers.ts` → `apply-sql.ts`,
  aplicando uma lista explícita ordenada `["triggers.sql", "rls.sql"]`.

## Componentes

### 1. `packages/db/src/sql/rls.sql` (novo)

Arquivo canônico no dashboard. Conteúdo = os 13 `ALTER TABLE public.<t> ENABLE
ROW LEVEL SECURITY`.

**Header:** mantém o "por quê" do deny-all + nota de ownership (idêntico ao do
ecommerce, para o drift-check de paridade byte-a-byte não reclamar), mas **inverte
a frase de canonicidade**: o `rls.sql` do ecommerce diz "cópia versionada... o
canônico deve ser avaliado no dashboard (#90)". A versão do dashboard afirma que
ela **é** o canônico (precedente: `triggers.sql`; ownership: ADR-0009/0014).

Idempotente: `ENABLE ROW LEVEL SECURITY` é no-op se já habilitado.

### 2. Apply: `apply-triggers.ts` → `apply-sql.ts`

Renomear `packages/db/scripts/apply-triggers.ts` → `apply-sql.ts` e generalizar
para aplicar uma lista explícita ordenada de arquivos SQL numa única conexão `pg`:

```ts
const files = ["triggers.sql", "rls.sql"];
for (const f of files) {
  const sql = readFileSync(resolve(scriptDir, "../src/sql", f), "utf8");
  await client.query(sql);
}
```

Em `packages/db/package.json`:
- `db:apply-triggers` → `db:apply-sql` (aponta p/ `scripts/apply-sql.ts`)
- `db:sync`: `drizzle-kit push && bun run db:apply-sql`

Ambos os SQLs são idempotentes — rodar junto é seguro e repetível.

### 3. `docs/adr/0014-rls-deny-all-postgrest.md` (novo)

ADR no formato dos existentes (prosa + `## Consequências`):

- **Decisão:** deny-all via RLS-sem-policy nas tabelas `public` expostas via
  PostgREST.
- **Por quê:** o app não usa PostgREST — todo acesso é server-side via
  Drizzle/`DATABASE_URL` (role `postgres`, `rolbypassrls = true`, ignora RLS).
  `ENABLE RLS` sem policy fecha a porta REST (`anon`/`authenticated` deny-all) sem
  afetar o app.
- **Alternativas descartadas:** policies RLS explícitas (cerimônia sem consumidor
  — não há multi-tenant por row aqui); `REVOKE` de grants (redundante com o
  deny-all do RLS); `FORCE RLS` (arrisca acesso server-side se algum path não usar
  role BYPASSRLS).
- **Referências:** ADR-0004 (DB compartilhada), ADR-0009 (ownership/sync via CI),
  precedente `triggers.sql`, issue ecommerce#90.

### 4. CI `sync-db-schema.yml`

- (a) Adicionar `packages/db/src/sql/rls.sql` aos `paths` do gatilho `push`.
- (b) Adicionar `cp "$src/sql/rls.sql" "$dst/sql/rls.sql"` no step "Mirror".

Ao mergear na `main`, o workflow gera PR automático no ecommerce substituindo o
`rls.sql` "cópia" pelo canônico. O drift-check do ecommerce (ADR-0009 §
Consequências — força paridade de `packages/db/src/{schema,sql,queries}`) garante
que o sync aconteça.

## Fora de escopo (YAGNI)

- Policies RLS, `REVOKE`/`FORCE`, qualquer DDL que mude o estado do banco.
- Religar gates de role (ADR-0012).
- Reescrever o ADR-0009 — o 0014 referencia, não edita.

## Arquivos tocados

| Arquivo | Ação |
|---------|------|
| `packages/db/src/sql/rls.sql` | novo |
| `packages/db/scripts/apply-sql.ts` | rename de `apply-triggers.ts` + lista |
| `packages/db/package.json` | renomear script + ajustar `db:sync` |
| `docs/adr/0014-rls-deny-all-postgrest.md` | novo |
| `.github/workflows/sync-db-schema.yml` | 2 linhas (paths + cp) |

## Verificação

- `bun run db:sync` aplica triggers + RLS sem erro (idempotente).
- Advisor de segurança continua sem `rls_disabled_in_public`.
- `bun check` + `bun check-types` limpos.
- Fechar a issue #142 referenciando o commit/PR.
