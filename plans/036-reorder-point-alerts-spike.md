# Plan 036: [SPIKE/DESIGN] Documentar e esboçar cron de alerta de reorder-point

> **Executor instructions**: Este é um plano de SPIKE/DESIGN — o entregável é
> **código esqueleto + documento de design**, não uma implementação completa com
> envio real de e-mail. Siga cada passo, produza os artefatos indicados, e
> registre as open questions listadas na seção "Maintenance notes". Antes de
> escrever qualquer arquivo, execute a verificação de drift abaixo.
>
> **Drift check (run first)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/api/cron/ packages/email/src/ apps/web/vercel.json packages/db/src/queries/dashboard.ts apps/web/src/app/dashboard/stock/branch-stock-data.ts packages/db/src/schema/inventory.ts`
> Se qualquer arquivo em escopo mudou desde o commit planejado, compare os
> trechos de "Current state" contra o código vivo antes de prosseguir; em
> divergência, trate como STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

O painel já classifica variantes em `critical`/`reorder`/`ok` via
`branch-stock-data.ts:L89-107` e exibe a tabela de reposição em
`reorder-table.tsx`, mas o staff precisa abrir o dashboard manualmente para
descobrir que há itens abaixo do ponto de reposição. Sem notificação proativa,
reposições tardias geram ruptura de estoque e perda de venda. A infraestrutura
necessária (Vercel Cron, Resend/`@emach/email`, `CRON_SECRET`) já existe e está
em uso pelo job `cancel-stale-orders`. Este plano especifica o design da rota
`/api/cron/stock-alerts` e produz um esqueleto de código que pode ser aprovado e
completado em uma sessão posterior, após decisões de produto sobre cadência e
política de re-alerta.

## Current state

### Arquivos relevantes

| Arquivo | Papel |
|---|---|
| `apps/web/src/app/api/cron/cancel-stale-orders/route.ts` | Único cron existente — padrão de autenticação Bearer, loop item-a-item, `actorType: 'system'`, `logger.error` por item. **Implementar o novo cron seguindo este exemplar exatamente.** |
| `apps/web/vercel.json` | Declara os crons (`crons[].path` + `crons[].schedule`). Hoje tem apenas o cron de pedidos obsoletos. |
| `packages/db/src/queries/dashboard.ts:242-275` | `getReorderTable(db, branchId)` — já existe e retorna `ReorderRow[]` com `branchName`, `toolName`, `sku`, `quantity`, `reorderPoint`, `deficit`. **Reusar esta query como base.** |
| `packages/db/src/schema/inventory.ts:31-67` | Tabela `branch` — campos relevantes: `id`, `name`, `status`, `responsibleUserId` (FK → `user.id`, `onDelete: "set null"`). Quando `null`, não há responsável cadastrado: open question de produto. |
| `packages/db/src/schema/auth.ts:25-45` | Tabela `user` — campos relevantes: `id`, `email`, `name`, `status`. Email do responsável vem daqui. |
| `apps/web/src/app/dashboard/stock/branch-stock-data.ts:89-107` | Lógica de classificação `critical`/`reorder`/`ok`: `critical` = `qty <= min_qty` (min_qty > 0); `reorder` = `qty > min_qty AND qty <= reorder_point` (reorder_point > 0). **Alerta deve cobrir AMBAS as categorias.** |
| `packages/email/src/send.tsx` | Ponto de entrada de envio — exporta `sendInviteEmail`, `sendPasswordResetEmail`. O novo `sendStockAlertEmail` seguirá o mesmo padrão. |
| `packages/email/src/templates/invite.tsx` | Template de referência — usa `@react-email/components`, Tailwind com preset pixelBased, cor `coral: "#cc785c"`. **Novo template deve seguir este visual.** |
| `packages/email/src/client.ts` | `resend = new Resend(env.RESEND_API_KEY)` — instância singleton já configurada. |
| `packages/env/src/server.ts:26,36-37` | `CRON_SECRET: z.string().min(32)`, `RESEND_API_KEY: z.string().min(1)`, `EMAIL_FROM: z.string().min(1)` — todas já validadas. Não adicionar novas variáveis nesta etapa. |

### Trechos de código de referência

**Padrão de auth do cron** (`cancel-stale-orders/route.ts:L1-22`):
```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // … query e loop item-a-item
}
```

**Query de reorder existente** (`packages/db/src/queries/dashboard.ts:L254-265`):
```sql
SELECT b.name AS branch_name, t.name AS tool_name, tv.sku,
  sl.quantity, sl.reorder_point,
  (sl.reorder_point - sl.quantity) AS deficit
