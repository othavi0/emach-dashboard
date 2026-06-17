# Plano de Reset do Banco — Onboarding do zero

> **Status:** aguardando GO explícito. Nada é executado até o usuário pedir.
> **Alvo:** Supabase `emach-ferramentas` (`wrxohbzepoyscsacjzvd`, sa-east-1).
> **Natureza:** destrutivo e irreversível. **Backup dispensado por decisão do usuário** (dados são de teste/pré-lançamento).

## ⚠️ Contexto crítico

- Banco **único, compartilhado com o app ecommerce**. Zerar `client*`, `order*`, `review`,
  `consent_log` apaga os dados do site também. **Confirmado OK** pelo usuário — ecommerce ainda
  não está em produção, vão popular hoje (dados atuais são de teste).
- "Zerar os índices": PKs são `text`/UUID (sem sequences) — não há contador a resetar e os
  índices são estrutura (permanecem). O que zera é **dado**. `RESTART IDENTITY` vai no comando
  por garantia, mas é no-op aqui.

## ✅ O que MANTÉM

| Item | Detalhe |
|---|---|
| Sua conta | `othavioquiliao@gmail.com` (super_admin, id `7SrB2V0eKoBKXN1KJ1b8Qq0XRuyeCy45`) + `account` |
| 4 categorias raiz | Acessórios, Equipamentos, Ferramentas Elétricas, Ferramentas Manuais |
| Banner | 2 linhas de `banner` + bucket `banner-images` (14 imagens) — **intocados** |
| 1 filial | **Nova** "Curitiba" criada do zero (as 3 atuais apagadas) |

## 🗑️ O que ZERA

**Storage** (via script com `supabaseAdmin` / service role):
- `tool-images`: 17 objetos → remover todos
- `order-documents`: já vazio (nada a fazer)
- `banner-images`: **NÃO tocar**

**DB — TRUNCATE total** (RESTART IDENTITY CASCADE):
catálogo (`tool`, `tool_variant`, `tool_image`, `tool_category`, `tool_attribute_value`,
`tool_attribute_assignment`, `attribute_definition`), inventário (`stock_level`,
`stock_movement`, `supplier`, `supplier_audit_log`), clientes (`client`, `client_address`,
`client_account`, `client_session`, `client_verification`, `consent_log`, `client_audit_log`,
`client_export_log`), pedidos (`order`, `order_item`, `order_status_history`, `order_note`,
`order_attachment`, `order_event`, `refund_request`, `review`), marketing (`promotion`,
`promotion_tool`), acesso/logs (`user_branch`, `session`, `verification`, `user_activity_log`,
`user_capability_override`).

**DB — DELETE / reset seletivo:**
- `user`: apaga os 2 outros (Estoquista, Marcos) → cascade limpa `account`/`session` deles
- `category`: apaga subcategorias (depth ≥ 1, bottom-up; FK `parent_id` é `restrict`)
- `branch`: apaga as 3 → cria "Curitiba" nova (id novo, `status=active`, demais campos null)
- `store_settings`: reset pro default limpo, **com Curitiba já definida como origem de frete**

## Ordem de execução (a ordem importa por causa das FKs)

Mapa de FKs confirmado no banco: várias tabelas referenciam `user`/`branch` com `NO ACTION`
(delete falha se houver linha apontando). Por isso **truncar tudo ANTES** dos DELETEs seletivos.
Os triggers de `category` são `BEFORE INSERT/UPDATE` apenas — não disparam em DELETE.

### Passo 0 — Backup
~~Backup pré-reset.~~ **Dispensado por decisão do usuário** (dados de teste/pré-lançamento).

### Passo 1 — Storage
Esvaziar `tool-images` (list + remove via `supabaseAdmin`). Não-transacional: se falhar no meio,
re-runável.

### Passo 2 — DB (1 transação)

