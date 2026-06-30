# Plan 027: Adicionar headers de segurança (CSP report-only, X-Frame-Options, nosniff, Referrer-Policy)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 79379ef5..HEAD -- \
>   apps/web/next.config.ts
> ```
> If `apps/web/next.config.ts` changed since commit `79379ef5`, compare the
> "Current state" excerpt below against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

O dashboard é uma superfície admin interna com PII sensível (CPF/CNPJ,
endereços, dados de clientes e receita). Sem headers de segurança, um XSS
pode exfiltrar esses dados sem restrição de origem, qualquer site pode embutir
o dashboard em iframe (clickjacking), e o browser pode inferir tipo de um
upload malicioso servido pelo bucket Supabase. Os três headers básicos
(`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) têm risco
quase zero de quebrar o app e eliminam classes inteiras de ataque. A
`Content-Security-Policy` é adicionada em modo `Report-Only` para mapear
violações reais antes de qualquer bloqueio — o app continua funcionando
normalmente enquanto as violações são visíveis no DevTools/console do browser.

## Current state

### Arquivos relevantes

- `apps/web/next.config.ts` — configuração do Next.js; **não** exporta `headers()`; não há `middleware.ts` em lugar algum no app. É o único arquivo a modificar.
- `apps/web/vercel.json` — contém apenas a configuração de cron (`/api/cron/cancel-stale-orders`); não tem seção `headers`. Não modificar.

### Estado atual de `apps/web/next.config.ts` (linhas 1–47)

```ts
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: null;

const nextConfig: NextConfig = {
	// typedRoutes temporariamente desabilitado durante Phase 1 foundation — muitas rotas
	// criadas antes de seus pages existirem (stock, categories, suppliers, branches).
	// Re-habilitar na Phase 2 quando todos os pages estiverem populados.
	typedRoutes: false,
	reactCompiler: true,
	experimental: {
		serverActions: {
			// Banners aceitam master de alta qualidade (fundo/produto até 4MB).
			// Margem para o overhead do multipart FormData acima do maior cap.
			bodySizeLimit: "8mb",
		},
		optimizePackageImports: [
			"recharts",
			"motion",
			"lucide-react",
			"@dnd-kit/core",
			"@dnd-kit/sortable",
			"@dnd-kit/utilities",
		],
	},
	images: supabaseHostname
		? {
				remotePatterns: [
					{
						protocol: "https",
						hostname: supabaseHostname,
						pathname: "/storage/v1/object/public/**",
					},
				],
			}
		: undefined,
};

export default withBundleAnalyzer(nextConfig);
```

**Confirmação:** não há `headers()` async nesse arquivo. Não há `src/middleware.ts` nem `apps/web/src/middleware.ts`.

### Fontes externas identificadas no app

| Tipo       | Origem                                           | Notas                                                                                                           |
|------------|--------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `img-src`  | `${supabaseHostname}` (Storage público)          | `NEXT_PUBLIC_SUPABASE_URL` em runtime; já disponível como `supabaseHostname` no config                        |
| `connect-src` | `${supabaseHostname}` (REST/Realtime/Storage API) | `supabase-browser.ts` usa `createClient(url, …)` para upload de imagens                                     |
| `font-src` / `style-src` | Nenhuma externa — `next/font/google` auto-hospeda as fontes em build time (Barlow, Barlow Condensed, IBM Plex Mono) | Verificado: nenhuma referência a `fonts.googleapis.com` / `fonts.gstatic.com` no bundle de runtime |
| `script-src` | `'self'` + Next.js inline scripts de hydration  | Next.js 16 injeta `<script>` inline no HTML para passar server state ao cliente — exige `'unsafe-inline'` **ou** nonces no script-src; usar `'unsafe-inline'` no report-only por ora |
| `style-src` | `'self'` + 31 ocorrências de `style={{...}}` em JSX | React renderiza inline styles como atributo `style=` no DOM, **não** como `<style>` tags — não precisam de `'unsafe-inline'` no `style-src` |
| `img-src`  | `https://i.pravatar.cc` — apenas em `/design` (página interna, `robots: noindex`) | Incluir no CSP report-only para não gerar ruído |

> **Nota sobre HSTS:** Não configurar aqui — o Vercel CDN já serve o header
> `Strict-Transport-Security` automaticamente em produção. Adicionar via
> `headers()` no Next.js seria redundante e poderia interferir em dev HTTP.

