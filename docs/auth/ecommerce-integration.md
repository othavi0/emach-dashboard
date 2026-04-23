# Integração `@emach/auth/ecommerce` no App Ecomerce

Guia passo-a-passo para plugar a stack better-auth do ecomerce num novo app Next.js (futuro `apps/ecommerce` ou similar). O schema e a instância better-auth já existem em `packages/auth/src/ecommerce.ts` e `packages/db/src/schema/client.ts`.

---

## 1. Adicionar dependências no novo app

No `apps/<ecommerce>/package.json`:

```json
{
  "dependencies": {
    "@emach/auth":  "workspace:*",
    "@emach/db":    "workspace:*",
    "@emach/env":   "workspace:*",
    "better-auth":  "catalog:",
    "next":         "catalog:",
    "react":        "catalog:",
    "react-dom":    "catalog:"
  }
}
```

Rodar `bun install` na raiz do monorepo.

---

## 2. Configurar variáveis de ambiente

No `.env` do app ecomerce:

```bash
DATABASE_URL="postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres"
BETTER_AUTH_SECRET="<32+ chars — MESMO secret do dashboard, apps em subdomínios>"
BETTER_AUTH_URL_ECOMMERCE="https://loja.emach.com.br"   # URL pública do app ecomerce
ECOMMERCE_ORIGIN="https://loja.emach.com.br"             # trustedOrigins do better-auth
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service role>"
# Dashboard fields não precisam vazar aqui. CORS_ORIGIN pode ficar undefined.
```

> Em dev local: `BETTER_AUTH_URL_ECOMMERCE=http://localhost:3002` e porta distinta do dashboard (`3001`).

---

## 3. Route handler Next.js (catch-all better-auth)

`apps/<ecommerce>/src/app/api/auth/[...all]/route.ts`:

```ts
import { authEcommerce } from "@emach/auth/ecommerce";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(authEcommerce);
```

---

## 4. Helpers de sessão server-side

`apps/<ecommerce>/src/lib/session.ts`:

```ts
import { authEcommerce, type EcommerceSession } from "@emach/auth/ecommerce";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const getCurrentClient = async (): Promise<EcommerceSession | null> => {
  return authEcommerce.api.getSession({ headers: await headers() });
};

export const requireCurrentClient = async (): Promise<EcommerceSession> => {
  const session = await getCurrentClient();
  if (!session?.user) redirect("/entrar");
  return session;
};
```

---

## 5. Client SDK (React)

`apps/<ecommerce>/src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_ECOMMERCE_AUTH_URL, // ex.: https://loja.emach.com.br
});

export const { signIn, signOut, signUp, useSession } = authClient;
```

Expor `NEXT_PUBLIC_ECOMMERCE_AUTH_URL` no `.env` (mesma URL de `BETTER_AUTH_URL_ECOMMERCE`).

---

## 6. Middleware de proteção

`apps/<ecommerce>/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/conta", "/pedidos", "/checkout"];

export function middleware(req: NextRequest) {
  const isProtected = PROTECTED.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // cookies do ecomerce: prefix "ecommerce" (veja advanced.cookiePrefix em ecommerce.ts)
  const token = req.cookies.get("ecommerce.session_token");
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("redirect", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/conta/:path*", "/pedidos/:path*", "/checkout/:path*"] };
```

---

## 7. Signup com CPF/CNPJ

Better-auth não valida documento. Validar no server action **antes** de chamar `authEcommerce.api.signUpEmail`:

```ts
import { z } from "zod";
import { authEcommerce } from "@emach/auth/ecommerce";

const onlyDigits = (s: string) => s.replace(/\D/g, "");

// Implemente CPF/CNPJ real com dígito verificador (use lib tipo brazilian-values)
const isValidCpfCnpj = (doc: string) => onlyDigits(doc).length === 11 || onlyDigits(doc).length === 14;

const signupSchema = z.object({
  name:     z.string().min(2),
  email:    z.email(),
  password: z.string().min(8),
  phone:    z.string().optional(),
  document: z.string().optional().refine((d) => !d || isValidCpfCnpj(d), "CPF/CNPJ inválido"),
});

export async function signup(formData: FormData) {
  const input = signupSchema.parse(Object.fromEntries(formData));
  const normalized = { ...input, document: input.document ? onlyDigits(input.document) : undefined };

  await authEcommerce.api.signUpEmail({ body: normalized });
}
```

---

## Footguns (ler antes de ir p/ prod)