FROM stock_level sl
JOIN branch b ON b.id = sl.branch_id
JOIN tool_variant tv ON tv.id = sl.variant_id
JOIN tool t ON t.id = tv.tool_id
WHERE sl.quantity <= sl.reorder_point
  AND t.status IN ('active')
  AND b.status = 'active' [AND sl.branch_id = $branchId]
ORDER BY deficit DESC LIMIT 50
```
A query do cron **não filtra por `branchId`** (processa todas as filiais ativas) e
**não tem `LIMIT`** (ver Step 2).

**Classificação de status** (`branch-stock-data.ts:L89-107`):
```ts
// critical: qty <= min_qty (quando min_qty > 0)
// reorder:  qty > min_qty AND qty <= reorder_point (quando reorder_point > 0)
```

**Estrutura do template de e-mail** (`templates/invite.tsx:L20-65`):
JSX com `<Html lang="pt-BR">` + `<Tailwind config={{ presets: [pixelBasedPreset], theme: { extend: { colors: { coral: "#cc785c" } } } }}>` + `<Body>` + `<Container className="mx-auto max-w-xl p-6">` + `<Section>` com cabeçalho `E-MACH` em coral, heading, texto e botão coral.

**Padrão de send** (`packages/email/src/send.tsx:L7-20`):
```ts
export async function sendXEmail({ to, ... }: { to: string; ... }): Promise<void> {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: "Assunto — E-mach",
    react: <XEmail ... />,
  });
}
```

**`vercel.json` atual** (`apps/web/vercel.json`):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/cancel-stale-orders", "schedule": "0 4 * * *" }
  ]
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun check-types` | exit 0, sem erros |
| Lint | `bun check` | exit 0 (ultracite/biome) |
| Testes | `bun --cwd apps/web test` | verde (baseline ≥ 359 testes) |
| Guard de forms | `bun guard:forms` | exit 0 |
| Build | `bun run --cwd apps/web build` | exit 0 |

## Suggested executor toolkit

- Leia `apps/web/CLAUDE.md` seção **"Cron jobs (Vercel Cron)"** antes de
  escrever o handler — lista as 5 invariantes obrigatórias.
- Leia `packages/email/src/templates/invite.tsx` antes de criar o template —
  copie a estrutura exata (Tailwind preset, paleta coral, `lang="pt-BR"`).

## Scope

**In scope** (únicos arquivos a criar/modificar):
- `apps/web/src/app/api/cron/stock-alerts/route.ts` — criar (handler esqueleto)
- `packages/email/src/templates/stock-alert.tsx` — criar (template de e-mail)
- `packages/email/src/send.tsx` — modificar (adicionar `sendStockAlertEmail`)
- `apps/web/vercel.json` — modificar (adicionar entrada do novo cron)
- `apps/web/src/app/api/cron/stock-alerts/__tests__/route.test.ts` — criar (testes unitários)

**Out of scope** (não tocar, mesmo que pareça relacionado):
- `packages/db/src/queries/dashboard.ts` — `getReorderTable` é para o dashboard
  escopo-usuário; o cron usa query própria sem `LIMIT 50` e sem filtro de branch.
  Não alterar nem reusar diretamente.
- `packages/db/src/schema/inventory.ts` — sem schema new; dedupe será em memória.
- `apps/web/src/app/dashboard/_components/reorder-table.tsx` — UI não muda neste plano.
- `apps/web/src/app/dashboard/stock/branch-stock-data.ts` — data fetching de usuário, não afetado.
- Nenhuma tabela de banco nova (sem migration, sem `db:sync`).
- Envio real com política de dedupe baseada em banco — fora do escopo até decisão de produto.

## Git workflow

- Branch: `advisor/036-reorder-point-alerts-spike`
- Commits em Conventional Commits PT, subject ≤ 50 chars. Exemplos do repo:
  - `feat(cron): adicionar esqueleto de alerta de estoque`
  - `feat(email): template de alerta de reorder-point`
  - `test(cron): testes unitários do handler stock-alerts`
