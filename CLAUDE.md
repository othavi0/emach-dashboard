# Emach Dashboard

> Log de mistakes recorrentes e decisões não-óbvias. Código vence em conflito.
> Produto: register de ferramentas + dashboard interno. Dois apps compartilham DB Supabase (admin = este; site ecomerce = repo separado).

## Banco compartilhado: regra de escrita dos dois apps

Esta seção é a fonte da regra de escrita no banco para o dashboard e para o ecommerce. As outras docs dos dois repos apontam para cá.

- O Supabase é um só para dev, produção, dashboard e ecommerce.
- **Pede autorização explícita do user nesta sessão:** todo comando que muda schema, apaga em massa ou não tem volta. No dashboard: `db:sync`, `db:push`, `db:apply-sql`, `db:reset-demo`, todo `db:seed-*` e `db:unseed-*`, drop e recreate do schema. No ecommerce: `db:push`, `db:apply-triggers`, todo `db:seed-*`, `db:anonymize-client`, drop e recreate do schema. Em 2026-07, um `db:seed-demo` rodado por subagente sem esta regra truncou 28 tabelas.
- **Write pontual é liberado sem autorização caso a caso:** INSERT, UPDATE ou DELETE de poucas linhas para fabricar um estado de smoke, feito pelo app, por script one-off ou, no dashboard, por `db:fixtures`. Guarde o id e reverta ao terminar. Prefira apagar o que criou a resolver pelo fluxo do app, que anda para a frente e deixa histórico.
- A fronteira é volume e irreversibilidade, não o ato de escrever.
- Leitura é livre: `db:read` no dashboard ou qualquer consulta só de leitura.
- Todo subagente que toca o banco recebe esta seção colada no prompt, porque subagente não herda este arquivo.
- Se o classificador de permissões barrar um write pontual, pare e peça ao user. Não contorne.
- PII/credenciais de bootstrap do reset de 2026-06 permanecem no **histórico git** (arquivo `RESET-PLAN.md` em commits anteriores a `03984800`; a working tree está limpa desde então e o arquivo foi removido em 2026-07-13 — purge de histórico nunca foi feito).
- Dado fabricado para smoke sai por `bun run --cwd packages/db db:fixtures create <superfície>` e volta por `db:fixtures cleanup --run <run>` (o `create` imprime o run). Consulta sem o MCP: `db:read`, só leitura. Detalhes em `packages/db/CLAUDE.md`.
- CWD é a raiz do monorepo. O `dev` de `apps/web` e o `scripts/remove-tool-image-bg.py` se cercam sozinhos com `scripts/run-capped.sh` (teto de memória por systemd, ajustável por `MEM_HIGH`/`MEM_MAX`). O `next dev` fica num scope `run-*.scope` do systemd, fora da unidade `dev-up-<porta>.service`, então o `dev-up wait` responde `BUSY_OTHER pid=<n>` para o servidor que a própria sessão subiu. Para conferir o dono, rode `dev-up.sh owner <porta>`: servidor da sessão sai `mine=yes via=other` (compara o cwd do PID, `ls -l /proc/<pid>/cwd`, com o worktree atual). Comando pesado novo passa pelo mesmo script. Dev server: `PORT=<n> bun dev:web`. Em dev o auth aceita qualquer `localhost:<porta>`, então trocar de porta não pede edição do `.env`.

## Auth — invariantes P0 (qualquer violação é bug crítico)

Duas instâncias **completamente isoladas** Better Auth no mesmo banco:

| Instância                                  | Import                  | Cookie prefix | trustedOrigins     |
| ------------------------------------------ | ----------------------- | ------------- | ------------------ |
| Dashboard (super_admin/admin/user) | `@emach/auth/dashboard` | default       | `CORS_ORIGIN` em produção, `http://localhost:*` em dev |
| Ecomerce (clientes BR, vive no repo `emach-ecommerce`) | `@emach/auth/ecommerce`: só resolve no repo `emach-ecommerce` (`packages/auth/src/ecommerce.ts` de lá); o `biome.json` deste repo barra o import | `ecommerce`   | `ECOMMERCE_ORIGIN` |