```sql
BEGIN;

-- 1. TRUNCATE total
TRUNCATE
  tool, tool_variant, tool_image, tool_category,
  tool_attribute_value, tool_attribute_assignment, attribute_definition,
  stock_level, stock_movement, supplier, supplier_audit_log,
  client, client_address, client_account, client_session, client_verification,
  consent_log, client_audit_log, client_export_log,
  "order", order_item, order_status_history, order_note, order_attachment,
  order_event, refund_request, review,
  promotion, promotion_tool,
  user_branch, session, verification, user_activity_log, user_capability_override
  RESTART IDENTITY CASCADE;

-- 2. Reset store_settings (limpa ref a branch antes do delete de branch)
DELETE FROM store_settings;
INSERT INTO store_settings (id) VALUES ('singleton');  -- demais colunas via default

-- 3. Apagar os outros users (cascade remove account/session deles)
DELETE FROM "user" WHERE id <> '7SrB2V0eKoBKXN1KJ1b8Qq0XRuyeCy45';

-- 4. Apagar subcategorias bottom-up (FK parent_id = restrict). Sobram as 4 raízes (depth 0).
DELETE FROM category WHERE depth = 2;
DELETE FROM category WHERE depth = 1;

-- 5. Apagar as 3 filiais, criar Curitiba e defini-la como origem de frete
DELETE FROM branch;
WITH nova AS (
  INSERT INTO branch (id, name) VALUES (gen_random_uuid()::text, 'Curitiba')  -- status=active default
  RETURNING id
)
UPDATE store_settings SET shipping_origin_branch_id = (SELECT id FROM nova) WHERE id = 'singleton';

COMMIT;
```

### Passo 3 — Verificação pós-reset
```sql
SELECT
  (SELECT count(*) FROM "user")                       AS users,        -- esperado 1
  (SELECT count(*) FROM category)                     AS categorias,   -- esperado 4
  (SELECT count(*) FROM category WHERE depth = 0)     AS cat_raiz,     -- esperado 4
  (SELECT count(*) FROM branch)                       AS filiais,      -- esperado 1
  (SELECT count(*) FROM tool)                         AS tools,        -- esperado 0
  (SELECT count(*) FROM "order")                      AS pedidos,      -- esperado 0
  (SELECT count(*) FROM client)                       AS clientes,     -- esperado 0
  (SELECT count(*) FROM banner)                       AS banners,      -- esperado 2
  (SELECT count(*) FROM store_settings)               AS settings,     -- esperado 1
  (SELECT shipping_origin_branch_id IS NOT NULL FROM store_settings)  AS frete_origem_ok; -- true
-- + conferir storage: tool-images vazio, banner-images = 14
```
- Smoke visual: `bun dev:web`, logar e visitar dashboard (home, catálogo, filiais, clientes,
  pedidos) — confirmar telas vazias sem erro.

## Checklist pós-reset (onboarding)
- [ ] Completar dados da filial Curitiba (endereço, CEP ranges, horários) pela UI — já criada e já definida como origem de frete pelo reset.
- [ ] Ao criar admin/user novos: **vincular ≥1 filial** (`user_branch`) — fail-closed deixa cego sem vínculo.
- [ ] Cadastrar catálogo (produtos, atributos, subcategorias) do zero.

## Observações / achados adjacentes (fora do reset)

1. **RLS desabilitado em 27 tabelas sensíveis** (auth, PII de cliente, pedidos) — advisor
   Supabase nível crítico. Registrado em **issue
   [#197](https://github.com/othavioquiliao/emach-dashboard/issues/197)** com evidências e
   remediação. Pré-existente, tratar antes do go-live.
2. **Drift schema↔banco**: `store_settings.shipping_origin_branch_id` é `set null` no TS mas
   `no action` no banco. Não afeta o reset.
3. **Órfãos opcionais**: dos 14 objetos em `banner-images`, os não referenciados pelos 2
   registros de `banner` poderiam ser limpos — opcional, baixo impacto.
