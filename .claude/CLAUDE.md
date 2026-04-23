# Auth Architecture

Dois better-auth paralelos, totalmente isolados, compartilhando o mesmo banco Supabase.

## Instâncias

| Instância | Package import | Tabelas | Consumers |
|---|---|---|---|
| Dashboard (funcionários internos — roles admin/manager/user) | `@emach/auth/dashboard` → `authDashboard`, `DashboardSession` | `user`, `session`, `account`, `verification` | `apps/web` |
| Ecomerce (clientes finais BR) | `@emach/auth/ecommerce` → `authEcommerce`, `EcommerceSession` | `client`, `clientSession`, `clientAccount`, `clientVerification`, `clientAddress` | `apps/<ecommerce>` (futuro) |

## Schema

- `packages/db/src/schema/auth.ts` — tabelas dashboard (nomes better-auth padrão).
- `packages/db/src/schema/client.ts` — tabelas ecomerce + `clientAddress` com campos BR (`country` default `"BR"`, etc).
- `client` extras: `phone` (nullable), `document` (CPF/CNPJ, text unique nullable).
- Roles do dashboard: `user.role = "admin" | "manager" | "user"` (extensível — novas roles tipo `stockist` virão depois). `client` **não** tem coluna `role`.

## Cookies / isolamento

- `authDashboard` usa cookie prefix padrão; `authEcommerce` usa `cookiePrefix: "ecommerce"`.
- Apps rodam em subdomínios distintos — cookies isolados por host. **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"`.
- `BETTER_AUTH_SECRET` compartilhado (ok enquanto apps em subdomínios).
- `trustedOrigins`: `authDashboard` → `CORS_ORIGIN`; `authEcommerce` → `ECOMMERCE_ORIGIN`.

## Env vars

- `DATABASE_URL`, `BETTER_AUTH_SECRET` — compartilhadas.
- `BETTER_AUTH_URL` + `CORS_ORIGIN` — dashboard.
- `BETTER_AUTH_URL_ECOMMERCE` + `ECOMMERCE_ORIGIN` — ecomerce (optional no env central; obrigatórias no app ecomerce).

## Regras invioláveis

1. **Nunca importar schema do domínio oposto.** `apps/web` (dashboard) nunca importa `@emach/db/schema/client`. App ecomerce nunca importa `@emach/db/schema/auth`.
2. **Nunca misturar tipos de sessão** — `DashboardSession` ≠ `EcommerceSession`.
3. **Validação CPF/CNPJ é responsabilidade do app** (zod refine com dígito verificador) — better-auth não valida. Sempre normalizar (só dígitos) antes de persistir.
4. **Migrations em prod**: usar `drizzle-kit generate` + migration versionada. `--force` só em dev/staging.

Guia completo de integração do ecomerce (passo-a-passo + footguns detalhados): `docs/auth/ecommerce-integration.md`.

---

# Project Context

## Stack

- Monorepo Bun workspaces + Turborepo. `apps/web` (Next 16, React 19), `packages/db` (Drizzle + Postgres/Supabase), `packages/auth` (Better Auth), `packages/env`, `packages/ui`.
- IDs gerados via `crypto.randomUUID()` em server actions/scripts (sem nanoid).
- DB workflow: edit schema em `packages/db/src/schema/*.ts` → `bun db:push` (dev) ou `bun db:generate` + `bun db:migrate` (prod). Env vem de `apps/web/.env`.

## Schema `tool` (campos-chave)

Arquivos: `packages/db/src/schema/tools.ts`, `inventory.ts`, `stock-movements.ts`, `promotions.ts`.

Tabela `tool` inclui:
- Identificação: `sku` (unique), `model` (curto, agrupa variantes de voltagem), `invoiceModel` (código fábrica, não-unique — repete legitimamente), `barcode` (unique), `manufacturerName`, `countryOfOrigin`.
- Classificação: `productType` enum `'machine'|'equipment'|'part'|'accessory'`, `status` enum `'draft'|'active'|'discontinued'|'out_of_stock'`.
- Fiscais: `hsCode`, `ncm`, `cest`.
- Físicos: `weightKg`, `lengthCm`, `widthCm`, `heightCm`.
- Técnicos: `voltage`, `powerWatts`, `frequencyHz`, `warrantyMonths`.
- Visibilidade site pública = `status = 'active' AND visibleOnSite = true` (coexistem).

Variantes de voltagem (127V/220V) = rows `tool` separadas compartilhando `model`. Não há tabela `tool_variant`.

`stock_level` tem `minQty` + `reorderPoint` por filial (check `reorder >= min`).

---

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.
