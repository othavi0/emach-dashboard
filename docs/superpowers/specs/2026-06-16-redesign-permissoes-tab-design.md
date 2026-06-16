# Redesign da tab de Permissões — design

**Data:** 2026-06-16
**Status:** Design aprovado (via brainstorming + visual companion) — pronto para plano
**Relaciona:** ADR-0017 (permissões por usuário), ADR-0016 (gates 3 níveis + filial), issue #184 (nota super_admin — já implementada)
**Origem:** queixas do usuário sobre a tab `users/[id]?tab=permissoes` — controle confuso, seções mal separadas, e "não sei o que controla ver na sidebar".

## Problema

A tab de Permissões (grid tri-state `Herdar/Conceder/Revogar` por capability, `permissions-tab.tsx`) tem três problemas:

1. **Controle ambíguo.** "Herdar (sim/não)" tenta comunicar duas coisas (o padrão do nível **e** que não há override) num rótulo só. 3 botões fixos × 47 linhas.
2. **Taxonomia descasada.** O grid agrupa pelas 7 categorias de capability (`meta.group`: Catálogo, Clientes, Filiais, Inventário, Site, Usuários, Vendas), que não batem com as 6 seções da sidebar (Visão, Operação, Catálogo, Relacionamento, Sistema, Administração). O usuário pensa em termos da navegação.
3. **A permissão "Ver" quase não controla a sidebar.** `app-sidebar.tsx:47-56` só gateia dois itens ("Usuários" via `canManageUsers`, "Configurações" via `site.update_settings`). Todo o resto aparece para todos, independente das caps `*.read`. Revogar "Ver Ferramentas" não esconde Ferramentas — daí a confusão.

## Decisões (do brainstorming visual)

