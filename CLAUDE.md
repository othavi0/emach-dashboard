# Emach Dashboard

> Log de mistakes recorrentes e decisões não-óbvias. Código vence em conflito.
> Produto: register de ferramentas + dashboard interno. Dois apps compartilham DB Supabase (admin = este; site ecomerce = repo separado).

## Auth — invariantes P0 (qualquer violação é bug crítico)

Duas instâncias **completamente isoladas** Better Auth no mesmo banco:

| Instância                                  | Import                  | Cookie prefix | trustedOrigins     |
| ------------------------------------------ | ----------------------- | ------------- | ------------------ |
| Dashboard (super_admin/admin/manager/user) | `@emach/auth/dashboard` | default       | `CORS_ORIGIN`      |
| Ecomerce (clientes BR)                     | `@emach/auth/ecommerce` | `ecommerce`   | `ECOMMERCE_ORIGIN` |

1. `apps/web` **pode** importar `@emach/db/schema/client` (admin lê dados de cliente). `apps/web` **nunca** importa `@emach/auth/ecommerce`. App ecomerce **nunca** importa `@emach/db/schema/auth`.
2. `DashboardSession` ≠ `EcommerceSession`. Não existe tipo "Session" genérico.
3. **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"`. Subdomínios distintos isolam por host.
4. CPF/CNPJ: validação no app (zod refine + dígito verificador). Sempre normalizar (só dígitos) antes de persistir em `client.document`.
5. Schema é **push-only** (ADR-0006): `bun db:sync` após editar `packages/db/src/schema/*.ts`. Sem migrations versionadas.
6. DB compartilhada com app ecomerce externo (ADR-0004). Admin **não** chama ecomerce; ecomerce **não** chama admin. Coordenação via schema. Sync schema TS é **CI PR automático** dashboard → ecommerce (ADR-0009). Contrato: `docs/integration/admin-ecommerce.md`.

Roles dashboard: `user.role` enum `super_admin/admin/manager/user`; `user.status` enum `pending/active/suspended`. Better Auth cria novo user com `role='user' + status='pending'`. Promoção bootstrap via SQL direto.

**⚠️ Gates role-based desligados em 2026-05-27 (ADR-0012).** `requireCapability*`, `can()`, `requireRole` e `getUserBranchScope` em `apps/web/src/lib/` são no-op — validam só sessão + `status='active'`. Matriz original preservada em `apps/web/src/lib/permissions.disabled.ts`. Mantidos como guard-rails: status gate, self-action guard, last-super-admin guard. **Não adicionar capabilities novas sem religar** (passos em `docs/adr/0012-disable-role-based-gates.md`). Reativar antes de produção.

## Anti-patterns banidos (P0/P1)

- `console.log/warn/error` em produção. Usar `logger` de `apps/web/src/lib/logger.ts`.
- `: any`, `<any>`, `as any`, `@ts-ignore`, `@ts-expect-error` (exceto `.next/` gerado).
- `key={index}` em `.map()` — IDs estáveis. Exceções com `biome-ignore` documentado.
- `<img>` puro — sempre `next/image` (exceto thumbs Supabase com biome-ignore).
- `React.forwardRef` — React 19 usa `ref` como prop normal.
- `useMemo`/`useCallback` manuais — React Compiler ativo (`next.config.ts: reactCompiler: true`).
- Barrel files (`index.ts` re-export only). Exceção: `packages/db/src/schema/index.ts` (marcado com biome-ignore).
- `async function` em Client Component — usar Server Component pra fetching.
- `.forEach()` em hot path — `for...of`.
- `new RegExp(...)` ou literal em loops — extrair top-level.
- `target="_blank"` sem `rel="noopener"`.
- APIs que injetam HTML não-sanitizado — exceto com sanitização (ex: `react-markdown` + `rehype-sanitize` preset `defaultSchema`).
- Cool blue-grays — neutros têm chroma warm (oklch hue ~70).
- `font-serif` (Cormorant) em chrome do dashboard — restrito a login hero + capa de relatório.

## Gotchas

- **`createDb()` × `db` singleton:** `packages/auth/*` usa `createDb()` pra evitar ciclo de import com env; resto usa `db`. Não consolidar.
- **Hook auto-format PostToolUse:** `.claude/settings.json` roda `bun fix` após `Write`/`Edit`. Pode reordenar campos e quebrar `old_string` de Edits subsequentes — re-ler se falhar.
- **Server actions com upload base64:** limite Next 16 default é 1MB. Configurado em `apps/web/next.config.ts` como `experimental.serverActions.bodySizeLimit = "5mb"`.
- **Drizzle-kit push + TTY:** rename ambíguo de coluna falha sem TTY. Em dev, dropar+recriar schema é o caminho mais previsível.
- **`db.execute()` raw devolve timestamp como string** (drizzle 0.45.x bug). Coercer com `toDate` de `@emach/db/utils` no boundary. Detalhes em `packages/db/CLAUDE.md`.
- **IDs:** `crypto.randomUUID()` no caller (server actions/scripts) — sem nanoid.

## Smoke run-time

`bun check-types` não detecta SQL inválido em template strings nem queries com colunas removidas. Após mexer em schema/queries SSR: `bun dev:web` + visitar rotas afetadas. Stack trace rápido via `nextjs_call <port> get_errors` (MCP `next-devtools`).

`check-types` (tsc) também **não pega regras de lint** (`useAwait`, `noNestedTernary`, etc.) — o CI roda `bun check` (ultracite). Antes de commitar/PR, rodar **`bun check`** além de `check-types`. Exceção: warnings que o código canônico de referência também tem (ex: `role="button"` em card clicável, nested-ternary em header contextual de detalhe espelhando `branches`) — manter por consistência, não corrigir divergindo do padrão.

## Onde estão os outros mistakes-logs

| Tópico                                                                                                       | Arquivo                                        |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Server actions, capabilities, forms UX, orders branch-scoping                                                | `apps/web/CLAUDE.md`                           |
| Schema workflow, triggers PL/pgSQL, `db.execute` armadilha, sync ecomerce                                    | `packages/db/CLAUDE.md`                        |
| Sistema visual + **entity/CRUD pattern** (paleta, tipografia, cards, tabs, header contextual, drawer/dialog) | `DESIGN.md`                                    |
| Produto / personality / anti-references                                                                      | `PRODUCT.md`                                   |
| Integração DB compartilhada (contrato detalhado)                                                             | `docs/integration/admin-ecommerce.md`          |
| Storage buckets                                                                                              | `docs/storage-buckets.md`                      |
| Skills locais, MCPs, comandos                                                                                | `.claude/skills/`, `.mcp.json`, `package.json` |
| Glossário de domínio                                                                                         | `CONTEXT.md`                                   |

Stack / scripts / envs → `package.json`, `packages/env/src/server.ts`.