### Convenção de commit

Conventional Commits em PT, subject ≤ 50 chars. Exemplo do repo:
`docs(perf): planos de auditoria + skill improve (#218)`

## Commands you will need

| Purpose    | Command                                      | Expected on success          |
|------------|----------------------------------------------|------------------------------|
| Typecheck  | `bun check-types`                            | exit 0, sem erros            |
| Lint       | `bun check`                                  | exit 0                       |
| Guard forms| `bun guard:forms`                            | exit 0                       |
| Testes     | `bun --cwd apps/web test`                    | exit 0, ≥ 359 testes passando|
| Build      | `bun run --cwd apps/web build`               | exit 0                       |

## Scope

**In scope** (único arquivo a modificar):
- `apps/web/next.config.ts`

**Out of scope** (não tocar):
- `apps/web/vercel.json` — headers no Next.js já cobrem todas as rotas; não duplicar em Vercel config.
- Qualquer arquivo de middleware — não existe hoje; não criar.
- `packages/**` — nenhuma mudança de pacote.
- CSP em modo `enforce` (`Content-Security-Policy` sem `-Report-Only`) — explicitamente fora desta tarefa; só após análise dos relatórios de violação.
- HSTS — já servido pelo Vercel CDN.

## Git workflow

- Branch: `advisor/027-security-response-headers`
- Um único commit após o build verde: `security: adicionar headers de segurança (report-only CSP)`
- **Não** fazer push nem abrir PR.

## Steps

### Step 1: Ler o arquivo antes de editar

Leia `apps/web/next.config.ts` completo com a ferramenta `Read` (nunca editar de memória).

**Verify**:
```bash
git -C /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard \
  diff --stat 79379ef5..HEAD -- apps/web/next.config.ts
```
→ saída vazia (nenhuma linha modificada desde que o plano foi escrito). Se houver saída, compare o arquivo lido contra o excerpt em "Current state" — qualquer divergência é STOP.

---

### Step 2: Criar branch

```bash
git -C /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard \
  checkout -b advisor/027-security-response-headers
```

**Verify**: `git branch --show-current` → `advisor/027-security-response-headers`

---

### Step 3: Adicionar `headers()` ao `next.config.ts`

Adicione a função `headers` ao objeto `nextConfig`. O trecho abaixo é o target
completo — produza exatamente este resultado para o arquivo:

```ts
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: null;

// Fontes externas para a CSP.
// next/font/google auto-hospeda Barlow/Barlow Condensed/IBM Plex Mono em build time —
// nenhuma requisição a fonts.googleapis.com ou fonts.gstatic.com em runtime.
// Supabase Storage é a única origem externa de imagens e conexões API.
const cspConnectSrc = supabaseHostname
	? `'self' https://${supabaseHostname}`
	: "'self'";
const cspImgSrc = supabaseHostname
	? `'self' data: https://${supabaseHostname} https://i.pravatar.cc`
	: "'self' data: https://i.pravatar.cc";

// Content-Security-Policy em Report-Only: não bloqueia nada, só reporta
// violações no DevTools (aba Console / Network). Permite mapear inline scripts
// do Next.js e outras fontes antes de habilitar enforce.
// ATENÇÃO: 'unsafe-inline' em script-src é necessário para o Next.js 16
// (injeta scripts inline de hydration). Não remover sem nonce/hash strategy.
const cspDirectives = [
	"default-src 'self'",
	`script-src 'self' 'unsafe-inline'`,
	`style-src 'self' 'unsafe-inline'`,
	`img-src ${cspImgSrc}`,
	`font-src 'self'`,
	`connect-src ${cspConnectSrc}`,
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
	// Impede que o dashboard seja embutido em iframe em qualquer origem
	// (clickjacking). Redundante com frame-ancestors na CSP, mas frame-ancestors
	// não é suportado por IE11 — manter ambos por defesa em profundidade.
	{ key: "X-Frame-Options", value: "DENY" },
	// Impede que o browser infira Content-Type de respostas (MIME sniffing).
	// Crítico para uploads servidos pelo bucket Supabase sem tipo forçado.
	{ key: "X-Content-Type-Options", value: "nosniff" },
	// Envia apenas origem (sem path/query) em requisições cross-origin.
	// Protege URLs internas do dashboard de vazar em referer para terceiros.
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	// CSP em modo report-only: não bloqueia, apenas reporta no DevTools.
	// Habilitar enforce (Content-Security-Policy) é tarefa separada após
	// analisar os relatórios de violação.
	{ key: "Content-Security-Policy-Report-Only", value: cspDirectives },
];

