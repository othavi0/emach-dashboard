# Spec — Alerta proativo de reorder point (cron + email)

- **Issue:** #307
- **Branch:** `feat/307-stock-alerts`
- **Data:** 2026-07-14
- **Antecedente:** spike/design plano 036 (`git show 09a442c1:plans/036-reorder-point-alerts-spike.md`). Este spec substitui as open questions do spike por decisões fechadas; o spike foi escrito antes do ADR-0016 (`user_branch` não existia).

## Problema

O painel classifica variantes em `critical`/`reorder`/`ok` e exibe a tabela de reposição (`mode=repor`), mas o staff só descobre ruptura iminente abrindo o dashboard. Falta notificação proativa por e-mail. A infraestrutura (Vercel Cron + `CRON_SECRET`, `@emach/email`/Resend) já existe e está em uso por `cancel-stale-orders` e `prune-cart-events`.

## Decisões de produto (fechadas em 2026-07-14)

| Questão | Decisão |
| --- | --- |
| Destinatários | Admins ativos vinculados à filial via `user_branch`; fallback super_admins ativos quando a filial não tem admin. `branch.responsibleUserId` **não** é usado. |
| Cadência | Diária em dias úteis — `0 7 * * 1-5` (04:00 BRT). |
| Re-alerta | Cooldown de 7 dias por `(branch_id, variant_id)` persistido em tabela `stock_alert_sent`. Escalada `reorder → critical` fura o cooldown. |
| Filial sem destinatário algum | `logger.error` com `reason: "no_recipients"` e pula (estado quase impossível: exigiria zero super_admin ativo). |
| Múltiplas filiais por admin | Um e-mail por filial (admin em N filiais recebe N e-mails). Digest por usuário = melhoria futura, fora deste escopo. |
| Cooldown por nível | Janela única de 7d para `critical` e `reorder` (exceto escalada). |
| Reset do cooldown na reposição | Não há: cooldown é puramente temporal. Item que recupera e volta a cair dentro da janela não re-alerta. Escolha consciente para evitar trigger/lógica de reset. |

## Arquitetura

Cron GET `/api/cron/stock-alerts` → query única de itens abaixo do ponto (com estado de dedupe via `LEFT JOIN`) → agrupamento em memória por filial → filtro de cooldown → resolução de destinatários por filial → `sendStockAlertEmail` (1 por filial, `to` = array) → upsert em `stock_alert_sent` **somente após envio bem-sucedido** (falha no send = re-tentativa natural no dia seguinte).

### 1. Schema — `stock_alert_sent` (única mudança de banco)

Em `packages/db/src/schema/inventory.ts`:

```
stock_alert_sent
  branch_id   text NOT NULL FK → branch.id       ON DELETE CASCADE
  variant_id  text NOT NULL FK → tool_variant.id ON DELETE CASCADE
  alert_level text NOT NULL ('critical' | 'reorder')
  sent_at     timestamptz NOT NULL
  PRIMARY KEY (branch_id, variant_id)
```

- Uma linha por par; upsert a cada envio (`ON CONFLICT ... DO UPDATE`). Sem crescimento não-limitado, sem job de limpeza.
- Não é tabela de auditoria — sem `actorType`/`actorUserId`.
- Aplicação via `bun db:sync` (push-only, ADR-0006). Mudança **aditiva** — mas o banco é único e compartilhado (dev = prod = ecommerce): rodar só com o user ciente, nesta sessão. Sync de tipos pro ecommerce sai via CI PR automático (ADR-0009).

### 2. Query de itens (raw `db.execute`, própria do cron)

Não reusa `getReorderTable` (que é user-scoped, `LIMIT 50`) — query própria sem `LIMIT` e sem filtro de branch:

