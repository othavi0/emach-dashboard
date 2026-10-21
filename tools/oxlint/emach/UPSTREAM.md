# Plugin oxlint `emach`

- Origem: `othavi0/emach-ecommerce`, `tools/oxlint/emach/`.
- Commit: `86e38b5699e598264baea9e4ac73e5d5dab867b8` (o plugin não muda desde `8791d36`, PR #272 do ecommerce).
- Copiado em: 2026-10-15.
- Arquivos: `index.ts`, `rules/no-regexp-in-loop.ts`, `rules/require-log-in-action-catch.ts` e os dois `.test.ts`.
- Dependências: `oxlint` e `@oxlint/plugins` 1.78.0, os mesmos do ecommerce. A regra de catch importa `resolveVariable` de `../../anti-slop/shared/scope.ts`.

## Desvios locais

- `require-log-in-action-catch` procura o logger daqui. O ecommerce aceita `log.error` de `@/lib/evlog`. O dashboard aceita `logger.error` de `@/lib/logger` (import direto, renomeado ou `import * as l` com `l.logger.error`). `log` de `@/lib/evlog` não conta mais. O dashboard também aceita `return safeRequireRole("nomeDaAction", e)` de `@/lib/action-error`, que loga a negação de capability com `logger.warn` e relança o resto.
- A mensagem da regra de catch cita `logger.error("nomeDaAction", err)` e a seção "Server actions" do `apps/web/CLAUDE.md`.
- O teste da regra de catch usa `logger` nos mesmos casos do original e ganha três: `actionErrorMessage` sem log, `log` de `@/lib/evlog` e namespace com chave computada.
- Severidade em `.oxlintrc.json`: `no-regexp-in-loop` em `error`, como no ecommerce. `require-log-in-action-catch` também em `error`, desde que a dívida de catches sem log zerou (#429). No ecommerce as duas estão em `error`.
- `no-regexp-in-loop` é cópia sem mudança.

## Testes

`bun run test:lint-rules` roda os dois `.test.ts` com Node 24 ou superior (`RuleTester` de `oxlint/plugins-dev`). O CI roda o mesmo script.

## Atualizar

Comparar com `tools/oxlint/emach/` do ecommerce num commit explícito, portar as mudanças preservando os desvios acima e atualizar este arquivo.
