# Redesign da Sidebar do dashboard

**Data:** 2026-06-29
**Escopo:** `apps/web/src/app/dashboard/_components/*` (sidebar da aplicação) + tokens em `packages/ui/src/styles/globals.css`.
**Tipo:** redesign visual + reorganização de IA + remoção da busca global.

## Contexto e motivação

A sidebar atual (shadcn `Sidebar collapsible="icon"`, tema warm-dark + coral) está funcional mas "sem graça": lista monocromática plana onde tudo tem o mesmo peso visual, header dominado por uma busca pouco usada, e um footer que esconde 2 ações (Perfil/Sair) atrás de um dropdown — interação que não encaixa pra só duas opções.

Três objetivos, validados em brainstorming visual:

1. **Remover a busca global por completo** (não é usada no sistema; ocupa o lugar nobre do topo).
2. **Dar vida funcional** ao chrome — peso visual real no estado ativo, cor-de-sistema nos badges, identidade no footer. Dentro dos limites do register `product` (impeccable): personalidade vem de função, não decoração; Cormorant proibido no chrome; motion = estado, não espetáculo.
3. **Reorganizar a IA** (esquema "por fluxo de trabalho").

Direção visual escolhida: **A — Workshop denso** (a mais fiel à voz "engenheiro denso" do `PRODUCT.md`). IA escolhida: **Esquema 2 — por fluxo de trabalho**.

## Decisões de design (aprovadas)

### 1. Busca global — remoção total

Deletar e remover todas as referências:

| Arquivo | Ação |
|---|---|
| `_components/command-palette.tsx` | **deletar** |
| `search-actions.ts` | **deletar** (server action `globalSearch`) |
| `_lib/global-search.ts` | **deletar** (tipos `SearchResults`) |
| `_lib/global-search.server.ts` | **deletar** (`runGlobalSearch` + queries) |
| `_lib/__tests__/global-search.test.ts` | **deletar** |
| `_components/app-sidebar.tsx` | remover import de `CommandPalette`, o estado `commandOpen`/`setCommandOpen` e o render no header |

O atalho global **⌘K** vive dentro do `CommandPalette` (listener de `keydown`) — morre junto, sem resíduo.

Limpeza derivada: o campo `requiresManageUsers` em `nav-config.ts` só era consumido pelo `command-palette`. Remover o campo da interface `NavItemConfig` e do item `Usuários` (o gate de Administração já é feito por `canManageUsers` no `app-sidebar`).

### 2. Visual (Direção A — workshop denso)

- **Estado ativo = pill coral.** Fundo `bg-primary/15` (coral 15% alpha) + ícone `text-primary` + texto `text-sidebar-foreground` + `font-medium`. Substitui o destaque sutil atual (hoje só ícone coral sobre bg accent). Aplicado em `nav-item.tsx` quando `isActive`.
- **Badges com cor-de-sistema** (`nav-badge.tsx`): manter o pill, mas mapear a role à semântica do contador — estoque baixo (`stock`) usa `warning` (mustard); pedidos/separação/reviews/users usam o tom coral-tint/secondary atual. (Refinamento incremental; não inventar roles novas.)
- **Labels de grupo** como section markers consistentes com o type system: `text-[11px] uppercase tracking-wider text-muted-foreground` (`nav-group.tsx` → `SidebarGroupLabel`).
- **Header:** logo `emach-nome-branco.svg` (asset real) **alinhado à esquerda** (hoje centralizado) + uma **tag "admin"** discreta (`text-[9px] uppercase tracking-widest`, borda hairline) como assinatura de identidade. No modo recolhido (icon), o wordmark some e aparece um **stamp coral "E"** (não existe asset de marca-só; o stamp é CSS/inline).

### 3. Footer — barra de identidade (sem dropdown na expandida)

Reescrever `sidebar-footer-user.tsx`. **Manter exportada** a função pura `getSidebarProfileHref` (coberta por teste).

- **Avatar** carrega a imagem real do usuário (`AvatarImage` com `user.image`); fallback nas iniciais (`AvatarFallback` + `getInitials`) — comportamento que já existe.
- **Bloco:** avatar + nome + **role em coral** (`text-primary`, `text-[10px] uppercase tracking-wide`) — substitui o email como segunda linha (mais identidade; email é ruído no chrome).
- **Ações diretas:** Perfil e Sair como **dois botões de ícone** (`User`, `LogOut`) ao lado, sem menu. Sair mantém o fluxo atual (`authClient.signOut` → `router.replace("/login")` + `refresh`), com `disabled` durante `isSigningOut`.
- **Modo recolhido (icon):** sem espaço pros dois ícones inline. Detectar via `useSidebar().state === "collapsed"` e, **só nesse modo**, renderizar o avatar como trigger de um popover/dropdown pequeno com Perfil + Sair. O dropdown volta exclusivamente aqui (onde o espaço justifica); na expandida ele não existe.

### 4. Organização (Esquema 2 — por fluxo de trabalho)

Reescrever `NAV_GROUPS` em `nav-config.ts`. Mesmos itens, capabilities e `badgeKey` preservados; muda só o agrupamento e a ordem. **Dashboard sai de um grupo e vira item solto no topo** (sem `SidebarGroupLabel`).