- **NÃO** fazer push nem abrir PR sem instrução.

## Steps

### Step 1: Criar o handler esqueleto `stock-alerts/route.ts`

Criar `apps/web/src/app/api/cron/stock-alerts/route.ts` seguindo **exatamente**
o padrão de `cancel-stale-orders/route.ts`.

O handler deve:

1. `export const dynamic = "force-dynamic"` e `export const runtime = "nodejs"` no topo.
2. Autenticar via `Authorization: Bearer ${env.CRON_SECRET}` antes de qualquer query — retornar 401 imediatamente se inválido.
3. Executar a query abaixo (raw `db.execute<StockAlertDbRow>`) para buscar
   **todas** as variantes cujo `quantity < reorder_point` em filiais ativas com
   ferramentas ativas, **sem LIMIT** (diferente da `getReorderTable` do dashboard):

```sql
SELECT
  b.id          AS branch_id,
  b.name        AS branch_name,
  b.responsible_user_id,
  u.email       AS responsible_email,
  u.name        AS responsible_name,
  t.name        AS tool_name,
  tv.sku,
  sl.quantity,
  sl.min_qty,
  sl.reorder_point,
  (sl.reorder_point - sl.quantity) AS deficit,
  CASE
    WHEN sl.quantity <= sl.min_qty AND sl.min_qty > 0 THEN 'critical'
    ELSE 'reorder'
  END AS alert_level
FROM stock_level sl
JOIN branch b ON b.id = sl.branch_id
JOIN tool_variant tv ON tv.id = sl.variant_id
JOIN tool t ON t.id = tv.tool_id
LEFT JOIN "user" u ON u.id = b.responsible_user_id
WHERE sl.quantity < sl.reorder_point
  AND sl.reorder_point > 0
  AND t.status = 'active'
  AND b.status = 'active'
ORDER BY b.id, deficit DESC
```

> **Por que `<` em vez de `<=`?** `reorder_point = 0` significa "sem ponto de
> reposição configurado" (coluna não-nullable com default 0, conforme
> `packages/db/src/schema/inventory.ts:L80`). O filtro `sl.reorder_point > 0`
> descarta variantes sem configuração e o `<` isola quem realmente precisa de
> reposição.

4. Agrupar os resultados em memória por `branch_id`. Para cada filial com itens,
   verificar se `responsible_email` não é null. Se null → logar via
   `logger.error("stockAlertsCron", { branchId, branchName, reason: "no_responsible_user" })`
   e **não enviar e-mail** (item de open question).
5. Para cada filial com e-mail responsável → chamar `sendStockAlertEmail` (ver
   Step 2). Envolver em try/catch item-a-item; logar erro por filial sem abortar
   o batch: `logger.error("stockAlertsCron", { branchId, err })`.
6. Retornar `NextResponse.json({ ok: true, emailsSent, branchesSkipped })`.

**Tipo da row intermediária** (declarar localmente no arquivo, sem exportar):
```ts
interface StockAlertDbRow extends Record<string, unknown> {
  branch_id: string;
  branch_name: string;
  responsible_user_id: string | null;
  responsible_email: string | null;
  responsible_name: string | null;
  tool_name: string;
  sku: string;
  quantity: number;
  min_qty: number;
  reorder_point: number;
  deficit: number;
  alert_level: "critical" | "reorder";
}
```

**Tipo do item agrupado por filial** (para passar ao template):
```ts
interface BranchAlertItem {
  alertLevel: "critical" | "reorder";
  deficit: number;
  quantity: number;
  reorderPoint: number;
  sku: string;
  toolName: string;
}

interface BranchAlert {
  branchId: string;
  branchName: string;
  items: BranchAlertItem[];
  responsibleEmail: string;
  responsibleName: string;
}
```

Imports necessários no handler (o pacote email exporta apenas `"./send"` como único entry — não há barrel `@emach/email`):
```ts
import { db } from "@emach/db";
import { sql } from "drizzle-orm";
import { env } from "@emach/env/server";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { sendStockAlertEmail } from "@emach/email/send"; // entry "send" do packages/email/package.json
```

Anti-patterns a evitar:
- **Nunca** `console.log/warn/error` — usar `logger` de `apps/web/src/lib/logger.ts`.
- **Nunca** `: any`, `as any`, `@ts-ignore`.
- O handler não é uma Server Action — não precisa de `requireCapability`. A
  autenticação é o Bearer check do `CRON_SECRET`.

