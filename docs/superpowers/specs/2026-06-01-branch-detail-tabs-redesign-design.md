# Redesign das tabs de detalhe da filial

**Data:** 2026-06-01
**Rota:** `/dashboard/branches/[id]`
**Escopo:** Tabs Visão Geral, Equipe e Estoque. A tab Pedidos fica fora.

## Contexto

A página de detalhe da filial (`apps/web/src/app/dashboard/branches/[id]/page.tsx`)
tem 4 tabs renderizadas via `EntityTabs` (sincronizadas com a URL por `?tab=`).
Diagnóstico do estado atual (validado no browser + banco, filial Ribeirão Preto):

- **Visão Geral:** telefone exibido cru (`1636100000`), sem máscara; não mostra
  `status`, `businessHours` nem faixas de CEP de forma estruturada; layout é uma
  `<dl>` de 2 colunas pouco hierarquizada.
- **Equipe:** botão "Vincular usuário" ocupa uma barra full-width no corpo; membros
  aparecem como linhas densas de lista. Visual destoa do resto do dashboard.
- **Estoque:** grid de cards de SKU sem nenhum panorama de métricas.
- **"Editar filial"** vive no header global e aparece em **todas** as tabs.

## Princípio transversal: ações do header contextuais por tab

Hoje `BranchIdentity` renderiza "Editar filial" fixo, e `page.tsx` injeta
condicionalmente `AddToolButton` quando `sp.tab === "stock"`. Vamos generalizar:
a ação do canto superior direito passa a depender da tab ativa.

| `sp.tab`            | Ação no header        |
| ------------------- | --------------------- |
| `undefined`/overview| **Editar filial**     |
| `team`              | **Vincular usuário**  |
| `stock`             | **Adicionar ao estoque** (mantém) |
| `orders`            | — (nenhuma)           |

Viável porque `EntityTabs` faz `router.replace(?tab=...)` a cada troca, o que
re-renderiza o Server Component `page.tsx` e atualiza o header (mesmo mecanismo já
usado hoje pelo `AddToolButton`).

**Mudanças:**

- `page.tsx` computa a ação por `sp.tab` e passa para `BranchIdentity` via uma prop
  única (renomear `extraAction` → `actions`, removendo o "Editar filial" embutido).
- Extrair o handler de edição (`handleEdit` que seta `?edit=1`) para um pequeno
  client component `EditBranchButton` em `[id]/_components/`.
- "Vincular usuário" reusa o componente de vínculo (hoje `TeamLinkPanel`), agora
  posicionado no header em vez do corpo da tab.
- `BranchIdentity` deixa de importar `useRouter`/`Pencil` para a edição; passa a só
  renderizar `actions`.

## Visão Geral (`overview-tab.tsx`)

Layout **B**: mantém a `EntityKpisRow` no topo e troca a `<dl>` única por **dois
cards** lado a lado (`grid-cols-1 md:grid-cols-2`).

### Card "Endereço & contato"
- Header com título + `Badge` de status: **Ativa** (`success`) / **Inativa** (`secondary`).
- Endereço estruturado: rua + número, complemento, bairro, cidade/UF, CEP formatado
  (`formatCep` já existe).
- Link **"Abrir no Google Maps"** — `https://www.google.com/maps/search/?api=1&query=<endereço+urlencoded>`,
  `target="_blank"` + `rel="noopener"`. Sem API, sem custo.
- **Telefone** formatado por novo helper `formatPhone` (ver abaixo).
- **Responsável** — nome ou empty state "Não definido".

### Card "Operação"
- **Horário de funcionamento** (`businessHours`: `weekdays` / `saturday` / `holidays`)
  renderizado linha a linha; empty state "Não configurado" quando `null`.
- **Faixas de CEP atendidas** (`cepRanges`); empty state "Nenhuma faixa cadastrada".
- **Sistema**: criada em / atualizada em (datas já formatadas).

### Empty states
Filiais reais têm `businessHours`, `cepRanges` e responsável frequentemente nulos
(caso Ribeirão Preto). Os placeholders devem ser discretos e elegantes (texto
`muted`/itálico), nunca quebrados.

