# Permissões do role `user` (estoqueista / operacional)

> Design — 2026-06-16. Ajuste da matriz de capabilities do role `user`, correção de
> gates que bloqueiam o ajuste de estoque, consistência da sidebar e feedback de acesso
> negado. Base: ADR-0016 (gates 3 níveis + filial) e ADR-0017 (overrides por usuário).

## Problema

A conta `user` (estoqueista / operacional) é hoje, na prática, **"vê tudo, mexe em quase
nada"**. Três causas distintas, não uma:

1. **Bloqueios reais (bugs de gate).** O ajuste de estoque (entrada/saída/ajuste/perda) só
   existe dentro da aba "Estoque" do detalhe de filial (`/dashboard/branches/[id]`), e essa
   página exige `branches.manage` — capability **super_admin-only**. Resultado: **nem o admin**
   consegue movimentar estoque pela UI, apesar de `admin` e `user` terem `stock.adjust`. É a
   causa do "user não consegue adicionar/tirar do estoque".
2. **Permissões que sobram.** Todos os `*.read` são `SAU` (super_admin+admin+user), então o
   `user` enxerga Clientes, Avaliações, Promoções e Banners — telas que não fazem parte do papel
   operacional.
3. **Permissões que faltam.** `suppliers.manage` é `SA`; o estoqueista precisa adicionar/editar
   fornecedores.

Somado a isso: a sidebar só filtra "Configurações" e "Usuários" por capability — os demais 11
itens aparecem para qualquer autenticado. E o acesso negado é um **redirect mudo** para
`/dashboard` (ou, em Clientes/Avaliações, uma **tela de erro crua**, porque a página usa
`requireCapability`, que *lança*).

## Objetivo

Deixar o role `user` como **operador puro**: opera pedidos e estoque das **filiais dele**,
gerencia fornecedores, consulta o catálogo — e não vê nem toca no resto. Corrigir os gates que
travam o estoque (beneficia também o admin), tornar a navegação coerente com as permissões e dar
feedback claro de acesso negado.

Fora de escopo: redesenhar o modelo de capabilities, criar capabilities mais granulares, mexer
no fluxo de convite/aprovação de usuários.

## Decisões (confirmadas com o usuário)

- **Pedidos:** o `user` opera (ver, avançar status, anotar, anexar) mas **não** cancela, estorna
  nem exporta — essas ficam admin+.
- **Catálogo:** o `user` tem **somente leitura** (ferramentas, categorias, atributos). Não cria
  nem edita.
- **Estoque:** o `user` ajusta o estoque **apenas das filiais às quais está vinculado**
  (branch-scoping, já suportado por `getUserBranchScope` + `requireCapabilityWithContext`).
- **Fornecedores:** o `user` **gerencia** (cria/edita) — global, não branch-scoped.
- **Relacionamento (clientes, avaliações, promoções, banners):** o `user` **não vê**.
- **Self-action:** ninguém (nem admin) força o próprio logout nem dispara reset da própria senha
  pelo painel.

## Arquitetura da mudança

Cinco partes independentes entre si (podem virar tasks separadas no plano).

### Parte 1 — Matriz alvo do role `user`

Editar `defaultRoles` em `apps/web/src/lib/capabilities.ts`. Atalhos: `S=[super_admin]`,
`SA=[super_admin,admin]`, `SAU=[super_admin,admin,user]`.

| Capability        | De   | Para | Efeito                                  |
| ----------------- | ---- | ---- | --------------------------------------- |
| `suppliers.manage`| `SA` | `SAU`| user passa a criar/editar fornecedores  |
| `customers.read`  | `SAU`| `SA` | user deixa de ver clientes              |
| `reviews.read`    | `SAU`| `SA` | user deixa de ver avaliações            |
| `promotions.read` | `SAU`| `SA` | user deixa de ver promoções             |
| `site.read`       | `SAU`| `SA` | user deixa de ver site/banners          |

Matriz resultante do `user` (capabilities que permanecem `SAU` e ele mantém):
`tools.read`, `categories.read`, `attributes.read`, `suppliers.read`, **`suppliers.manage`**,
`stock.read`, `stock.adjust`, `branches.read`, `orders.read`, `orders.update_status`,
`orders.add_note`.