**Verify**: `bun check-types` → exit 0

---

### Step 2: Criar o template de e-mail `stock-alert.tsx`

Criar `packages/email/src/templates/stock-alert.tsx` seguindo a estrutura de
`invite.tsx`.

Props do componente:
```ts
interface StockAlertEmailProps {
  branchName: string;
  items: Array<{
    alertLevel: "critical" | "reorder";
    deficit: number;
    quantity: number;
    reorderPoint: number;
    sku: string;
    toolName: string;
  }>;
  recipientName: string;
  dashboardUrl: string; // link para /dashboard/stock?status=critical (ou reorder)
}
```

Estrutura do e-mail:
- **Preview text**: `"Alerta de estoque baixo — filial {branchName}"`
- **Cabeçalho**: `E-MACH` em coral (`text-coral text-sm font-bold tracking-widest`)
- **Heading**: `"Estoque abaixo do ponto de reposição"`
- **Texto introdutório**: `"Olá, {recipientName}. Os itens abaixo na filial {branchName} precisam de reposição."`
- **Tabela de itens** (renderizar via elementos HTML direto, sem dependência de
  componente externo): colunas `Ferramenta`, `SKU`, `Estoque atual`,
  `Ponto de reposição`, `Déficit`. Itens com `alertLevel === "critical"` devem
  ter a linha destacada (ex: `color: "#dc2626"` inline para `Estoque atual`).
- **Botão CTA**: `"Ver estoque no painel"` → `dashboardUrl`. Estilo coral,
  igual ao botão de `invite.tsx`.
- **Rodapé**: `"Você recebeu este e-mail porque é responsável por esta filial no painel E-mach."`

Incluir `StockAlertEmail.PreviewProps` com dados fictícios (2 itens, um
`critical` e um `reorder`):
```ts
StockAlertEmail.PreviewProps = {
  branchName: "Filial Centro",
  recipientName: "João Silva",
  dashboardUrl: "https://admin.emach.com.br/dashboard/stock?status=critical",
  items: [
    { toolName: "Parafusadeira 12V", sku: "PFD-12V-001", quantity: 0, reorderPoint: 5, deficit: 5, alertLevel: "critical" },
    { toolName: "Furadeira 500W",    sku: "FUR-500W-002", quantity: 3, reorderPoint: 8, deficit: 5, alertLevel: "reorder" },
  ],
} satisfies StockAlertEmailProps;
```

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0

---

### Step 3: Registrar `sendStockAlertEmail` em `packages/email/src/send.tsx`

Adicionar ao final de `packages/email/src/send.tsx`:

```ts
import { StockAlertEmail } from "./templates/stock-alert";
import type { StockAlertEmailProps } from "./templates/stock-alert";

// ... (manter imports existentes)

export async function sendStockAlertEmail({
  to,
  branchName,
  recipientName,
  dashboardUrl,
  items,
}: {
  to: string;
  branchName: string;
  recipientName: string;
  dashboardUrl: string;
  items: StockAlertEmailProps["items"];  // importar o tipo do template
}): Promise<void> {
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `Alerta de estoque — ${branchName} — E-mach`,
    react: (
      <StockAlertEmail
        branchName={branchName}
        dashboardUrl={dashboardUrl}
        items={items}
        recipientName={recipientName}
      />
    ),
  });
}
```

> O tipo `StockAlertEmailProps` deve ser exportado do template
> (`export interface StockAlertEmailProps { ... }`) para ser importado aqui.

**Verify**: `bun check-types` → exit 0

---

### Step 4: Registrar o cron em `vercel.json`

Adicionar uma entrada ao array `crons` de `apps/web/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/cancel-stale-orders", "schedule": "0 4 * * *" },
    { "path": "/api/cron/stock-alerts",        "schedule": "0 7 * * 1" }
  ]
}
```

**Cadência proposta: toda segunda-feira às 07:00 UTC** (open question — ver
"Maintenance notes"). Escolha justificada: semanal evita spam diário; segunda
dá tempo para reposição durante a semana; 07:00 UTC = 04:00 BRT, antes do
expediente.

**Verify**: `grep -c "path" apps/web/vercel.json` → `2`

---

### Step 5: Escrever testes unitários do handler