### Novos helpers (`apps/web/src/lib/format/`)
- `formatPhone(raw)`: normaliza dígitos; 10 dígitos → `(XX) XXXX-XXXX`,
  11 dígitos → `(XX) XXXXX-XXXX`; retorna o valor cru se não casar. Regex como
  constante top-level (não dentro de função chamada em loop).
- `formatBusinessHours(bh)` (ou render inline): converte a estrutura em linhas
  legíveis ("Seg–Sex 08:00–18:00", "Fechado" quando `isOpen=false`).

## Equipe (`team-tab.tsx`, `team-list.tsx`, `team-link-panel.tsx`)

Substituir a lista de linhas por um **grid de cards no estilo `UserCard`**.

### Posicionamento
- `TeamLinkPanel` ("Vincular usuário") sai do corpo da tab e vira a **ação
  contextual do header** (ver princípio transversal). O Popover de busca de usuários
  permanece igual, só muda de lugar.

### Card de membro (`TeamMemberCard`, novo)
Espelha o `UserCard` (`users/_components/user-card.tsx`), versão compacta:
- **Header:** avatar (iniciais via `getInitials`) + nome + email + `Badge` de status
  (`active`=success / `pending`=warning / `suspended`=destructive).
- **Sem faixa de chips** (decisão: card mais compacto).
- **Rodapé:** role (label PT) + último login (relativo) + botão **"Desvincular"**.
- Card inteiro clicável → `/dashboard/users/[userId]`. O botão "Desvincular" faz
  `stopPropagation` e abre confirmação leve (`AlertDialog`) antes de chamar
  `unlinkUserFromBranchAction` (hoje desvincula direto, sem confirmação).
- Grid responsivo `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
  (igual `users-card-grid.tsx`).

### Dados
`getBranchTeam` (`branches/data.ts`) hoje retorna `userId/name/email/role/image/linkedAt`.
Adicionar **`status`** e **`lastLoginAt`** ao `select` e ao tipo `BranchTeamRow`.

### Empty state
Manter o vazio atual (0 membros), ajustando o texto — o CTA de vincular agora está
no header, não "no botão acima".

## Estoque (`branch-stock-card.tsx`)

Opção **C**: cada card de SKU ganha um **footer de 3 colunas** (Qtd / Mín / Repor)
idêntico ao footer dos cards de filial (`branches/_components/branch-card.tsx`).

- Substitui a linha compacta atual (`Qtd: N` + `Mín N · Rep N`).
- **Coluna Qtd herda a cor do status:** crítico → `destructive` (vermelho),
  repor → `warning`/âmbar, OK/sem-limite → cor neutra. Mín e Repor sempre neutros.
- Quando `minQty === 0` / `reorderPoint === 0`, a célula mostra "—" (dim).
- Badge de status na imagem (Crítico/Repor/OK) **mantido**.
- Clique no card continua abrindo o painel de ajuste (`onSelect` → `BranchStockEditSheet`).
- Nome continua linkando para a ficha da ferramenta.
- **Sem** painel global de resumo e **sem** ações extras (decisão explícita).

A função `stockStatus(row)` já existe no componente e define o status — reusar para
colorir a coluna Qtd.

## Fora de escopo

- Tab Pedidos.
- Mapa interativo / Static Maps (custo — substituído por link).
- Painel de resumo agregado de estoque, exportação CSV, ajuste em massa (opções A/B
  descartadas).
- O complemento `[MOCK]` da filial Ribeirão Preto é dado de seed, não bug de UI.

## Convenções a respeitar (CLAUDE.md)

- `key` estável em `.map()` (usar `userId`/`variantId`).
- `logger`, nunca `console`.
- React Compiler ativo → sem `useMemo`/`useCallback` manuais.
- Avatares/thumbs Supabase via `<img>` com `biome-ignore` documentado (padrão atual).
- `formatPhone` com regex em constante top-level.
- Server actions mantêm `requireCapability*` (no-op hoje, mas obrigatório — ADR-0012).

## Verificação

`bun check-types` + smoke visual em `/dashboard/branches/7b2b8bb5-e85d-4c6b-872d-3dbbe0dc307d`
nas 3 tabs (overview / team / stock), via Claude-in-Chrome no Brave "Notbook"
(servidor de dev na porta 3001). `tsc` não pega SQL inválido — validar a query da
equipe com os campos novos no runtime.