```sql
SELECT
  b.id AS branch_id, b.name AS branch_name,
  t.name AS tool_name, tv.sku,
  sl.quantity, sl.min_qty, sl.reorder_point,
  (sl.reorder_point - sl.quantity) AS deficit,
  CASE WHEN sl.quantity <= sl.min_qty AND sl.min_qty > 0
       THEN 'critical' ELSE 'reorder' END AS alert_level,
  sas.sent_at AS last_sent_at,
  sas.alert_level AS last_alert_level
FROM stock_level sl
JOIN branch b        ON b.id = sl.branch_id
JOIN tool_variant tv ON tv.id = sl.variant_id
JOIN tool t          ON t.id = tv.tool_id
LEFT JOIN stock_alert_sent sas
       ON sas.branch_id = sl.branch_id AND sas.variant_id = sl.variant_id
WHERE sl.quantity < sl.reorder_point
  AND sl.reorder_point > 0
  AND t.status = 'active'
  AND b.status = 'active'
ORDER BY b.id, deficit DESC
```

- `<` (não `<=`) + `reorder_point > 0`: `reorder_point = 0` significa "sem ponto configurado" (coluna not-null default 0) e é descartado.
- Gotcha conhecido: `db.execute()` raw devolve timestamp como **string** (drizzle 0.45.x) — coagir `last_sent_at` com `toDate` de `@emach/db/utils` no boundary.

**Filtro de cooldown (em memória, por item):** entra no e-mail se `last_sent_at` é null, OU `last_sent_at < now − 7d`, OU (`alert_level = 'critical'` E `last_alert_level = 'reorder'`).

### 3. Destinatários (query por conjunto de filiais afetadas)

```sql
SELECT ub.branch_id, u.email, u.name
FROM user_branch ub
JOIN "user" u ON u.id = ub.user_id
WHERE u.role = 'admin' AND u.status = 'active'
  AND ub.branch_id IN (…filiais com itens…)
```

- Fallback (uma vez por execução): `SELECT email, name FROM "user" WHERE role = 'super_admin' AND status = 'active'` — usado para toda filial sem admin vinculado.
- Sem destinatário nem no fallback → `logger.error("stockAlertsCron", { branchId, reason: "no_recipients" })` e pula a filial.

### 4. Handler `apps/web/src/app/api/cron/stock-alerts/route.ts`

Segue `cancel-stale-orders/route.ts` (exemplar canônico) e as convenções de cron do `apps/web/CLAUDE.md`:

- `export const dynamic = "force-dynamic"` + `export const runtime = "nodejs"`.
- Auth `Authorization: Bearer ${env.CRON_SECRET}` **antes de qualquer query**; 401 imediato.
- Loop filial-a-filial com try/catch individual + `logger.error("stockAlertsCron", { branchId, err })`; uma filial com erro não aborta o batch.
- Por filial: itens fora do cooldown → destinatários → `sendStockAlertEmail` → upsert `stock_alert_sent` de cada item enviado.
- Import do e-mail: `@emach/email/send` (único entry do pacote).
- Resposta: `NextResponse.json({ ok: true, emailsSent, branchesSkipped, itemsAlerted })`; catch externo → 500 `{ ok: false }`.
- Proibições padrão: sem `console.*` (usar `logger`), sem `any`/`@ts-ignore`. Não é server action — sem `requireCapability` (o Bearer é a auth).

### 5. E-mail — template + send

**`packages/email/src/templates/stock-alert.tsx`** no padrão visual de `invite.tsx` (`<Html lang="pt-BR">`, Tailwind `pixelBasedPreset`, coral `#cc785c`, header `E-MACH`):

- Preview: `Alerta de estoque baixo — filial {branchName}`.
- Heading: "Estoque abaixo do ponto de reposição"; intro neutra "Olá! Os itens abaixo na filial {branchName} precisam de reposição." — o `to` é uma lista de admins, então o template **não tem** prop de nome de destinatário (diverge do spike, que era 1-para-1 com o responsável).
- Tabela HTML direta: Ferramenta / SKU / Estoque atual / Ponto de reposição / Déficit; linha `critical` com destaque vermelho (`#dc2626`).
- CTA coral "Ver reposição no painel" → `dashboardUrl`.
- Rodapé: "Você recebeu este e-mail porque administra esta filial no painel E-mach."
- Exporta `StockAlertEmail` + `StockAlertEmailProps`; inclui `PreviewProps` (1 item critical + 1 reorder).