const nextConfig: NextConfig = {
	// typedRoutes temporariamente desabilitado durante Phase 1 foundation — muitas rotas
	// criadas antes de seus pages existirem (stock, categories, suppliers, branches).
	// Re-habilitar na Phase 2 quando todos os pages estiverem populados.
	typedRoutes: false,
	reactCompiler: true,
	experimental: {
		serverActions: {
			// Banners aceitam master de alta qualidade (fundo/produto até 4MB).
			// Margem para o overhead do multipart FormData acima do maior cap.
			bodySizeLimit: "8mb",
		},
		optimizePackageImports: [
			"recharts",
			"motion",
			"lucide-react",
			"@dnd-kit/core",
			"@dnd-kit/sortable",
			"@dnd-kit/utilities",
		],
	},
	images: supabaseHostname
		? {
				remotePatterns: [
					{
						protocol: "https",
						hostname: supabaseHostname,
						pathname: "/storage/v1/object/public/**",
					},
				],
			}
		: undefined,
	async headers() {
		return [
			{
				// Aplicar a todas as rotas
				source: "/(.*)",
				headers: securityHeaders,
			},
		];
	},
};

export default withBundleAnalyzer(nextConfig);
```

**Pontos críticos da edição:**
- Inserir as constantes `cspConnectSrc`, `cspImgSrc`, `cspDirectives`, e `securityHeaders` **antes** do objeto `nextConfig`.
- Adicionar a propriedade `async headers()` **dentro** do objeto `nextConfig`, após a propriedade `images`.
- Preservar exatamente os comentários e a indentação de tab existentes (o autoformat do hook PostToolUse pode ajustar — tudo bem, desde que a estrutura lógica seja preservada).

**Verify**: `bun check-types` → exit 0, sem erros de tipo em `next.config.ts`.

---

### Step 4: Verificar lint

```bash
bun check
```

**Verify**: exit 0. Se houver warnings de lint no arquivo novo, corrija antes de continuar.

---

### Step 5: Verificar guard de forms e testes

```bash
bun guard:forms && bun --cwd apps/web test
```

**Verify**: exit 0; suite de testes passa com ≥ 359 testes.

---

### Step 6: Build de produção

```bash
bun run --cwd apps/web build
```

**Verify**: exit 0. O build confirma que:
- O `headers()` async é aceito pelo Next.js 16 (tipagem `NextConfig`).
- A constante `supabaseHostname` é `null` em build (env não está setada no build CI),
  o que é esperado — o header CSP vai usar `'self'` apenas; em runtime a URL é
  resolvida pela env correta do deploy.

> **Nota sobre `supabaseHostname === null` no build**: isso é o comportamento
> correto. Em produção, `NEXT_PUBLIC_SUPABASE_URL` é uma env de runtime do
> Vercel, não injetada no build. O `headers()` no Next.js é avaliado em
> **runtime** (ao iniciar o servidor), não em build time — então o hostname
> real estará disponível quando o app iniciar. Se o build local não tiver a
> env setada, os headers CSP serão gerados com `'self'` apenas; em produção
> Vercel, com a env configurada, o hostname Supabase aparecerá. Isso é
> correto e esperado.

---

### Step 7: Commit

```bash
git -C /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard \
  add apps/web/next.config.ts && \
git -C /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard \
  commit -m "security: headers de segurança (report-only CSP)"
