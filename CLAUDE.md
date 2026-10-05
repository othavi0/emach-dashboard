# Emach Dashboard

> Log de mistakes recorrentes e decisões não-óbvias. Código vence em conflito.
> Produto: register de ferramentas + dashboard interno. Dois apps compartilham DB Supabase (admin = este; site ecomerce = repo separado).

## ⛔ Banco único dev=prod (incidente 2026-07)

- O Supabase deste repo é ÚNICO e COMPARTILHADO (dev = prod = ecommerce). NUNCA `seed`/`truncate`/`drop`/reset/`db:push` destrutivo sem autorização explícita do user NESTA sessão — `db:seed-demo` já truncou 28 tabelas via Task de subagente que não recebeu esta restrição.
- **Write pontual de linha é OK sem autorização caso-a-caso** — o dado povoado é seed descartável (`EM-TEST-*`/`EM-2026-*`). Vale INSERT/UPDATE/DELETE de poucas linhas via app ou script one-off, ex: fabricar um estado que o seed não tem pra fechar smoke visual (2026-07-16: exceção de picking pra provar a linha de exceção da overview, #329). **Reverter o que criou ao terminar** (guardar o id e deletar; preferível ao fluxo do app, que resolve pra frente e deixa histórico). A fronteira é **volume + irreversibilidade**, não o ato de escrever: o destrutivo em massa do item acima (reset/truncate/drop/seed) continua exigindo autorização explícita.
- Todo subagente/Task que toca banco recebe **as duas** restrições acima COLADAS no prompt (subagente não herda este arquivo).
- PII/credenciais de bootstrap do reset de 2026-06 permanecem no **histórico git** (arquivo `RESET-PLAN.md` em commits anteriores a `03984800`; a working tree está limpa desde então e o arquivo foi removido em 2026-07-13 — purge de histórico nunca foi feito).
- Dado fabricado para smoke sai por `bun run --cwd packages/db db:fixtures create <superfície>` e volta por `db:fixtures cleanup --run <run>` (o `create` imprime o run). Consulta sem o MCP: `db:read`, só leitura. Detalhes em `packages/db/CLAUDE.md`.
- CWD é a raiz do monorepo. O `dev` de `apps/web` e o `scripts/remove-tool-image-bg.py` se cercam sozinhos com `scripts/run-capped.sh` (teto de memória por systemd, ajustável por `MEM_HIGH`/`MEM_MAX`). Comando pesado novo passa pelo mesmo script. Dev server: `PORT=<n> bun dev:web`. Em dev o auth aceita qualquer `localhost:<porta>`, então trocar de porta não pede edição do `.env`.

## Auth — invariantes P0 (qualquer violação é bug crítico)

Duas instâncias **completamente isoladas** Better Auth no mesmo banco:

| Instância                                  | Import                  | Cookie prefix | trustedOrigins     |
| ------------------------------------------ | ----------------------- | ------------- | ------------------ |
| Dashboard (super_admin/admin/user) | `@emach/auth/dashboard` | default       | `CORS_ORIGIN` em produção, `http://localhost:*` em dev |
| Ecomerce (clientes BR, vive no repo `emach-ecommerce`) | `@emach/auth/ecommerce` | `ecommerce`   | `ECOMMERCE_ORIGIN` |

1. `apps/web` **pode** importar `@emach/db/schema/client` (admin lê dados de cliente). `apps/web` **nunca** importa `@emach/auth/ecommerce`. App ecomerce **nunca** importa `@emach/db/schema/auth`.
2. `DashboardSession` ≠ `EcommerceSession`. Não existe tipo "Session" genérico.
3. **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"`. Subdomínios distintos isolam por host.
4. CPF/CNPJ: validação no app (zod refine + dígito verificador). Sempre normalizar (só dígitos) antes de persistir em `client.document`.
5. Schema é **push-only** (ADR-0006): `bun db:sync` após editar `packages/db/src/schema/*.ts`. Sem migrations versionadas.
6. DB compartilhada com app ecomerce externo (ADR-0004). Admin **não** chama ecomerce; ecomerce **não** chama admin. Coordenação via schema. Sync schema TS é **CI PR automático** dashboard → ecommerce (ADR-0009). Contrato: `docs/integration/admin-ecommerce.md`.

Roles dashboard: `user.role` enum `super_admin/admin/user`; `user.status` enum `pending/active/suspended`. Acesso é **convite-only** (ADR-0013): sem signup público; admin convida → user nasce `pending` com `inviteToken` → vira `active` ao aceitar. Bootstrap do primeiro `super_admin` via SQL direto.

**Gates role-based religados (ADR-0016, substitui 0012).** `requireCapability*`, `can()`, `requireRole`, `getUserBranchScope` enforçam de verdade. **3 níveis**: `super_admin`/`admin`/`user`. Dois eixos: Capability (tipo de ação) + Branch-scoping (filial) **só em Vendas/Inventory** — Catálogo/Clientes/Reviews/Settings são globais. `admin` é filial-scoped; exclusivos de `super_admin`: `branches.manage`, `users.delete`, `shipping.manage`, `site.*` (`site.update_banners`, `site.update_settings` e `site.publish_announcements`), e `*.delete` de catálogo. **Fail-closed**: admin/user sem vínculo em `user_branch` vê nada → **popular `user_branch` é pré-requisito** (invariante: todo admin/user tem ≥1 filial; ver CONTEXT.md #8). Guard-rails: status, self-action, last-super-admin, **last-branch**. Bootstrap 1º super_admin via SQL.

## Anti-patterns banidos (P0/P1)

`bun check` (biome) barra `console`, `any`, `@ts-ignore`, `key={index}` e o import de `forwardRef`. `bun guard:forms` (ast-grep) barra `useMemo`, `useCallback` e `@ts-expect-error`. As exceções ficam nos próprios checks:

- Log em produção passa por `logger` (`apps/web/src/lib/logger.ts`).
- `key={index}` só em lista curta de primitivos sem id ou de inputs controlados, com `// biome-ignore lint/suspicious/noArrayIndexKey: <motivo>` na linha logo acima do atributo `key`. `packages/ui` (shadcn) fica fora da regra.
- `useMemo`/`useCallback` só onde o React Compiler não compila o componente, com `// ast-grep-ignore: no-manual-memo <motivo>` (`no-manual-memo-ts` em `.ts`).
- `<img>` puro — sempre `next/image` (exceto thumbs Supabase com biome-ignore).
- Barrel files (`index.ts` re-export only). Exceções marcadas com `biome-ignore lint/performance/noBarrelFile`: `packages/db/src/schema/index.ts` (API pública do pacote `@emach/db`) e `apps/web/src/lib/masks/index.ts` (import ergonômico das máscaras de input). Outros barrels em `src/index.ts` de pacotes que exportam lógica real (ex: `packages/db/src/index.ts`) **não são barrels** pela definição do biome — não precisam de anotação.
- `async function` em Client Component — usar Server Component pra fetching.
- `.forEach()` em hot path — `for...of`.
- `new RegExp(...)` ou literal em loops — extrair top-level.
- `target="_blank"` sem `rel="noopener"`.
- APIs que injetam HTML não-sanitizado — exceto com sanitização (ex: `react-markdown` + `rehype-sanitize` preset `defaultSchema`).
- Cool blue-grays — neutros têm chroma warm (oklch hue ~70).
- `font-serif` é o token de **display** (Barlow Condensed, **caixa-alta** via `text-transform`) — restrito a h1 + wordmark; nunca em h3/body/controls/sidebar/tabelas. Mono = IBM Plex Mono. Nomes de entidade dinâmicos: display em sentence-case.

## Gotchas

- **`createDb()` × `db` singleton:** `packages/auth/*` usa `createDb()` pra evitar ciclo de import com env; resto usa `db`. Não consolidar.
- **Hook PostToolUse (`.claude/hooks/post-edit-lint.sh`):** formata o arquivo editado e devolve com exit 2 o erro de lint que o fix não corrige. Pode reordenar campos e quebrar `old_string` de Edits seguintes: re-ler se o Edit falhar.
- **lefthook pre-commit:** o `react-doctor` imprime regressões sem bloquear o commit. Worktree novo: `scripts/worktree-setup.sh` liga `apps/web/.env` ao checkout principal e faz `bun install` real. ⚠️ git **worktrees compartilham `.git/hooks`** — em integração multi-commit usando worktrees, os hooks firam nos commits do main tree (podem reformatar e deixar a mudança fora do commit). Se atrapalhar, scrub: `for h in .git/hooks/*; do grep -qil lefthook "$h" && rm -f "$h"; done` (reinstala no próximo `bun install`).
- **Server actions com upload base64:** limite Next 16 default é 1MB. Configurado em `apps/web/next.config.ts` como `experimental.serverActions.bodySizeLimit = "8mb"`.
- **Drizzle-kit push + TTY:** rename ambíguo de coluna falha sem TTY. Dropar+recriar o schema resolve, mas é destrutivo no banco único: só com autorização explícita do user na sessão.
- **`db.execute()` raw devolve timestamp como string** (drizzle 0.45.x bug). Coercer com `toDate` de `@emach/db/utils` no boundary. Detalhes em `packages/db/CLAUDE.md`.
- **IDs:** `crypto.randomUUID()` no caller (server actions/scripts) — sem nanoid.
- **Deploy Vercel:** funções DEVEM rodar em `gru1` (`"regions": ["gru1"]` no `apps/web/vercel.json`) — no default `iad1` cada query ao Supabase sa-east-1 paga ~140ms e a navegação RSC chega a 1,9s (incidente 2026-07-28). A região do **build** (`iad1` no log) é outra coisa e não importa. A produção sai do repo espelho `emach-ferramentas/emach-dashboard`, que o `mirror.yml` empurra a cada merge na main. Run vermelho do mirror quer dizer que a main não chegou em produção. Sem `MIRROR_TOKEN`, o run falha. O PAT é da conta `emach-ferramentas` com Contents e Workflows: Read and write; a conta `othavi0` só tem `pull` no espelho. Deploy manual: `npx vercel deploy --prod` (projeto `emach-dashboard`, scope `emach-s-projects`) — exige o `.vercelignore` da raiz (limite Vercel de 100MB/arquivo; caches `.next`/`.turbo` estouram).
- **`.vercelignore` apaga `.git` → `prepare` não pode exigir git (build quebrado 2026-07-30):** o `.vercelignore` é aplicado **depois do clone**, inclusive no build git-triggered, então `lefthook install` puro no `prepare` matava o `bun install` com `exit status 128` antes de compilar. `prepare` agora é guardado por `git rev-parse --git-dir`. Qualquer script novo no `prepare` que dependa de `.git` volta a quebrar o deploy.

## Smoke run-time

`bun check-types` não detecta SQL inválido em template strings nem queries com colunas removidas. Após mexer em schema/queries SSR: subir o dev server (`PORT=<n> bun dev:web`) e visitar as rotas afetadas. Stack trace rápido via `nextjs_call <port> get_errors` (MCP `next-devtools`).

`check-types` (tsc) também **não pega regras de lint** (`useAwait`, `noNestedTernary`, etc.). Antes de commitar ou abrir PR: **`bun verify`**. Exceção: warnings que o código canônico de referência também tem (ex: `role="button"` em card clicável, nested-ternary em header contextual de detalhe espelhando `branches`) — manter por consistência, não corrigir divergindo do padrão.

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

## Agent skills

### Issue tracker

Issues e PRDs vivem como GitHub issues em `othavi0/emach-dashboard` (via `gh` CLI). PRs externos **não** são superfície de triagem. Ver `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário canônico de 5 labels sem override (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context: um `CONTEXT.md` + `docs/adr/` na raiz cobrem o monorepo inteiro. Ver `docs/agents/domain.md`.