**`sendStockAlertEmail`** em `packages/email/src/send.tsx`, padrão dos irmãos: `{ to: string[]; branchName; dashboardUrl; items }`, subject `` `Alerta de estoque — ${branchName} — E-mach` ``.

**`dashboardUrl`** construído no handler: `${env.BETTER_AUTH_URL}/dashboard/tools?mode=repor&branchId=${branchId}` — rota real do modo reposição (`/dashboard/stock` é hoje só um redirect para ela).

### 6. Registro do cron

`apps/web/vercel.json`, terceira entrada:

```json
{ "path": "/api/cron/stock-alerts", "schedule": "0 7 * * 1-5" }
```

Vercel Cron só dispara em deploy de produção; `CRON_SECRET` já validado em `packages/env/src/server.ts`.

## Escopo de arquivos

**Criar/modificar (apenas estes):**

1. `packages/db/src/schema/inventory.ts` — tabela `stock_alert_sent` (+ relations)
2. `apps/web/src/app/api/cron/stock-alerts/route.ts` — handler
3. `apps/web/src/app/api/cron/stock-alerts/__tests__/route.test.ts` — testes
4. `packages/email/src/templates/stock-alert.tsx` — template
5. `packages/email/src/send.tsx` — `sendStockAlertEmail`
6. `apps/web/vercel.json` — entrada do cron

**Fora do escopo:** `getReorderTable`/`dashboard.ts`, `branch-stock-data.ts`, `reorder-table.tsx`/UI, `branch.responsibleUserId` (permanece intocado), digest por usuário, UI de histórico de alertas.

## Erros e resiliência

- Falha de envio por filial: logada, batch continua, **sem upsert** → itens re-tentam no próximo dia útil.
- Falha na query principal: catch externo, 500, `logger.error`.
- Filial cujo `reorder_point` for zerado em massa deixa de alertar silenciosamente — comportamento correto por design (sem ponto configurado = sem alerta).
- Execução concorrente: janela de cooldown de 7d torna duplicata inofensiva (pior caso: e-mail duplicado no mesmo minuto); sem `FOR UPDATE` porque não há mutação de dado de negócio.

## Testes (`vitest`, mock `vi.hoisted` de `@emach/db` e `@emach/email/send`)

| # | Cenário | Esperado |
| --- | --- | --- |
| 1 | Sem header Authorization | 401, zero query |
| 2 | Secret errado | 401, zero query |
| 3 | DB sem itens abaixo do ponto | 200, `emailsSent: 0` |
| 4 | 1 filial, 2 itens, admin vinculado | 200, `emailsSent: 1`, send 1×, upsert 2× |
| 5 | Item com `last_sent_at` há 2 dias | item excluído do e-mail (cooldown) |
| 6 | Item em cooldown mas escalou reorder→critical | item incluído |
| 7 | Filial sem admin em `user_branch` | envia pros super_admins ativos (fallback) |
| 8 | Sem admin e sem super_admin | `branchesSkipped: 1`, `logger.error` com `no_recipients` |
| 9 | `sendStockAlertEmail` rejeita | 200, batch segue, sem upsert da filial que falhou |

## Verificação (done = tudo verde)

- `bun verify` (`check-types` + `check` + `test`) e `bun guard:forms`.
- `bun db:sync` aplicado (com ciência do user) e tabela visível no banco.
- Smoke real: disparar o handler local com `curl -H "Authorization: Bearer $CRON_SECRET"` e conferir e-mail recebido (Resend) + linhas em `stock_alert_sent` + segunda execução não re-envia (cooldown).