### Cookies — subdomínios
- Dashboard roda em `admin.emach.com.br`, ecomerce em `loja.emach.com.br` → cookies já isolados por host.
- **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"` em ambos lados — vaza sessão entre apps.
- Se um dia precisar compartilhar sessão (SSO interno), use prefixos distintos **e** domains distintos.
- Dashboard: cookie prefix padrão (ex.: `better-auth.session_token`). Ecomerce: `ecommerce.session_token`.

### Schema — importação cruzada
- **NUNCA** importar `@emach/db/schema/auth` no app ecomerce.
- **NUNCA** importar `@emach/db/schema/client` no dashboard.
- Lint rule sugerida: restrict `no-restricted-imports` por app.

### drizzleAdapter.schema
- Passar SÓ as 4 tabelas do domínio (`client`, `clientSession`, `clientAccount`, `clientVerification`) — não espalhar schema inteiro. Better-auth resolve FKs via keys do objeto; keys extras podem causar conflito.
- Keys do objeto schema devem bater com `modelName` configurado (`client`, `clientSession`, etc).

### trustedOrigins
- Cada instância tem seu próprio: `authDashboard` → `CORS_ORIGIN`; `authEcommerce` → `ECOMMERCE_ORIGIN`.
- Nunca compartilhar array — request do dashboard não deve ser válido no ecomerce e vice-versa.

### CPF/CNPJ unique
- Coluna `document` é `unique`. Better-auth não valida formato/dígito verificador — validar no app (zod + função CPF/CNPJ).
- Sempre normalizar (só dígitos) antes de salvar. Aceitar input com máscara, persistir sem.

### Email cross-domain
- Admin e client podem ter o mesmo email (tabelas isoladas). Isso é feature, não bug.
- Se quiser impedir: validar via query cross-table no signup.

### Tipos de sessão
- `EcommerceSession` (de `@emach/auth/ecommerce`) vs `DashboardSession` (de `@emach/auth/dashboard`) — nunca misturar.
- Importar só o do app em uso. TypeScript não pega erro lógico se você passar um pro outro.

### Password reset / email verification
- Templates e URLs separados por domínio. Ex.: ecomerce usa `https://loja.emach.com.br/recuperar-senha?token=...`.
- Configurar `emailAndPassword.sendResetPassword` e `emailVerification.sendVerificationEmail` em cada instância com seus próprios templates.

### Rate limit
- Ativar antes de prod. Better-auth suporta nativo:
```ts
rateLimit: { window: 60, max: 100, storage: "memory" } // ou "database" p/ multi-instance
```

### Roles no client
- Tabela `client` **não tem** campo `role`. Se precisar (ex.: "client premium"), adicionar coluna separada. Não reusar `user.role` do dashboard.

### Migrations em prod
- Schema é compartilhado — cuidado ao rodar `drizzle-kit push` em prod. Use `drizzle-kit generate` + migrations versionadas quando ecomerce for live.
- Wipe (`--force`) só em dev/staging.

### Secret compartilhado
- Atualmente aceitável (subdomínios distintos, cookies isolados). Se separar em clusters/regiões no futuro, gerar secrets distintos via `BETTER_AUTH_SECRET_DASHBOARD` e `BETTER_AUTH_SECRET_ECOMMERCE`.

### Supabase RLS nas tabelas client*
- Supabase ativa RLS automaticamente em novas tabelas. `client`, `client_session`, `client_account`, `client_verification`, `client_address` já estão com `rls_enabled: true`.
- **Não afeta better-auth** porque a connection via `DATABASE_URL` usa role `postgres` (superuser) que bypassa RLS.
- **Afeta qualquer query via PostgREST/supabase-js** com `anon` ou `authenticated` key — sem políticas, retorna vazio.
- Se o app ecomerce precisar queries diretas via `supabase-js` (ex.: listar endereços do cliente logado no front), criar policies explícitas. Ex.:
```sql
create policy "clients can read own addresses"
on public.client_address for select
using (client_id = auth.uid()::text);
```
- Tabelas dashboard (`user`, `session`, etc) **não** têm RLS — acesso só via server (DATABASE_URL direct). Mantém-se o padrão.

### CSRF / cross-site
- Better-auth tem CSRF protection nativo. Não desabilitar (`advanced.disableCSRFCheck: true`) em prod.

### Sessão de admin no ecomerce
- Admins do dashboard **não** têm acesso ao app ecomerce como clients automaticamente — contas são separadas por design. Se quiser impersonação admin→client, implementar fluxo explícito (nunca reusar session token entre instâncias).
