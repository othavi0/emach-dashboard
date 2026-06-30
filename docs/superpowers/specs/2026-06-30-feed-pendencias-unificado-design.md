# Feed unificado de Pendências

> Spec de design. Substitui o `PendingPanel` (abas por domínio) da `/dashboard` por um **feed único priorizado** ("Precisa de atenção"), corrige a inconsistência de contagem que mostrava "Pedidos 0", e moderniza o visual das linhas. O par `ActivityFeed` (à direita) é mantido.

## 1. Problema

O painel de Pendências atual tem 4 abas fixas por domínio (Estoque, Pedidos, Moderação, Promoções). Dois problemas:

1. **Contagem inconsistente (bug):** o badge da aba "Pedidos" usa `COUNT(*) WHERE status = 'paid'` (= 0, porque os pagos já avançaram para preparing/shipped/delivered), enquanto a **lista** da mesma aba (`fetchPendingOrders`) usa `ACTIVE_ORDER_STATUSES` (= 6). A aba exibe 6 itens com badge `0`. As demais contagens também não refletem necessariamente o que cada lista mostra.
2. **Abas vazias dão sensação de "abandonado":** Estoque e Promoções vivem zeradas com os dados atuais; clicar entre abas com `0` faz o painel parecer desatualizado.

## 2. Decisões (validadas com o dono)

| Eixo | Decisão |
|---|---|
| Escopo | Corrigir dados + elevar visual + repensar abas vazias. **Sem** ações inline (segue listando/navegando) |
| Arquitetura | **Feed unificado priorizado** (sem abas) — uma lista única de todas as pendências |
| Priorização | **Severidade fixa**: ruptura de estoque → pedido atrasado → review aguardando → estoque baixo → promoção expirando; dentro de cada tipo, mais antigo/crítico primeiro |
| Densidade da linha | **Rica**: ícone colorido por tipo + título + subtítulo (filial/cliente) + chip do tipo + badge de idade/severidade |
| Filtros | Chips por tipo no topo (Tudo / Estoque / Pedidos / Reviews / Promos) com contagem; clicar filtra |
| Empty state | "Tudo em dia" (ensina, não "Nada pendente nesse grupo") |
| Par ActivityFeed | Mantido à direita, sem mudança |

### Não-objetivos
- Ações inline (aprovar review / repor estoque / preparar pedido a partir da linha) — fica para depois.
- Mexer no `ActivityFeed`.
- Corrigir o erro SSR do `Sidebar` (`useSidebar must be used within a SidebarProvider`) — **issue separada**; é resquício do PPR/cacheComponents revertido (ADR-0022), recuperado via client render, ortogonal a este trabalho.

## 3. Comportamento do feed

- Título **"Precisa de atenção"** + contador total (soma real das pendências visíveis ao usuário).
- **Tipos** (cada um já tem query em `pending-data.ts`): rupturas/estoque baixo (`fetchPendingStock`), pedidos ativos (`fetchPendingOrders`), reviews pendentes (`fetchPendingReviews`), promoções expirando (`fetchExpiringPromotions`).
- **Ordenação (severidade fixa):**

  | Ordem | Tipo | Critério interno |
  |---|---|---|
  | 1 | Ruptura de estoque (`quantity = 0`) | menor quantidade primeiro |
  | 2 | Pedido atrasado/ativo | `created_at` mais antigo primeiro |
  | 3 | Review aguardando | `created_at` mais antigo primeiro |
  | 4 | Estoque baixo (`<= reorder_point`) | menor folga primeiro |
  | 5 | Promoção expirando | `ends_at` mais próximo primeiro |

  Estoque vira **dois níveis de severidade** (ruptura no topo, baixo mais abaixo), refletindo o `badge` que `fetchPendingStock` já distingue ("Sem estoque" vs "Repor").
- **Filtros por tipo:** chips no topo com contagem; o ativo filtra o feed (server-side, preservando o scroll incremental). "Tudo" é o default.
- **Linha rica:** reusa `status-visual` (`STATUS_ICONS`/`TONE_TEXT`) para o ícone colorido, o `chip` do tipo, e o `aging` que o `PendingRow` já suporta. Clicar navega para o `href` que cada query já fornece.
- **Capabilities:** reviews e promoções só entram no feed (e no contador) para quem tem `reviews.read` / `promotions.read` — mantém o gating atual de `fetchDashboardCounts`/`PendingSection`.
- **Empty state:** "Tudo em dia" quando o feed (sob o filtro ativo) está vazio.

## 4. Correção dos dados

- A contagem por tipo e o total passam a refletir **exatamente** a lista correspondente. Em particular, "Pedidos" conta `ACTIVE_ORDER_STATUSES` (alinhado a `fetchPendingOrders`), não `status = 'paid'`.
- `fetchDashboardCounts` (`pending-data.ts`) — a expressão `orders` muda de `status = 'paid'` para `status IN (ACTIVE_ORDER_STATUSES)` via `sqlStatusList`. Isso também corrige o badge "Pedidos" onde quer que `counts.orders` seja consumido (verificar a sidebar — `fetchDashboardCounts` alimenta badges lá também; confirmar que o alinhamento é desejado em todos os call-sites, ou derivar um count específico do feed).