1. `apps/web` **pode** importar `@emach/db/schema/client` (admin lê dados de cliente). `apps/web` **nunca** importa `@emach/auth/ecommerce` (barrado pelo `noRestrictedImports` do `biome.json`). App ecomerce **nunca** importa `@emach/db/schema/auth`.
2. `DashboardSession` ≠ `EcommerceSession`. Não existe tipo "Session" genérico.
3. **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"`. Subdomínios distintos isolam por host.
4. CPF/CNPJ: validação no app (zod refine + dígito verificador). Normalizar antes de persistir em `client.document`: CPF só com dígitos; CNPJ alfanumérico em maiúsculas, sem pontuação (IN RFB 2.229/2024). A lógica copia `packages/validators/src/cpf-cnpj.ts` do ecommerce; mudança num lado exige a mesma no outro.
5. Schema é **push-only** (ADR-0006, ADR-0030): sem migrations versionadas. `bun db:sync` aplica o schema no banco único (= produção) e só roda com autorização do dono na sessão. Rename e drop de coluna ou tabela só por expand-contract, em PRs separados.
6. DB compartilhada com app ecomerce externo (ADR-0004). Admin **não** chama ecomerce; ecomerce **não** chama admin. Coordenação via schema. Sync schema TS é **CI PR automático** dashboard → ecommerce (ADR-0009). Contrato: `docs/integration/admin-ecommerce.md`.

Roles dashboard: `user.role` enum `super_admin/admin/user`; `user.status` enum `pending/active/suspended`. Acesso é **convite-only** (ADR-0013): sem signup público; admin convida → user nasce `pending` com `inviteToken` → vira `active` ao aceitar. Bootstrap do primeiro `super_admin` via SQL direto.