| Grupo | Itens (label → href, capability, badge) |
|---|---|
| _(sem rótulo, topo)_ | Dashboard → `/dashboard` (exact) |
| **Vendas** | Pedidos (`badge: orders`) · Separação (`cap: orders.pick`, `badge: picking`) · Movimentações → `/dashboard/stock/movements` |
| **Catálogo** | Ferramentas (`badge: stock`) · Categorias · Fornecedores |
| **Loja & Clientes** | Promoções (`cap: promotions.read`) · Banners (`cap: site.update_banners`) · Clientes (`cap: customers.read`) · Avaliações (`cap: reviews.read`, `badge: reviews`) |
| **Configuração** | Filiais · Frete (`cap: shipping.read`) · Configurações (`cap: site.update_settings`) |
| **Administração** | Usuários (`badge: users`, gated por `canManageUsers`) |

Mudanças vs. hoje: Dashboard solto; Movimentações Catálogo→Vendas; Filiais Operação→Configuração; Promoções/Banners e Clientes/Avaliações unidos em "Loja & Clientes"; grupos "Visão"/"Operação"/"Relacionamento"/"Sistema" deixam de existir como rótulos.

O item **Notificações** (hoje `disabled: true`, "em breve") é **simplesmente omitido** do `NAV_GROUPS` nesta versão. Atenção: o filtro do `app-sidebar` (`.filter((g) => g.items.some((item) => !item.disabled))`) só descarta grupos cujos itens são **todos** `disabled` — ele **não** esconde um item disabled isolado dentro de um grupo com itens ativos. Logo, manter Notificações dentro de "Loja & Clientes" o renderizaria como "em breve"; pra deixá-lo fora, não incluir o item. Reintroduzir quando a feature existir. (Com a omissão, o branch de render `item.disabled` no `nav-item.tsx` fica sem uso — manter mesmo assim, é defensivo e barato.)

Manter intactos: `isNavItemActive`, `DASHBOARD_HREF`, a filtragem por capability/`canManageUsers` no `app-sidebar`, o `countsPromise` e o consumo lazy de badges sob `<Suspense>`.

### 5. Motion — remover o stagger de entrada

Remover a animação de entrada `nav-item-animate` (o wrapper `<div className="nav-item-animate" style={{animationDelay}}>` em `nav-group.tsx`) — é uma "page-load sequence" desencorajada no register `product` ("users don't want to watch it load"). Renderizar os itens direto no `SidebarMenu`. Remover o `@keyframes nav-item-in` + `.nav-item-animate` de `packages/ui/src/styles/globals.css` (uso único). Manter só transições de **estado** (ativo/hover) já fornecidas pelos componentes.

## Arquivos afetados (resumo)

**Deletar:** `command-palette.tsx`, `search-actions.ts`, `_lib/global-search.ts`, `_lib/global-search.server.ts`, `_lib/__tests__/global-search.test.ts`.

**Editar:**
- `_components/app-sidebar.tsx` — remover busca/estado; header esquerda + tag + stamp recolhido.
- `_components/nav-config.ts` — `NAV_GROUPS` esquema 2; remover `requiresManageUsers`.
- `_components/nav-group.tsx` — remover wrapper de stagger; label como section marker.
- `_components/nav-item.tsx` — estado ativo pill coral.
- `_components/nav-badge.tsx` — mapear `warning` pra `stock`.
- `_components/sidebar-footer-user.tsx` — barra de identidade inline + popover no recolhido; role coral; manter `getSidebarProfileHref`.
- `_components/sidebar-skeleton.tsx` — refletir nova estrutura (sem botão de busca; footer com avatar+linha).
- `packages/ui/src/styles/globals.css` — remover keyframes/classe do stagger.

**Não muda:** `dashboard/layout.tsx` (mobile header com "emach" serif fica como está — fora de escopo), `pending-data.ts` (`fetchDashboardCounts`/`DashboardCounts`), gates de capability.

## Acessibilidade e invariantes

- Botões de ícone (Perfil/Sair) com `aria-label` explícito. Popover do recolhido fecha no `Esc`.
- Contraste AAA mantido: texto do footer em `--sidebar-foreground`; role em coral sobre `--sidebar` precisa passar ≥4.5:1 (coral `#cc785c` sobre `#171612` ≈ 5.9:1 — ok pra texto large/label).
- `prefers-reduced-motion`: como o motion decorativo sai, não há regressão; transições de estado respeitam a media query existente.
- Sem `console.*`, sem `: any`, sem `key={index}` em `.map()` (itens têm `href` estável). `next/image` no logo (já é).

## Verificação

1. `bun check-types` + `bun check` (ultracite) + `bun --cwd apps/web test`.
2. **Smoke visual obrigatório** (`check-types` não pega hook client em Server Component nem layout quebrado): subir `bun dev:web` e visitar `/dashboard` — conferir:
   - header sem busca, logo à esquerda + tag;
   - estado ativo pill coral na rota atual; badges aparecendo;
   - footer: avatar com foto (e fallback iniciais), Perfil navega pro próprio user, Sair desloga;
   - recolher a sidebar (rail) → ícones + stamp "E" + avatar abre popover com as 2 ações;
   - grupos do esquema 2 na ordem certa; filtragem por role (logar como `admin`/`user` mostra menos itens).
3. Confirmar que nenhum import órfão aponta pros arquivos deletados (`grep` por `global-search`/`command-palette`/`globalSearch`/`CommandPalette`).

## Fora de escopo

- Favoritos/fixados e grupos colapsáveis (eram do esquema B/1, não escolhidos).
- Reintrodução de Notificações.
- Mobile header serif em `layout.tsx`.
- Qualquer mudança no app e-commerce (DB compartilhada; sidebar é exclusiva do dashboard).
