# Migração: fornecedor por entrada de estoque — instruções para o e-commerce

> **Para o time do `emach-ecommerce`.** Mudanças de schema no banco **compartilhado** introduzidas pela feature "fluxo de estoque com fornecedor por entrada" (ADR-0015 do dashboard). O dashboard é a fonte de verdade (ADR-0009); estas mudanças chegam ao e-commerce pelo **PR automático de sync de schema** (`sync-db-schema.yml`). Este documento descreve o que mudou e o que o e-commerce precisa fazer.

## ⚠️ Atenção imediata (banco de dev compartilhado)

O banco de **desenvolvimento é o mesmo** para os dois apps. As mudanças destrutivas abaixo **já foram aplicadas no banco de dev**. Ou seja: qualquer código do e-commerce que leia `tool.supplier_id` **já está quebrado em dev agora**. Trate como prioridade.

Para **produção**, o drop de `tool.supplier_id` precisa de deploy coordenado (ver "Coordenação de deploy" no fim).

---

## 1. `tool.supplier_id` — REMOVIDA (drop)

A coluna `tool.supplier_id` (e o índice `tool_supplier_id_idx`) foi **dropada**. O fornecedor não pertence mais à Tool — a relação Fornecedor↔Tool passou a ser **N:N derivada das entradas de estoque** (ver item 2).

**O que o e-commerce precisa fazer:**

- Remover `supplierId` (`supplier_id`) da cópia do schema de `tool` (Drizzle).
- Remover qualquer query, tipo ou componente que leia `tool.supplierId` / `t.supplier_id`. O tipo `Tool` (`typeof tool.$inferSelect`) **não tem mais** esse campo.
- Em particular, a query `getToolBySlug` em `queries/catalog.ts` (sincronizada) **deixou de selecionar** `t.supplier_id AS "supplierId"`. Se o storefront usava `tool.supplierId` para algo (exibição, filtro), remover esse uso.

**SQL aplicado no banco (referência):**

```sql
ALTER TABLE tool DROP COLUMN supplier_id;  -- o índice tool_supplier_id_idx cai junto
```

---

## 2. `stock_movement.supplier_id` — ADICIONADA

A tabela `stock_movement` ganhou:

| Objeto | Definição |
| --- | --- |
| Coluna | `supplier_id text` — **nullable**, FK → `supplier(id)` `ON DELETE SET NULL` |
| Índice | `stock_movement_supplier_created_idx` em `(supplier_id, created_at DESC)` |
| CHECK | `entrada_requires_supplier`: `(reason <> 'entrada_compra') OR (supplier_id IS NOT NULL)` |

**Semântica:** `supplier_id` é **obrigatório quando `reason = 'entrada_compra'`** (a proveniência da compra) e **nulo nos demais motivos**.

**Impacto no e-commerce:** o e-commerce escreve `stock_movement` apenas com `reason = 'saida_venda'` (débito de venda, ADR-0007). Para `saida_venda`, `supplier_id` é **nulo** — e o CHECK `entrada_requires_supplier` **só restringe `entrada_compra`**, então os inserts de venda do e-commerce **continuam válidos sem nenhuma mudança de lógica**.

**O que o e-commerce precisa fazer:**

- Adicionar `supplier_id` (nullable, FK supplier) à cópia do schema de `stock_movement` (vem no PR de sync).
- **Nenhuma mudança nos inserts de `saida_venda`** — eles já omitem `supplier_id` (default null), o que é aceito pelo CHECK.
- **Não** escrever `entrada_compra` a partir do e-commerce (nunca foi o caso; a entrada é uma operação só do admin). Se algum dia o e-commerce inserir `entrada_compra`, terá que fornecer `supplier_id` ou o CHECK rejeita.

**SQL aplicado no banco (referência):**

```sql
ALTER TABLE stock_movement
  ADD COLUMN supplier_id text REFERENCES supplier(id) ON DELETE SET NULL;
CREATE INDEX stock_movement_supplier_created_idx
  ON stock_movement (supplier_id, created_at DESC);
ALTER TABLE stock_movement ADD CONSTRAINT entrada_requires_supplier
  CHECK ((reason <> 'entrada_compra') OR (supplier_id IS NOT NULL));
```

---

## 3. Backfill de dados (só dev)

No banco de **dev**, 60 movimentos legados de `entrada_compra` que tinham `supplier_id` nulo (criados antes desta feature) foram convertidos para `reason = 'ajuste_inventario'` — eram, na prática, ajustes sem fornecedor — para que o CHECK pudesse ser criado:

```sql
UPDATE stock_movement SET reason = 'ajuste_inventario'
WHERE reason = 'entrada_compra' AND supplier_id IS NULL;
```

Em **produção** não há legado (o sistema ainda não está em produção), então esse backfill não se aplica lá.

---

## 4. Coordenação de deploy (produção)

Por ser banco compartilhado, a ordem importa para **não quebrar o storefront em produção**:

1. **Primeiro:** o e-commerce faz deploy do código que **não referencia mais `tool.supplier_id`** (item 1) e que **inclui `stock_movement.supplier_id`** no schema (item 2).
2. **Depois (ou junto):** aplica-se o `ALTER TABLE tool DROP COLUMN supplier_id` em produção.

Se o drop for aplicado antes de o e-commerce parar de ler `tool.supplier_id`, o storefront quebra (`column t.supplier_id does not exist`). A adição de `stock_movement.supplier_id` é aditiva e segura em qualquer ordem.

> Resumo: **drop de `tool.supplier_id` = mudança que exige sincronização de deploy.** A adição em `stock_movement` = segura/aditiva.

---

## Referências

- ADR-0015 do dashboard: `docs/adr/0015-fornecedor-na-entrada-de-estoque.md`
- Glossário (Inventory / Supplier / Estoque geral): `CONTEXT.md`
- Contrato geral da integração: `docs/integration/admin-ecommerce.md`