| Dimensão | Decisão |
|---|---|
| **Controle da linha** | Tri-state **Padrão / Permitir / Bloquear** (substitui Herdar-sim/não / Conceder / Revogar). O "padrão do nível" vira texto separado, não rótulo do botão. Mapeia 1:1 ao back atual: Padrão = `inherit`, Permitir = `grant`, Bloquear = `revoke`. |
| **Layout** | **Matriz por seção → recurso → ações** (granular, "B1"). Seções alinhadas à sidebar; 1 linha por recurso; as ações reais daquele recurso, rotuladas, cada uma com o tri-state compacto (`◌ ✓ ✕`). |
| **Granularidade** | **Mantida** — 1 controle por capability (não agrupar em níveis). Preserva o modelo de back atual; só muda apresentação. |
| **Muitas ações** | **Scroll horizontal interno** na linha do recurso (nada recolhido — todas as ações sempre acessíveis via scroll, com fade indicando continuação). |
| **Mestre por seção** | Controle no header da seção (Padrão/Permitir/Bloquear) que aplica a **todas** as caps editáveis da seção de uma vez. Selo **"Misto"** quando as caps divergem (não finge um valor). |
| **Sidebar** | **Espelhar permissões** — a cap `<resource>.read` passa a gatear o item na sidebar (revogar "Ver X" esconde X da navegação do usuário). **Mudança de comportamento → isolada na Fase 2.** |
| **super_admin** | Mantém a nota "Acesso total irrestrito" (issue #184) — sem matriz para alvo super_admin. |

## Faseamento

O redesign visual (Fase 1) é independente e de baixo risco. O gating da sidebar (Fase 2) muda comportamento de navegação de todos os roles e exige cuidado fail-closed — entregue separado, depois da Fase 1 validada.

---

## Fase 1 — Redesign da tela (visual + organização + mestre)

### 1.1 Metadata: seção de navegação

Hoje `CAPABILITIES[cap]` tem `{ group, resource, action, description, defaultRoles }`. O `group` (7 categorias) só é consumido por `permissions-tab.tsx`. Substituir `group` por **`section`** (a seção da sidebar), mantendo `resource` e `action`.

Mapa **recurso → seção** (alinhado a `nav-config.ts`):

| Seção | Recursos (capability) |
|---|---|
| Operação | Pedidos, Filiais |
| Catálogo | Ferramentas, Atributos, Categorias, Fornecedores, Estoque |
| Relacionamento | Clientes, Avaliações, Promoções |
| Sistema | Site |
| Administração | Usuários, Permissões, Auditoria |

(Visão/Dashboard não tem capability — acesso livre.) Ordem das seções na tela = ordem da sidebar.

### 1.2 Estrutura de dados para a tela

Em vez do agrupamento plano atual (`Map<group, Row[]>`), montar uma árvore **seção → recurso → ações**:

```
SectionView { section, resources: ResourceView[] }
ResourceView { resource, actions: ActionRow[] }
ActionRow { cap, action, defaultOn, state: "inherit"|"grant"|"revoke", editable }
```

- `defaultOn` = `roleDefaults.has(cap)` (texto "padrão do nível: permitido/negado").
- `state` = override atual (`inherit` se ausente).
- `editable` = `manageableCaps.has(cap)` (controles de caps que o ator não pode gerir ficam desabilitados — comportamento atual preservado).
- Ações ordenadas: **Ver primeiro**, destrutivas (Deletar/Cancelar/Estornar/Suspender/Alterar role) por último, resto na ordem do catálogo.

### 1.3 Controle tri-state (`Padrão / Permitir / Bloquear`)

Componente compacto reutilizável (ex: `<CapabilityTriState>`), `ToggleGroup` de 3 opções:
- `inherit` → "Padrão" (default visual quando sem override).
- `grant` → "Permitir".
- `revoke` → "Bloquear".

Mantém `onChange(cap, state)` → `setUserCapability` (action atual, **sem mudança no back** do toggle individual). O texto do padrão do nível ("permitido"/"negado") fica ao lado do nome da ação, fora do controle.

### 1.4 Mestre por seção

Header de cada seção recebe um controle Padrão/Permitir/Bloquear que aplica a **todas as caps editáveis** da seção:

- **Estado agregado:** se todas as caps editáveis da seção têm o mesmo `state` → o mestre mostra esse estado; se divergem → selo **"Misto"** (`● Misto`, sem estado ativo no segmented).
- **Ação:** clicar num estado do mestre aplica esse estado a todas as caps editáveis da seção, via nova action **`setSectionCapabilities`**.
- **`setSectionCapabilities({ targetUserId, capabilities: Capability[], state })`** (`permissions/actions.ts`):
  - Valida `permissions.manage` + hierarquia + branch-scope **uma vez** (mesmo `requireCapabilityWithContext` do `setUserCapability`).
  - Aplica a **regra da issue #184**: rejeita se o alvo é `super_admin` e `state !== "inherit"` (a nota já esconde a UI, mas a action é defesa-em-profundidade).
  - Itera as caps numa transação; grava/deleta override por cap; audita (pode ser um evento agregado `permission.bulk_set` com a lista, ou um por cap — decidir no plano; preferência: um evento agregado com `{ section, capabilities, state }` para não inundar o log).
  - Anti-escalada: `grant` em massa só concede caps que o ator possui (espelha a regra de `setUserCapability`); caps que o ator não pode conceder são puladas (não falha o lote).

### 1.5 Componente

Reescrever `permissions-tab.tsx`:
- Recebe as mesmas props atuais (`manageableCaps`, `overrides`, `roleDefaults`, `targetUserId`) — a `page.tsx` não muda nesta fase (além de já passar tudo).
- Monta a árvore seção→recurso→ação a partir de `CAPABILITIES` (agora com `section`).
- Renderiza: seção (header + mestre) → recurso (nome + linha de ações com scroll-x) → controle tri-state por ação.
- Mantém `useTransition` para os toggles; otimista ou revalidate (manter o padrão atual de `revalidatePath`).
- Acessibilidade: cada tri-state com `aria-label` "Resource · Action"; o scroll-x com `tabindex`/teclado para alcançar ações fora da viewport.

A nota de super_admin (issue #184, `SuperAdminPermissionsNotice`) permanece intocada — `page.tsx` decide entre nota e matriz como hoje.

### 1.6 Testes (Fase 1)

- `setSectionCapabilities`: aplica `grant`/`revoke`/`inherit` a N caps; rejeita sobre alvo super_admin (state≠inherit); pula caps não-editáveis; audita.
- Helper de montagem da árvore seção→recurso→ação: dado o catálogo + overrides, produz a estrutura correta, ordem de ações (Ver primeiro, destrutivas por último).
- Cálculo do estado do mestre: uniforme vs "Misto".
- Smoke visual: matriz densa por seção, scroll interno em Usuários, mestre uniforme e misto, alvo super_admin mostra a nota.

---

## Fase 2 — Sidebar espelha as permissões (comportamento)

### 2.1 Princípio

Cada item da sidebar passa a ser gated pela cap `<resource>.read` correspondente. Sem a cap efetiva → o item não aparece (**fail-closed**). Dashboard (Visão) permanece sempre visível.

### 2.2 Mapa item → cap (proposto)

| Item nav | Cap |
|---|---|
| Pedidos | `orders.read` |
| Filiais | `branches.read` |
| Ferramentas | `tools.read` |
| Categorias | `categories.read` |
| Fornecedores | `suppliers.read` |
| Movimentações | `stock.read` |
| Clientes | `clients.read` |
| Avaliações | `reviews.read` |
| Promoções | `promotions.read` |
| Banners | `site.read` *(decisão: read vs update_banners — definir no plano)* |
| Configurações | `site.update_settings` *(mantém o atual)* |
| Usuários | `users.read` *(substitui `requiresManageUsers`? definir no plano)* |

### 2.3 Implementação

- `nav-config.ts`: cada `NavItemConfig` recebe `capability` (a read cap). Remover o esquema atual `requiresManageUsers` / o filtro ad-hoc de `caps`.
- `app-sidebar.tsx`: receber o **conjunto efetivo de caps** do usuário (via `layout.tsx`, que já resolve sessão) em vez de só dois booleans; filtrar itens por `caps.has(item.capability)`. Seção sem nenhum item visível → não renderiza o header.
- `layout.tsx`: passar `getUserCapabilities(session)` resolvido para a sidebar.
- **Fail-closed:** item sem cap definida → decisão explícita (mostrar ou esconder); default = mostrar só se houver cap e o usuário a tiver. Dashboard é exceção (sempre visível).

### 2.4 Riscos (Fase 2)

- Afeta a navegação de **todos** os roles. Smoke multi-role obrigatório (super_admin vê tudo; admin/user veem só o permitido).
- `super_admin` tem todas as caps (Camada 1 da issue #184) → vê tudo, sem regressão.
- Itens "Notificações" (disabled) e Banners/Configurações (resource Site) precisam de decisão fina de cap (2.2).

### 2.5 Testes (Fase 2)

- Filtro da sidebar: dado um conjunto de caps, retorna os itens corretos; esconde seção vazia; Dashboard sempre presente.
- Smoke multi-role: super_admin (tudo), admin com algumas read revogadas (itens somem), user operacional.

---

## Arquivos afetados

**Fase 1:**
- `src/lib/capabilities.ts` — `group` → `section` + valores do mapa 1.1.
- `src/app/dashboard/users/[id]/_components/permissions-tab.tsx` — reescrita (matriz seção→recurso→ação, tri-state, mestre, scroll-x).
- `src/app/dashboard/users/[id]/permissions/actions.ts` — nova `setSectionCapabilities`; `setUserCapability` inalterada.
- (possível) `src/app/dashboard/users/[id]/_components/capability-tristate.tsx` — controle reutilizável.
- Testes em `apps/web/__tests__/`.

**Fase 2:**
- `src/app/dashboard/_components/nav-config.ts` — `capability` por item.
- `src/app/dashboard/_components/app-sidebar.tsx` — filtro por caps efetivas.
- `src/app/dashboard/layout.tsx` — passar caps efetivas.
- Testes da sidebar.

## Fora de escopo

- Mudar o modelo de overrides do back (continua `grant`/`revoke`/`inherit`, ADR-0017).
- Reagrupar/renomear capabilities além do campo `section`.
- A opção "3 níveis" (B2) — descartada (perde granularidade).

## Critério de aceite

- **Fase 1:** tab mostra matriz densa por seção (alinhada à sidebar), controle Padrão/Permitir/Bloquear, mestre por seção com "Misto", scroll interno em recursos com muitas ações; alvo super_admin mantém a nota; testes verdes; `check-types` + `bun check` limpos; smoke visual.
- **Fase 2:** revogar `<resource>.read` esconde o item da sidebar do usuário; fail-closed; super_admin vê tudo; smoke multi-role.