Criar `apps/web/src/app/api/cron/stock-alerts/__tests__/route.test.ts`.

Usar como referência estrutural `apps/web/src/app/api/cron/` — o plano
`plans/024-tests-cron-cancel-stale-orders.md` mostra o padrão de mock para cron
handlers com `vi.hoisted` + `vi.mock("@emach/db")`.

Casos a cobrir:

| # | Cenário | Resultado esperado |
|---|---|---|
| 1 | Header `Authorization` ausente | 401, sem query ao DB |
| 2 | Header com secret errado | 401, sem query ao DB |
| 3 | Header correto, DB vazio (sem itens abaixo do reorder_point) | 200 `{ ok: true, emailsSent: 0, branchesSkipped: 0 }` |
| 4 | Header correto, 1 filial com responsável, 2 itens | 200 `{ ok: true, emailsSent: 1, branchesSkipped: 0 }`, `sendStockAlertEmail` chamado 1× |
| 5 | Filial sem `responsibleUserId` (null) | `emailsSent: 0, branchesSkipped: 1`, `logger.error` chamado com `reason: "no_responsible_user"` |
| 6 | `sendStockAlertEmail` lança erro | 200 (batch não aborta), `logger.error` chamado por filial, `emailsSent` conta só as bem-sucedidas |
| 7 | 2 filiais, 1 com responsável e 1 sem | `emailsSent: 1, branchesSkipped: 1` |

Mock de `@emach/email/send` para `sendStockAlertEmail` (o pacote exporta `"./send"` como único entry — `package.json` do pacote email confirma):
```ts
vi.mock("@emach/email/send", () => ({
  sendStockAlertEmail: vi.fn().mockResolvedValue(undefined),
}));
```

**Verify**: `bun --cwd apps/web test stock-alerts` → todos os casos passam

---

### Step 6: Verificação final integrada

Rodar todos os checks em sequência e confirmar cada um:

```bash
bun check-types
bun check
bun --cwd apps/web test
bun guard:forms
```

Inspecionar `git status` — apenas os 5 arquivos em escopo devem aparecer como
modificados/criados. Nenhum outro arquivo.

**Verify**: todos os comandos acima retornam exit 0; `git status` lista
exclusivamente os 5 arquivos em escopo.

---

### Step 7: Commitar o esqueleto

```bash
git add apps/web/src/app/api/cron/stock-alerts/ \
        packages/email/src/templates/stock-alert.tsx \
        packages/email/src/send.tsx \
        apps/web/vercel.json
git commit -m "feat(cron): esqueleto de alerta de reorder-point"
git add apps/web/src/app/api/cron/stock-alerts/__tests__/
git commit -m "test(cron): testes do handler stock-alerts"
```

**Verify**: `git log --oneline -3` mostra os 2 novos commits.

## Test plan

Todos os testes ficam em:
`apps/web/src/app/api/cron/stock-alerts/__tests__/route.test.ts`

Padrão de mock a seguir: `plans/024-tests-cron-cancel-stale-orders.md` (plano
que documenta o padrão de teste do cron existente) + exemplar estrutural em
`apps/web/src/app/dashboard/_components/__tests__/activity.test.ts` para uso de
`vi.hoisted` + `vi.mock`.

7 casos listados no Step 5. Nenhum teste de integração real (sem hit ao DB ou
Resend em CI).

**Comando**: `bun --cwd apps/web test stock-alerts` → 7 testes passando.

## Done criteria

Todos devem ser verdadeiros simultaneamente:

- [ ] `bun check-types` → exit 0
- [ ] `bun check` → exit 0
- [ ] `bun --cwd apps/web test` → exit 0; suíte cresce de ≥359 para ≥366 testes
- [ ] `bun guard:forms` → exit 0
- [ ] Arquivo `apps/web/src/app/api/cron/stock-alerts/route.ts` existe e contém `Bearer ${env.CRON_SECRET}`
- [ ] Arquivo `packages/email/src/templates/stock-alert.tsx` existe e exporta `StockAlertEmail` + `StockAlertEmailProps`
- [ ] `grep -n "sendStockAlertEmail" packages/email/src/send.tsx` retorna ≥1 match
- [ ] `grep -n "stock-alerts" apps/web/vercel.json` retorna ≥1 match
- [ ] `grep -rn "console\." apps/web/src/app/api/cron/stock-alerts/` → sem matches
- [ ] `grep -rn ": any\|as any\|@ts-ignore" apps/web/src/app/api/cron/stock-alerts/ packages/email/src/templates/stock-alert.tsx` → sem matches
- [ ] `git status` lista apenas os 5 arquivos em escopo; nenhum outro modificado
- [ ] `plans/README.md` com status row deste plano atualizada para `DONE`