Tudo o mais (catálogo create/update/delete, `orders.cancel/refund/export`, `customers.*`,
`reviews.*`, `promotions.manage/delete`, `site.*`, `users.*`, `permissions.manage`,
`audit.read`) permanece fora do `user`.

Os **overrides por usuário (ADR-0017)** continuam disponíveis como escape hatch pontual — um
super_admin pode, caso a caso, conceder uma cap específica a um estoqueista via a aba
"Permissões", sem mudar o default do role.

### Parte 2 — Fixes de gate (destravam o estoque; beneficiam o admin)

1. **`apps/web/src/app/dashboard/branches/[id]/page.tsx`** — trocar o gate de entrada de
   `requireCapabilityOrRedirect("branches.manage")` (linha ~47) por
   `requireCapabilityOrRedirect("branches.read")`. A partir daí, **cada aba e ação gateia a sua
   própria capability** (pattern já documentado em `apps/web/CLAUDE.md` — "a ação primária muda
   conforme a tab"):
   - Botão "Editar filial" no header → condicionar a `can(session, "branches.manage")`
     (super_admin).
   - Aba "Equipe" → condicionar a `can(session, "users.manage")` (esconder para o user).
   - Aba "Estoque" → já gateada internamente por
     `requireCapabilityWithContextOrRedirect("stock.adjust", { targetBranchIds: [branchId] })`
     em `stock-tab.tsx:54` — sem mudança.
   - Abas "Visão geral" / "Pedidos" / "Atividade" → `branches.read` / `orders.read` /
     `stock.read` conforme o conteúdo.

   > Nota de UX: o `StockTab` faz `...OrRedirect` — se o user abrir a aba Estoque de uma filial
   > **fora** do escopo dele, a página inteira redireciona para `/dashboard` (mudo). Para o
   > estoqueista operando as próprias filiais isso não acontece. Tratar a aba fora-de-escopo como
   > estado vazio em vez de redirect é uma melhoria possível, mas **fora do escopo** deste design
   > (decisão do usuário: aprovado como está).

2. **`apps/web/src/app/dashboard/suppliers/new/page.tsx`** (linha ~11) — trocar
   `requireRole("admin")` por `requireCapability("suppliers.manage")`. Hoje a página ignora
   overrides e barraria o `user` mesmo após ganhar a cap (a action já gateia por capability).

3. **`apps/web/src/app/dashboard/branches/new/page.tsx`** — mesma anomalia (`requireRole`);
   alinhar a `requireCapability("branches.manage")`. Mantém o acesso em super_admin, mas via
   capability (respeitando overrides).

### Parte 3 — Sidebar consistente

`apps/web/src/app/dashboard/_components/app-sidebar.tsx` hoje filtra apenas via um objeto `caps`
com `site.update_settings` e o grupo "Administração" via `canManageUsers`. Generalizar:

- O `layout.tsx` resolve `getUserCapabilities(session)` (já existe, request-cached) **uma vez** e
  passa o `ReadonlySet<Capability>` à sidebar.
- A sidebar filtra **todo** item por `!item.capability || caps.has(item.capability)`. Grupo que
  fica sem itens visíveis não é renderizado.
- Adicionar `capability` aos itens de "Relacionamento" em `nav-config.ts`:

  | Item        | `capability`           |
  | ----------- | ---------------------- |
  | Clientes    | `customers.read`       |
  | Avaliações  | `reviews.read`         |
  | Promoções   | `promotions.read`      |
  | Banners     | `site.update_banners`  |

Resultado para o `user`: grupo "Relacionamento" inteiro desaparece. Sidebar dele:
**Visão** (Dashboard) · **Operação** (Pedidos, Filiais) · **Catálogo** (Ferramentas, Categorias,
Fornecedores, Movimentações).

> `requiresManageUsers` (grupo "Administração") pode ser mantido como está ou convergido para o
> mesmo mecanismo de `capability` (`users.manage`) — detalhe de implementação, sem mudança de
> comportamento.

### Parte 4 — Feedback de acesso negado

- Nova rota **`/dashboard/sem-acesso`** — página 403 com mensagem clara ("Você não tem acesso a
  esta seção"), seguindo o sistema visual (`DESIGN.md`), com botão de voltar ao Dashboard. Aceita
  `?recurso=<nome>` opcional para personalizar a mensagem.
- Padronizar o gate das páginas que hoje **lançam** ou **não gateiam read**, trocando para
  `requireCapabilityOrRedirect(cap, "/dashboard/sem-acesso?recurso=...")`:
  - `customers/page.tsx`, `customers/[id]/page.tsx` (hoje `requireCapability` → lança)
  - `reviews/page.tsx`, `reviews/[id]/page.tsx` (idem)
  - `promotions/page.tsx`, `tools/page.tsx` (hoje só `requireCurrentSession` — adicionar gate de
    read: `promotions.read` / `tools.read`)
- Defesa em profundidade: mesmo escondido da sidebar, o acesso por URL direta cai na 403, não em
  tela de erro crua.

### Parte 5 — Hardening self-action

Em `apps/web/src/lib/permissions.ts`, estender o conjunto `SELF_RESTRICTED` para incluir
`users.revoke_sessions` e `users.reset_password` (hoje cobre `users.suspend`, `users.delete`,
`users.update_role`, `permissions.manage`). Assim, nenhum ator — incluindo admin — força o
próprio logout nem dispara o reset da própria senha pelo painel.

## Componentes tocados

| Arquivo                                                   | Mudança                                              |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `src/lib/capabilities.ts`                                 | `defaultRoles` de 5 capabilities                     |
| `src/lib/permissions.ts`                                  | `SELF_RESTRICTED` += 2 capabilities                  |
| `src/app/dashboard/branches/[id]/page.tsx`                | gate de entrada → `branches.read`; abas/ações gateadas |
| `src/app/dashboard/suppliers/new/page.tsx`                | `requireRole` → `requireCapability`                  |
| `src/app/dashboard/branches/new/page.tsx`                 | `requireRole` → `requireCapability`                  |
| `src/app/dashboard/layout.tsx`                            | resolver e passar `getUserCapabilities`              |
| `src/app/dashboard/_components/app-sidebar.tsx`           | filtro genérico por capability                       |
| `src/app/dashboard/_components/nav-config.ts`             | `capability` nos itens de Relacionamento             |
| `src/app/dashboard/sem-acesso/page.tsx`                   | **novo** — página 403                                |
| `src/app/dashboard/customers/page.tsx` + `[id]`           | gate → `...OrRedirect` para 403                      |
| `src/app/dashboard/reviews/page.tsx` + `[id]`             | gate → `...OrRedirect` para 403                      |
| `src/app/dashboard/promotions/page.tsx`                   | adicionar gate `promotions.read`                     |
| `src/app/dashboard/tools/page.tsx`                        | adicionar gate `tools.read`                          |

## Testes / verificação

- **Unitários** (`apps/web`, vitest): `roleDefaultCapabilities("user")` reflete a matriz alvo
  (contém `suppliers.manage`; não contém `customers.read`/`reviews.read`/`promotions.read`/
  `site.read`); `SELF_RESTRICTED` contém os 6 itens.
- **`bun check-types` + `bun check`** (tsc não pega lint nem SQL em template string).
- **Smoke multi-role no browser** (porta 3001):
  - Como `user` (Marcos, oquiler@gmail.com, 3 filiais): sidebar enxuta (sem Relacionamento);
    ajuste de estoque funcionando na filial dele; fornecedor criável; acessar
    `/dashboard/customers` (e reviews/promotions/banners) por URL → cai em `/dashboard/sem-acesso`.
  - Como `admin`: confirmar que o detalhe de filial abre e o ajuste de estoque destravou.

## Riscos / observações

- A página de detalhe de filial monta várias abas; ao afrouxar o gate de entrada é preciso
  garantir que **toda** aba e ação interna gateie a sua capability (especialmente "Equipe", que
  expõe gestão de usuários). Revisar aba a aba na implementação.
- Schema **não** muda (nenhuma capability nova; só `defaultRoles`, que é código TS, não pgEnum).
  Sem `db:sync`.
- Mudança em `capabilities.ts` afeta apenas os defaults; usuários com overrides explícitos
  mantêm o que foi concedido/revogado individualmente.
