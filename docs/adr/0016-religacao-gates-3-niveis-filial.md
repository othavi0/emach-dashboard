# ADR 0016 — Religar gates com 3 níveis e escopo de filial em dois planos

**Data:** 2026-06-15
**Status:** Aceito — **substitui o ADR-0012**
**Relaciona:** estende a matriz preservada em `apps/web/src/lib/permissions.disabled.ts`; depende de ADR-0013 (convite-only), ADR-0004 (DB compartilhada).

## Contexto

O ADR-0012 desligou os gates role-based até produção, deixando qualquer staff `active` com poder total e sem filtro de filial. Ao religar, decidimos **não** restaurar a matriz original tal qual: o produto agora quer **3 níveis** (não 4) e uma semântica de filial diferente — onde `admin` também é filial-scoped, ao contrário do `admin` quase-global do modelo antigo. O período sem gates deu clareza dos perfis reais de operação (ver "Não decidido" do ADR-0012).

## Decisão

Religar a autorização com **dois eixos ortogonais**:

1. **Capability** (`requireCapability`) — *que tipo de ação?* (depende de role).
2. **Branch-scoping** (`getUserBranchScope`) — *sobre dados de qual filial?* (depende de `userBranch`), aplicado em **visibilidade e ação**.

**Modelo de 3 níveis** (`manager` aposentado → `admin`):

- **super_admin** — tudo, escopo global.
- **admin** — gestor de filial: opera Pedidos/Estoque das suas filiais (+ Pedidos na triagem), edita o Catálogo global (sem deletar), modera Clientes/Reviews, e gerencia os `user` das próprias filiais. Não toca Filiais, Store Settings, deleções de catálogo, nem outros admins.
- **user** — operador de filial: Pedidos (status/nota) e Estoque da própria filial; o resto é leitura.

**Exclusivo de super_admin:** `branches.manage`, `users.delete`, `site.update_*`, e os `*.delete` do catálogo (`tools/categories/promotions/attributes`). `ADMIN_CAPS = ALL_CAPS − exclusivos`.

**Invariante novo:** todo `admin`/`user` pertence a ≥1 filial (exigido no convite; last-branch guard ao desvincular). Staff sem filial = **fail-closed** (vê/age sobre nada). Só `super_admin` é sem-filial.

## Opções consideradas

- **A (escolhida)** — reativar a camada de capability + reconstruir `getUserBranchScope`. Reaproveita os 138 callsites intactos e o scaffolding de filtro já presente em Pedidos; menor delta.
- **B** — política unificada `can(session, action, resource)` num ponto só. Rejeitada: rewrite dos 138 callsites sem ganho de segurança.
- **C** — Row-Level Security no Postgres para o escopo de filial. Rejeitada: o banco é **compartilhado com a loja e-commerce** (ADR-0004) e a coordenação é via schema, não via RLS; políticas por linha afetariam o outro app. (RLS no projeto existe só como deny-all do PostgREST — ADR-0014 — não como scoping de domínio.)

## Consequências

- **Fail-closed + `userBranch` despovoado = todos cegos** no religamento. Mitigação obrigatória: migração `manager → admin` e povoamento de `userBranch` para todo admin/user ativo **antes** de religar (verificação SQL no spec).
- Agregados de estoque ("Estoque geral") passam a ser **role-relativos na exibição** — números diferentes conforme quem olha.
- Split de capabilities coarse: `categories.delete` e `promotions.delete` separados de `*.manage`.
- Reativar não é "restaurar 3 arquivos" como o ADR-0012 previa — o `getUserBranchScope` é **redesenhado** (admin filial-scoped, plano de visibilidade, Pedidos na triagem).

## Referências

Design completo: `docs/superpowers/specs/2026-06-15-niveis-autorizacao-design.md`. Termos: ver CONTEXT.md (Role, Branch-scoping, Filial de fulfillment, Pedido na triagem, invariante #8).