## STOP conditions

Parar e reportar (não improvisar) se:

- O código nos trechos de "Current state" divergir do código vivo após o drift
  check (ex: `cancel-stale-orders/route.ts` tiver padrão de auth diferente).
- `bun check-types` falhar por mais de 2 tentativas de correção razoáveis num
  mesmo step.
- O build falhar com `Module not found: Can't resolve 'net'/'tls'` — indica que
  `@emach/db` foi importado diretamente em contexto de Client Component; revisar
  imports.
- Algum step exigir modificar `packages/db/src/queries/dashboard.ts` ou criar
  tabela nova — está fora do escopo aprovado; parar e perguntar.
- A verificação de que `bun --cwd apps/web test` está verde no baseline (antes
  de qualquer mudança) falhar — não criar débito silencioso.

## Maintenance notes

### Open questions de produto (registrar como issues antes de promover a "real")

1. **Cadência**: semanal (proposta: seg 07:00 UTC) ou diária? Semanal → menos
   ruído, mas item crítico pode passar 6 dias sem alerta. Diária → risco de
   fadiga. Sugestão: diária para `critical`, semanal para `reorder` (exigiria
   dois crons ou lógica de filtro por nível dentro do mesmo job).

2. **Política de re-alerta (dedupe)**: sem dedupe, o cron envia e-mail toda
   execução enquanto o estoque não for reposto. Opções:
   a. **Sem dedupe (MVP)**: simples, sem tabela nova. Risco: spam.
   b. **Cooldown em banco**: tabela `stock_alert_sent(branch_id, variant_id, sent_at)`;
      não envia se `sent_at > now() - interval '7 days'`. Requer schema + `db:sync`.
   c. **Flag no `stock_level`**: coluna `last_alerted_at`; resetar ao repor estoque
      (requer trigger ou Server Action de ajuste de estoque). Complexo.
   d. **Sem dedupe no esqueleto atual** — a política correta é decisão de produto;
      o esqueleto atual (Step 1) não implementa nenhuma das opções acima.

3. **`responsibleUserId` null**: quando uma filial ativa não tem responsável
   cadastrado, o alerta é silenciosamente descartado (apenas logado). Alternativa:
   enviar para todos os `super_admin` com `status = 'active'`. Decidir antes de
   ativar o cron em produção.

4. **`dashboardUrl` no template**: o handler precisará do `BETTER_AUTH_URL`
   (que já está em `packages/env/src/server.ts:L25`) para construir a URL absoluta
   do painel. No esqueleto atual, `dashboardUrl` pode ser passado como
   `${env.BETTER_AUTH_URL}/dashboard/stock?status=critical` — confirmar naming.

5. **Quem recebe quando há múltiplos itens em múltiplas filiais**: o agrupamento
   por `branch_id` (Step 1) envia um e-mail por filial para o responsável da
   filial. Se o responsável gerencia N filiais, receberá N e-mails separados.
   Consolidar em digest único por usuário é UX melhor mas mais complexo; deixar
   como melhoria futura.

### Interações futuras

- Se a política de dedupe (open question 2b) for escolhida, criar tabela nova e
  adicionar query ao cron — revisar o Step 1 para incluir o check de cooldown
  antes do envio.
- Se a cadência mudar para diária, atualizar `vercel.json` (trivial) e revisar
  a política de re-alerta simultaneamente (senão spam diário).
- Se `stockLevel.reorderPoint` for zerado em massa para uma filial (reset de
  configuração), o cron para de enviar alertas silenciosamente para ela — comportamento
  correto mas vale documentar na UI de gestão de estoque.
- O PR deste spike deve ser revisado com foco em: (a) correção da query SQL
  (especialmente o `LEFT JOIN "user"` e o case de `critical`/`reorder`); (b)
  a lógica de agrupamento em memória; (c) ausência de import de `@emach/db`
  direto no template de e-mail.
