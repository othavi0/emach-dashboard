# ADR 0015 — Proveniência de Fornecedor vive na entrada de estoque, não na Tool

**Data:** 2026-06-14
**Status:** Aceito
**Relaciona:** ADR-0006 (push-only), ADR-0009 (schema sync com o ecommerce).

## Contexto

Originalmente cada Tool carregava **um** Fornecedor fixo (`tool.supplier_id`, nullable), definido na criação da ferramenta. Na prática isso não modela a realidade: a mesma ferramenta (ex.: uma serra) é comprada de **vários fornecedores ao longo do tempo**, e cada lote recebido tem a sua própria origem. Amarrar o Fornecedor à Tool perde essa proveniência por compra e força uma escolha artificial de "o fornecedor" da ferramenta.

Em paralelo, a única escrita de estoque do admin era um **ajuste por quantidade-alvo** (o staff digitava o total novo, o sistema calculava o delta). Esse formato único confunde intenções distintas: receber 5 unidades de um fornecedor, baixar 3 por perda, e recontar o inventário físico são operações com semântica e dados diferentes — mas todas caíam no mesmo formulário de "novo total".

## Decisão

**1. A relação Fornecedor↔Tool é N:N derivada das entradas.** Um Fornecedor "fornece" uma Tool quando existe ≥1 `stock_movement` com `reason = 'entrada_compra'` ligando o Fornecedor à variante da Tool. Não há tabela de vínculo nem coluna na Tool — o conjunto de entradas **é** a relação.

- `stock_movement` ganha `supplier_id` (FK → `supplier`, `ON DELETE set null`), **obrigatório quando `reason = 'entrada_compra'`** e **nulo nos demais motivos**.
- `tool.supplier_id` é **removido** (drop coordenado com o e-commerce — schema compartilhado, ADR-0009). O Fornecedor sai do formulário de criação/edição de Tool.

**2. O admin escreve estoque por três operações de intenção distinta**, cada uma um `stock_movement` com Actor `user`:

- **Entrada (Recebimento)** — delta **positivo**; `reason = 'entrada_compra'`; **Fornecedor obrigatório**.
- **Baixa** — delta **negativo**; `reason = 'perda'` ou `'outro'`; sem Fornecedor.
- **Ajuste de inventário (Recontagem)** — o staff informa a **quantidade-alvo**; o sistema calcula o delta; `reason = 'ajuste_inventario'`; sem Fornecedor.

**3. O estoque não captura custo.** Nenhuma das operações registra valor monetário — controle de estoque é quantidade e proveniência, não gestão financeira.

## Opções consideradas

### Manter `tool.supplier_id` (1 fornecedor por Tool) — rejeitado

Simples, mas não modela múltiplos fornecedores nem a origem por lote. Força "o fornecedor" da ferramenta quando não existe um só.

### Tabela de vínculo explícita `supplier_tool` — rejeitado

Um catálogo de "quem pode fornecer o quê", cadastrado à mão, independente do histórico de compras. Permitiria pré-registrar um fornecedor antes da primeira compra, mas cria **duas fontes de verdade** (o vínculo declarado × as entradas reais) que divergem. A proveniência derivada das entradas é a fonte única e não precisa de manutenção.

### Derivar das entradas — **escolha atual**

Zero duplicação; a aba Estoque do Fornecedor lista exatamente as ferramentas que **de fato** recebemos dele, e o histórico de movimentos é a única fonte de verdade da relação.

## Consequências

- A aba "Ferramentas" do Fornecedor (antes movida por `tool.supplier_id`) passa a ser a aba **Estoque**, derivada das entradas. Por ferramenta, exibe o **estoque geral** (soma de `stock_level.quantity` sobre todas as variantes × todas as filiais) e o **total recebido deste fornecedor**. O deep-link `/dashboard/tools/new?supplierId=` perde sentido e é removido.
- Existe um **ledger global de movimentações** filtrável por usuário, ferramenta, filial, fornecedor, motivo e período, além do histórico de entradas na página do Fornecedor. As timelines de Tool e de Branch passam a exibir o Fornecedor nas entradas.
- A entrada é **por variante** (invariante: estoque é por `tool_variant`, não por Tool). A relação Fornecedor↔Tool faz rollup variante→Tool para exibição.
- **Backfill:** entradas pré-existentes têm `supplier_id` nulo. A obrigatoriedade de Fornecedor na entrada é garantida na validação da aplicação; o CHECK no banco, se adotado, deve tolerar o legado (ou o dev é re-seedado — workflow push-only pré-produção, ADR-0006). Coordenar o drop de `tool.supplier_id` e a adição de `stock_movement.supplier_id` com o e-commerce (ADR-0009).
- **Custo:** a remoção de `tool_variant.cost_amount` é limpeza separada, fora desta decisão — aqui só fica firmado que o **fluxo de estoque** não captura custo.
- **Transferência entre filiais** permanece fora do domínio: não há motivo de movimento nem operação para mover estoque entre Branches.