**Gates role-based religados (ADR-0016, substitui 0012).** `requireCapability*`, `can()`, `requireRole`, `getUserBranchScope` enforçam de verdade. **3 níveis**: `super_admin`/`admin`/`user`. Dois eixos: Capability (tipo de ação) + Branch-scoping (filial) **só em Vendas/Inventory** — Catálogo/Clientes/Reviews/Settings são globais. `admin` é filial-scoped; exclusivos de `super_admin`: `branches.manage`, `users.delete`, `shipping.manage`, `site.*` (`site.update_banners`, `site.update_settings` e `site.publish_announcements`), e os deletes de catálogo (`tools.delete`, `categories.delete`, `promotions.delete` e `attributes.delete`). **Fail-closed**: admin/user sem vínculo em `user_branch` vê nada → **popular `user_branch` é pré-requisito** (invariante: todo admin/user tem ≥1 filial; ver CONTEXT.md #8). Guard-rails: status, self-action, last-super-admin, **last-branch**. Bootstrap 1º super_admin via SQL.

## Anti-patterns banidos (P0/P1)

`bun check` (Biome) barra `console`, `any`, `@ts-ignore`, `key={index}`, o import de `forwardRef`, o de `@emach/auth/ecommerce` e componente async em arquivo `"use client"` (`noNextAsyncClientComponent`, ligado pelo preset `ultracite/biome/next`). `bun guard:forms` (ast-grep) barra `useMemo`, `useCallback`, `@ts-expect-error`, `@ts-nocheck`, erro de validação cru fora de `<FieldError>` (`raw-validation-error`) e `font-serif` fora de h1 (`display-font-only-h1`). Cada item abaixo diz quem o barra; o que diz "revisão" não tem check. As exceções ficam nos próprios checks:

- Log em produção passa por `logger` (`apps/web/src/lib/logger.ts`). Biome (`noConsole`, desligado no `logger.ts`, em `**/scripts/**` e, pelo preset `ultracite/biome/core`, em arquivo de teste, `bin`, `.mjs` e `.cjs`).
- `key={index}` só em lista curta de primitivos sem id ou de inputs controlados, com `// biome-ignore lint/suspicious/noArrayIndexKey: <motivo>` na linha logo acima do atributo `key`. `packages/ui` (shadcn) fica fora da regra.
- `useMemo`/`useCallback` só onde o React Compiler não compila o componente, com `// ast-grep-ignore: no-manual-memo <motivo>` (`no-manual-memo-ts` em `.ts`).
- `<img>` puro — sempre `next/image` (exceto thumbs Supabase com biome-ignore). Biome (`noImgElement`).
- Barrel files (`index.ts` re-export only). Biome (`noBarrelFile`). Exceções marcadas com `biome-ignore lint/performance/noBarrelFile`: `packages/db/src/schema/index.ts` (API pública do pacote `@emach/db`), `apps/web/src/lib/masks/index.ts` (import ergonômico das máscaras de input) e `packages/db/src/queries/tools.ts` (reexporta `STOREFRONT_TOOL_STATUSES`). Outros barrels em `src/index.ts` de pacotes que exportam lógica real (ex: `packages/db/src/index.ts`) **não são barrels** pela definição do biome — não precisam de anotação.
- Componente async em arquivo `"use client"` — usar Server Component pra fetching. Handler async dentro do componente é permitido. Biome (`noNextAsyncClientComponent`).
- `.forEach()` — `for...of`. Biome (`noForEach`), em qualquer lugar, não só em hot path.
- Regex dentro de função — extrair top-level. Literal: Biome (`useTopLevelRegex`). `new RegExp` com string constante: Biome (`useRegexLiterals`, cujo fix a vira literal). `new RegExp(...)` ou `RegExp(...)` dentro de laço ou de callback de iteração (`map`, `filter`, `reduce` e afins), inclusive com padrão dinâmico: oxlint (`emach/no-regexp-in-loop`), que o `bun check` roda.
- `target="_blank"` sem `rel="noopener"`. Biome (`noBlankTarget`; o fix acrescenta o `rel`).
- APIs que injetam HTML não-sanitizado — exceto com sanitização (ex: `react-markdown` + `rehype-sanitize` preset `defaultSchema`). Biome (`noDangerouslySetInnerHtml`).
- Cool blue-grays — neutros têm chroma warm (oklch hue ~70). Revisão: a cor entra por token, valor arbitrário ou utilitário do Tailwind, e nenhum padrão de sintaxe separa matiz quente de frio.
- `font-serif` é o token de **display** (Barlow Condensed, **caixa-alta** via `text-transform`) — restrito a h1 + wordmark; nunca em h3/body/controls/sidebar/tabelas. Mono = IBM Plex Mono. Nomes de entidade dinâmicos: display em sentence-case. ast-grep (`display-font-only-h1`): exceção com `// ast-grep-ignore: display-font-only-h1 <motivo>` dentro da tag de abertura, na linha logo acima do `className`.

## Gotchas

- **`bun.lock` é gitignored, então cada checkout tem o seu:** o `bun install` não sobe dependência cujo lock local ainda satisfaz o range do `package.json`, enquanto o CI resolve do zero a versão mais nova. Config ou flag que exige versão nova de ferramenta sobe o piso do range no mesmo PR (ex.: `agentGuidance` no `turbo.json` exige `turbo` `^2.11.5`; o 2.10.12 recusa a chave). Checkout com Next 16.4+ ganha um `AGENTS.md` em `apps/web` gerado pelo `next dev`; ele fica no `.gitignore` e não se commita, porque o bloco equivalente vive em `apps/web/CLAUDE.md`.
- **`createDb()` × `db` singleton:** `packages/auth/*` usa `createDb()` pra evitar ciclo de import com env; resto usa `db`. Não consolidar.
- **Hook PostToolUse (`.claude/hooks/post-edit-lint.sh`):** roda no arquivo editado o Biome, depois o `oxlint --fix` (anti-slop, só em JS e TS) e depois o ast-grep, e devolve com exit 2 o erro que nenhum fix corrige. Pode reordenar campos e quebrar `old_string` de Edits seguintes: re-ler se o Edit falhar.
- **lefthook pre-commit:** o `react-doctor` não roda no pre-commit, só no CI (consultivo, `.github/workflows/react-doctor.yml`); na raiz do monorepo ele não acha o projeto React e desliga as regras. Worktree novo: `scripts/worktree-setup.sh` liga `apps/web/.env` ao checkout principal e faz `bun install` real. ⚠️ Há **um só `pre-commit`**, em `.git/hooks` do checkout principal, para todos os worktrees. Ele roda no worktree do commit e o lefthook lê o `lefthook.yml` desse worktree. O hook procura o binário nesta ordem: `LEFTHOOK_BIN`, `lefthook` do `PATH`, o caminho absoluto gravado pelo último `bun install` (o `prepare` roda `lefthook install`), e o `node_modules` do worktree do commit. Apagar o worktree que instalou por último faz o hook cair no `node_modules` do worktree do commit, até o próximo `bun install` regravar o caminho. Num worktree sem `node_modules`, o hook imprime `Can't find lefthook in PATH`, sai com 0 e o commit passa sem check. Para remover o hook de qualquer worktree: `hooks="$(git rev-parse --git-common-dir)/hooks"; for h in "$hooks"/*; do grep -qil lefthook "$h" && rm -f "$h"; done` (reinstala no próximo `bun install`).
- **Anti-slop (Oxlint) roda ao lado do Biome.** As regras estão vendorizadas em `tools/oxlint/anti-slop/` (origem no `UPSTREAM.md`) e a severidade vive no `.oxlintrc.json`. O código é o mesmo do ecommerce; a configuração do `.oxlintrc.json` difere. O plugin próprio `emach` (`tools/oxlint/emach/`, origem e desvios no `UPSTREAM.md` dele) veio do ecommerce: `no-regexp-in-loop` em `error` e `require-log-in-action-catch` em `warn` até zerar a dívida, adaptada ao `logger` de `@/lib/logger`. Os testes dele rodam com `bun run test:lint-rules` (Node 24 ou superior), que o `bun verify` e o CI chamam. Todas as outras regras estão em `error`; regra nova com dívida entra como `warn` só até zerar. `no-module-mocking` fica desligada de propósito, porque o teste unit mocka `@emach/db`. O oxlint roda sob Bun (`bun node_modules/.bin/oxlint`, nos scripts `lint:slop` e `fix:slop`): o `bun run oxlint` entrega o bin ao Node, que pode não carregar o `index.ts`. O `bun check` roda o anti-slop depois do `ultracite check`, e o pre-commit roda `fix:slop` depois do Biome (`lint-fix`), só nos staged. O `fix` continua só Biome porque o hook PostToolUse passa flags do Biome a ele; o hook roda o `oxlint --fix` à parte. `packages/db/src/{schema,queries}` entra no lint aqui; o ecommerce ignora esses caminhos porque os recebe pelo sync.
- **Server actions com upload base64:** limite Next 16 default é 1MB. Configurado em `apps/web/next.config.ts` como `experimental.serverActions.bodySizeLimit = "8mb"`.
- **Drizzle-kit push + TTY:** rename ambíguo de coluna falha sem TTY. O ADR-0030 evita o prompt: rename vira expand-contract (coluna nova, backfill, drop da antiga em PR separado), sem rename direto. Dropar+recriar o schema continua destrutivo no banco único: só com autorização explícita do user na sessão.
- **`db.execute()` raw devolve timestamp como string** (drizzle 0.45.x bug). Coercer com `toDate` de `@emach/db/utils` no boundary. Detalhes em `packages/db/CLAUDE.md`.
- **IDs:** `crypto.randomUUID()` no caller (server actions/scripts) — sem nanoid.
- **Deploy Vercel:** funções DEVEM rodar em `gru1` (`"regions": ["gru1"]` no `apps/web/vercel.json`) — no default `iad1` cada query ao Supabase sa-east-1 paga ~140ms e a navegação RSC chega a 1,9s (incidente 2026-07-28). A região do **build** (`iad1` no log) é outra coisa e não importa. A produção sai do repo espelho `emach-ferramentas/emach-dashboard`, que o `mirror.yml` empurra a cada merge na main. Run vermelho do mirror quer dizer que a main não chegou em produção. Sem `MIRROR_TOKEN`, o run falha. O PAT é da conta `emach-ferramentas` com Contents e Workflows: Read and write; a conta `othavi0` só tem `pull` no espelho. Deploy manual: `npx vercel deploy --prod` (projeto `emach-dashboard`, scope `emach-s-projects`) — exige o `.vercelignore` da raiz (limite Vercel de 100MB/arquivo; caches `.next`/`.turbo` estouram).
- **`.vercelignore` apaga `.git` → `prepare` não pode exigir git (build quebrado 2026-07-30):** o `.vercelignore` é aplicado **depois do clone**, inclusive no build git-triggered, então `lefthook install` puro no `prepare` matava o `bun install` com `exit status 128` antes de compilar. `prepare` agora é guardado por `git rev-parse --git-dir`. Qualquer script novo no `prepare` que dependa de `.git` volta a quebrar o deploy.

## Smoke run-time

`bun check-types` não detecta SQL inválido em template strings nem queries com colunas removidas. Após mexer em schema/queries SSR: subir o dev server (`PORT=<n> bun dev:web`) e visitar as rotas afetadas. Stack trace rápido via `nextjs_call <port> get_errors` (MCP `next-devtools`).

`check-types` (tsc) também **não pega regras de lint** (`useAwait`, `noNestedTernary`, etc.). Antes de commitar ou abrir PR: **`bun verify`**. Ele roda os mesmos gates do CI, na mesma ordem: check-types, check, test:lint-rules, check:docs, os testes de `scripts/` (`bun test ./scripts/`), ruff, guard:forms, self-test do ast-grep, test, `scripts/test-hooks.sh` e o `next build` do `apps/web` (por `scripts/run-capped.sh`). Todos rodam com o env dummy de `scripts/ci-dummy.env`, então nenhum conecta no banco único. A lista vive só em `scripts/verify.sh`, e o `ci.yml` só chama `bun run verify`. Gate novo entra no script. Exceção: warnings que o código canônico de referência também tem (ex: `role="button"` em card clicável, nested-ternary em header contextual de detalhe espelhando `branches`) — manter por consistência, não corrigir divergindo do padrão.

O `bun run check:docs` (`scripts/check-doc-paths.ts`) lê os `.md` rastreados, menos skills, plans, superpowers e o anti-slop vendorizado. Ele confere os caminhos citados (com ou sem barra, inclusive arquivos da raiz e de `tools/`), cada `bun <script>` contra os `package.json` e o `node_modules/.bin`, citação de número de linha depois do nome de arquivo, a tabela de ownership do contrato contra os `pgTable`, as linhas marcadas com `<!-- sync-paths -->` e o body do PR de sync contra o `paths:` do `sync-db-schema.yml`, e cada script `db:*` contra o `packages/db/CLAUDE.md`. Em `docs/adr/` e `docs/audits/`, caminho quebrado e citação de linha saem como aviso (`warned=`), sem mudar o exit code.

Linha que cita o ecommerce, ou que menciona de propósito um arquivo removido (com "removid", "apagad", "não usa", "não existe", "histórico do git" ou o marcador `<!-- check-docs: ignore -->`), não tem os caminhos conferidos.

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