## 5. Arquitetura técnica

- **Query unificada** `getPendingFeed` em `pending-data.ts`: **UNION ALL** dos blocos por tipo (gated por capability — bloco condicional, como `fetchDashboardActivity` já faz), cada bloco emitindo colunas normalizadas: `type`, `severity` (int 1–5), `sort_ts` (timestamp ou proxy de ordenação), `id`, e o payload para montar a `PendingRow` (`primary`, `secondary`, `href`, `badge_label`, `badge_role`, `icon_key`, `tone`, `aging`). **Wrap obrigatório em derived table** (`SELECT * FROM ( <blocos> ) AS feed ORDER BY severity, sort_ts LIMIT ...`) — o `packages/db/CLAUDE.md` documenta que `UNION ALL` + `ORDER BY` externo quebra com 1 bloco só (quando capabilities/filtro colapsam para um tipo) sem o wrap.
- **Volume pequeno** (dezenas de pendências) → teto `LIMIT ~50`; scroll incremental via cursor composto `(severity, sort_ts, id)`. Sem keyset sofisticado por-fonte; o cursor opera sobre a lista já unificada/ordenada.
- **Server action** `fetchPendingFeed(cursor, typeFilter?)` (`"use server"`) com `requireCurrentSession` + gating por capability; delega ao `getPendingFeed`. `typeFilter` restringe os blocos do UNION.
- **Contagens por tipo** para os chips: ou derivadas numa query de counts (estende `fetchDashboardCounts` com os tipos corretos), ou de um `GROUP BY type` sobre as fontes. Decidir no plano; o importante é que casem com a lista.
- **Componente** `PendingFeed` (client) — reusa `useInfiniteList` + `InfiniteSentinel`; renderiza a linha rica (ícone `status-visual` + chip + aging) e os chips de filtro. Substitui `PendingPanel` na `PendingSection` da `page.tsx`.
- **`PendingRow`** ganha o campo do `type`/chip se necessário (hoje já tem `iconKey`/`tone`/`badge`/`aging`); a linha rica consome esses campos.
- O `PendingPanel` (componente de abas) pode ser removido se nada mais o usa, ou mantido se outras rotas (`/orders`, `/customers`, `/users`) ainda o consomem — **verificar call-sites antes de remover** (`rg PendingPanel`); provavelmente outras rotas usam, então o `PendingFeed` é adição, não substituição global.

## 6. Gotchas / constraints

- **`UNION ALL` + `ORDER BY` externo**: sempre wrap em derived table (vale para 1 ou N blocos) — senão `ERROR 42601 multiple ORDER BY` quando os blocos colapsam para um (capability/filtro). Smoke do caminho de 1 bloco (deep-link `?type=`).
- **`db.execute` raw**: snake_case + timestamp como string; aliasar `AS "camelCase"` e coercer com `toDate` (`@emach/db/utils`) nos timestamps; `localDate` não se aplica (são `timestamptz`, não `::date`).
- **`"use server"`**: reads/tipos em `pending-data.ts` (`server-only`); a action é thin wrapper com guard.
- **AAA**: chip/severidade = ícone + cor + label (color-blindness), nunca só cor. `text-muted-foreground` ≥ contraste.
- **Verificação**: `tsc` não pega SQL inválido — smoke na 3008 com dados reais (o feed deve mostrar os 6 pedidos + 2 reviews, ordenados por severidade; contador = soma real; cada filtro de chip refiltra; deep-link `?type=reviews` exercita o caminho de 1 bloco). Gate: `bun verify` + `bun run build`.

## 7. Plano de verificação

1. `bun check-types` + `bun check` limpos.
2. Smoke na 3008: feed mostra pendências ordenadas por severidade; contador e chips refletem o banco (6 pedidos, 2 reviews com os dados atuais); badge "Pedidos" deixa de ser 0; filtro por chip refiltra; `?type=reviews` (caminho de 1 bloco) não dá erro 42601.
3. Capability: usuário sem `reviews.read` não vê reviews no feed nem no contador.
4. Empty state "Tudo em dia" quando vazio.
5. `bun run build` (gate `"use server"`).

## 8. Sequência de implementação (alto nível; detalhar no plano)

1. Corrigir `fetchDashboardCounts.orders` → `ACTIVE_ORDER_STATUSES` (fix isolado do bug; verificável de imediato).
2. `getPendingFeed` (UNION ALL normalizado + severidade + wrap em derived table) + contagens por tipo.
3. Server action `fetchPendingFeed(cursor, typeFilter)`.
4. Componente `PendingFeed` (linha rica + chips de filtro + empty state) reusando `useInfiniteList`/`status-visual`.
5. Trocar `PendingPanel` por `PendingFeed` na `PendingSection` da `page.tsx`.
6. Smoke + gate.