```

**Verify**: `git log --oneline -1` mostra o commit com a mensagem acima.

## Test plan

Esta tarefa não adiciona lógica de negócio nem modifica comportamento testável
em vitest (headers HTTP são verificados em runtime, não em unit tests). A
verificação funcional é feita pelo build verde (Step 6) e pelo smoke abaixo.

**Smoke visual (opcional mas recomendado):**
1. Rodar `bun dev:web` (ou `bun --cwd apps/web dev`).
2. Abrir `http://localhost:3000` no browser.
3. Abrir DevTools → aba Network → inspecionar qualquer response de página.
4. Confirmar que os 4 headers estão presentes:
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Content-Security-Policy-Report-Only: default-src 'self'; …`
5. Confirmar que o app carrega normalmente (report-only não bloqueia nada).
6. Abrir DevTools → Console: se aparecerem mensagens `[Report Only] Refused to …`,
   anotar a violação e registrar como follow-up (ver "Maintenance notes").
   **Não** corrigir inline — apenas documentar.

## Done criteria

Machine-checkable. TODOS devem valer:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0; ≥ 359 testes passando
- [ ] `bun run --cwd apps/web build` exits 0
- [ ] `grep -n "async headers" apps/web/next.config.ts` retorna ≥ 1 linha
- [ ] `grep -n "X-Frame-Options" apps/web/next.config.ts` retorna `DENY`
- [ ] `grep -n "X-Content-Type-Options" apps/web/next.config.ts` retorna `nosniff`
- [ ] `grep -n "Referrer-Policy" apps/web/next.config.ts` retorna `strict-origin-when-cross-origin`
- [ ] `grep -n "Content-Security-Policy-Report-Only" apps/web/next.config.ts` retorna ≥ 1 linha
- [ ] `git status` mostra apenas `apps/web/next.config.ts` modificado
- [ ] `plans/README.md` atualizado com status desta entrada (se o indexador não for separado)

## STOP conditions

Parar e reportar (não improvisar) se:

- O conteúdo de `apps/web/next.config.ts` não corresponde ao excerpt em "Current state" — o arquivo mudou desde que este plano foi escrito.
- `bun check-types` falha com erros relacionados ao tipo de `NextConfig.headers` — pode indicar mudança de API no Next.js 16; não tentar contornar sem entender.
- O build falha com erros relacionados ao `headers()` — pode indicar conflito com `withBundleAnalyzer` wrapper.
- `bun check` falha com regras de lint que não existiam antes desta edição — não silenciar com `biome-ignore` sem entender o motivo.
- O smoke visual mostra o app **não carregando** (tela branca, erro de hidratação) — report-only não deveria bloquear nada; se bloquear, o header foi escrito como `Content-Security-Policy` (enforce) por engano.
- O executor percebe que `headers()` já existe em outra camada (ex: `vercel.json` com seção `headers`, middleware existente) — não duplicar; reportar para o advisor decidir.

## Maintenance notes

**Para o dono do código após o merge:**

1. **Próximo passo natural (fora deste plano):** após rodar em produção por
   alguns dias e confirmar que não há violações inesperadas no Console do
   browser, habilitar o enforce adicionando um segundo header
   `Content-Security-Policy` com a mesma diretiva, e remover o
   `Content-Security-Policy-Report-Only`. Esta transição é uma tarefa separada
   e requer análise das violações observadas.

2. **`'unsafe-inline'` em `script-src`:** necessário para o Next.js 16, que
   injeta `<script>` inline para passar server state ao cliente. A remoção
   exige implementar nonces (via middleware gerando um nonce por request e
   passando para `<Script nonce=…>` e `<Head>`). Essa é uma tarefa de M/L
   esforço e foi explicitamente diferida.

3. **Adicionar nova origem de imagem/API:** ao integrar um serviço externo
   (ex: CDN de imagens, provedor de pagamento com JS/iframe), atualizar as
   constantes `cspConnectSrc` / `cspImgSrc` / `cspDirectives` em
   `apps/web/next.config.ts` antes de habilitar o enforce.

4. **`supabaseHostname === null` em dev sem `.env`:** se o desenvolvedor rodar
   `bun dev:web` sem `NEXT_PUBLIC_SUPABASE_URL` no `.env.local`, o CSP
   report-only vai omitir o hostname Supabase. O app em dev provavelmente já
   falha antes por outras razões (auth, DB), mas é bom saber que o CSP gerado
   não é o mesmo que em produção.

5. **`i.pravatar.cc` no `img-src`:** esta origem existe apenas em
   `apps/web/src/app/design/page.tsx:475` (página de design system interna,
   `robots: noindex`). Se essa página for removida ou migrar para imagens
   reais, remover `https://i.pravatar.cc` do CSP.

6. **Revisor no PR:** focar em confirmar que o tipo `async headers()` está
   correto para `NextConfig` (retorna `Promise<Header[]>`), e que nenhum
   header foi acidentalmente escrito como `Content-Security-Policy` enforce
   em vez de `-Report-Only`.
