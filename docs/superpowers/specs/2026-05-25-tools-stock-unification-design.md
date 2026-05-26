# Unificação Tools × Stock — UX e arquitetura

**Data:** 2026-05-25
**Contexto:** Dashboard admin. Rotas `/dashboard/stock`, `/dashboard/tools`, `/dashboard/tools/[id]` e `/dashboard/branches/[id]/stock`.

## Problema

1. **Duplicação na sidebar.** `Estoque Geral` e `Ferramentas` listam quase o mesmo objeto com o mesmo card. Click em qualquer um vai pro mesmo detalhe.
2. **Listagens não usam filiais.** O card já recebe `branches[]` no shape mas a UI não filtra nem segmenta — invisibilizando o conceito que o resto do sistema usa (`user_branch`, `branch_tool`, `stock_level`).
3. **Detalhe `/tools/[id]` raso.** Scroll vertical longo sem tabs; tabela "Estoque por variante e filial" é somente leitura; sem histórico, sem pedidos relacionados, sem ajuste inline.
4. **Ações de catálogo dispersas.** Editar fica em rota dedicada (`/tools/[id]/edit`), ajuste de estoque em outra (`/tools/[id]/stock`), deletar só no card da lista. Nenhuma vive onde a atenção está.
5. **Bug de permissão.** `/tools/[id]/stock` exige `role === "admin"`; resto do estoque aceita `admin || manager`.

## Escopo

**Dentro:**
- Consolidar `/dashboard/stock` e `/dashboard/tools` numa listagem única com toggle de modo.
- Reescrever `/dashboard/tools/[id]` em formato tabs (Visão geral · Variantes & preços · Estoque · Atividade · Avaliações).
- Header sticky de identidade com ações inline (sem dropdown "Mais").
- Tab Estoque: matriz variante × filial editável, sheet com qty + limites + motivo + nota + últimos movimentos.
- Tab Atividade: timeline + KPIs + filtros + paginação real + export CSV.
- Listagem com filtro de filial, modo "Repor agora", scoping por `user_branch`.
- Atualizações em `/dashboard/branches/[id]/stock` (alinhar linguagem visual).
- Sidebar: remove grupo Estoque; badge "N a repor" no link de Ferramentas.
- Redirects das rotas antigas.
- Correções de permissão.

**Fora (ADRs/tickets próprios):**
- Transferência entre filiais (precisa schema change: `reason="transferencia"` + `transfer_id`).
- Tracking de instância individual (condição novo/usado/danificado, serial number).
- Bulk actions na listagem (conflita com card grid; precisaria toggle grid/tabela).
- Importação CSV de catálogo (slot preservado, implementação separada).
- Resolução do quirk `audit.read` (manager+super_admin têm, admin não — decisão de produto).

## Arquitetura de rotas

```
/dashboard/tools                      → listagem unificada com ?mode=catalog|repor
/dashboard/tools/[id]                 → detalhe com tabs ?tab=visao-geral|variantes|estoque|atividade|avaliacoes
/dashboard/tools/[id]?edit=1          → sheet de edição de metadados (substitui /edit)
/dashboard/branches/[id]/stock        → mantém, modernizada

/dashboard/stock                      → 301 → /dashboard/tools?mode=repor
/dashboard/tools/[id]/stock           → 301 → /dashboard/tools/[id]?tab=estoque
/dashboard/tools/[id]/edit            → 301 → /dashboard/tools/[id]?edit=1
/dashboard/stock/branches/page.tsx    → removido (arquivo órfão identificado na auditoria)
```

## Listagem `/dashboard/tools`

### Toggle de modo

Segmented control no topo controla `?mode=catalog|repor`. URL bookmarkable; default `catalog`.

| Modo | Conteúdo | Default sort | Filtros adicionais |
|---|---|---|---|
| Catálogo | Todas as ferramentas | Mais nova | Visibilidade, status, NCM, fornecedor |
| Repor agora | Ferramentas com pelo menos um `(variant, branch)` com `quantity <= reorderPoint` | Urgência | Segmento `Tudo / Crítico / Repor` |

Toggle exibe count: `Catálogo 128` · `Repor agora 47`. Em modo Repor, badge fica em laranja escuro tonal (`bg-primary/10 text-primary`).

### Filtros principais (sempre visíveis)

- Busca por nome ou SKU
- Filial (single-select com opção especial "Minhas filiais"). Para non-`super_admin` com `user_branch` restrito, **default = "Minhas filiais" agregadas** — backend soma `stock_level` das filiais permitidas; usuário pode trocar pra uma filial específica via dropdown. `super_admin` default = "Todas".
- Categoria (hierárquica)
- Status

`⊕ Mais filtros` abre popover com: Visibilidade, NCM, Fornecedor, Data de criação. Não polui a barra principal.

### Card

**Modo Catálogo** — reusa `ToolCard` atual (já redesenhado em `2026-05-25-tool-card-redesign-design.md`). Single mudança: badge "⚠ N críticas" no rodapé quando aplicável, vermelho destrutivo.

**Modo Repor** — variante nova `repor`:
- Esconde galeria/variantes/visibilidade.
- Header só com imagem + categoria.
- Body destaca filiais em alerta: `⬤ São Paulo · 127V · 3 ≤ 5` (uma linha por (variante × filial) abaixo do ponto).
- Borda do card colorida pelo pior nível na ferramenta (`border-destructive/40` se algum crítico, `border-warning/40` se só repor).

### Header da página

Título + subtítulo (`128 itens · 47 em alerta`). Ações: `↑ Importar CSV` (placeholder; spec só preserva slot), `+ Nova ferramenta`.

## Detalhe `/dashboard/tools/[id]`

### Header sticky

```
[thumb 56×56]  / Ferramentas /
               Nome da ferramenta (18px semibold)
               [● Ativa] SKU · Fornecedor · ● Visível no site

                                                  [⎘] [⊘] [⌗] [🗑]  | ✎ Editar  + Ajustar estoque
```

Ações inline, sem dropdown:

| Tier | Ação | Estilo |
|---|---|---|
| Primária | `+ Ajustar estoque` | `bg-primary text-primary-foreground` |
| Secundária | `✎ Editar` | `outline`, com label |
| Terciárias | Duplicar · Ocultar/Mostrar · Descontinuar/Reativar | `outline`, ícone-só, tooltip |
| Destrutiva | Deletar | `outline`, ícone-só, `border-destructive/40 text-destructive` |

- Separador vertical (`w-px h-6 bg-border`) entre terciárias e CTAs.
- Toggles trocam label conforme estado (Ocultar↔Mostrar, Descontinuar↔Reativar).
- Em `<1280px`, terciárias colapsam num `•••` defensivo (não rotulado "Mais").
- `+ Ajustar estoque` abre o sheet de ajuste pré-preenchido com a filial+variante padrão (ou a única, se houver uma só).
- `✎ Editar` aplica `?edit=1` e abre **sheet lateral** (~480-560px) com o form atual reaproveitado. Decisão travada: sheet, não drawer bottom nem página dedicada.

### Strip de alerta

Logo abaixo do header, condicional: `⚠️ N filiais abaixo do ponto de reposição — São Paulo (3 ≤ 5), Curitiba (1 ≤ 3)`. Estilo `bg-destructive/15 border-destructive/40 text-destructive`. Click leva pra tab Estoque.

### Tabs

5 tabs. Active state: `text-primary border-b-2 border-primary`. Badge dentro da tab usa `bg-primary/10 text-primary` arredondado.

| Tab | Slug | Badge |
|---|---|---|
| Visão geral | `visao-geral` (default) | — |
| Variantes & preços | `variantes` | — |
| Estoque | `estoque` | nº de filiais críticas (omitir se 0) |
| Atividade | `atividade` | — |
| Avaliações | `avaliacoes` | nº de reviews pendentes (futuro) |

URL: `?tab=<slug>`. Tab perdura entre navegações (browser back funciona).

### Tab Visão geral

Layout 2 colunas: principal + aside (280px no desktop).

**Principal:**
- Galeria de imagens (grid 4 cols, lightbox no click — já existe).
- Descrição (Markdown sanitizado — já existe).
- Accordion `Fiscal & Specs técnicas ▾` — colapsado por default. Engloba HS Code, NCM, CEST, modelo, fabricante, potência, peso, dimensões e specs dinâmicas da categoria.

**Aside:**
- Card `Estoque resumo`: total grande + "em N filiais · X críticas" + botão `Ver na aba Estoque →`.
- Card `KPIs (30d)`: Pedidos atendidos · Última saída · Última entrada · Giro médio. Computados de `stock_movement`.
- Card `Metadados`: Categoria · Fornecedor · Visibilidade · Criada em.

### Tab Variantes & preços

Tabela editável inline:

| SKU | Voltagem | Preço | Custo | Padrão | Ações |
|---|---|---|---|---|---|
| BSC-GWS-700-127 | 127V | R$ 350,00 | R$ 220,00 | ● | 🗑 |
| BSC-GWS-700-220 | 220V | R$ 380,00 | R$ 240,00 | ○ | 🗑 |

- Click numa célula → editor inline.
- Save por linha (não global) — feedback otimista.
- Radio `isDefault`: validar exatamente uma marcada.
- SKU único por ferramenta (validation client + server).
- Botão `+ Variante` adiciona linha vazia.
- Delete bloqueado se a variante tem `stock_level.quantity > 0` ou `stock_movement` recente — toast explicando.

### Tab Estoque

Matriz variante × filial:

```
                  São Paulo    Curitiba    BH        Recife    Total
                  SP · matriz  PR          MG        PE
BSC-GWS-700-127   [3]  ⬤crit  [1] ⬤rep    [12]      [—]       16
127V · padrão     mín 5·rep 8 mín 2·rep 3 mín 3·rep 6 sem lim

BSC-GWS-700-220   [18]         [7]         [6]       [0]       31
220V              mín 5·rep 8 mín 2·rep 3 mín 3·rep 6 sem lim

Total             21           8           18        0         47
```

- Cor da célula = status (não badge solto):
  - `bg-destructive/15 border-b-2 border-destructive` quando `quantity <= minQty`
  - `bg-warning/15 border-b-2 border-warning` quando `quantity <= reorderPoint`
  - default sem cor extra (OK)
  - `text-muted-foreground` com placeholder `—` quando não há `stock_level` registrado
- Linha de totais por variante (coluna direita, `bg-muted`).
- Linha de totais por filial (rodapé, `bg-muted`).
- Topbar:
  - Filtro de filial (multi-select)
  - Segmento de status `Tudo / Crítico / Repor / OK`
  - `⇄ Transferir entre filiais` — **disabled, tooltip "em breve"**
  - `↓ Exportar CSV`
- Legenda discreta abaixo da matriz + "Última sync: há Xmin".

**Sheet de ajuste** (click numa célula):

```
Ajustar estoque                              [×]
BSC-GWS-700-127 · São Paulo

┌──────────────────────────────────────┐
│  3                       [● Crítico] │
│  atual · atualizado há 2h por Carolina│
└──────────────────────────────────────┘

NOVA QUANTIDADE
[          ]

MOTIVO
[Entrada compra] [Ajuste inventário]
[Perda]          [Outro]

NOTA (OPCIONAL)
[                                    ]

─────────────────────────────────────
LIMITES DE ALERTA
Mínimo [5]   Ponto de repor [8]

─────────────────────────────────────
ÚLTIMOS MOVIMENTOS
−2 saída venda · #ORD-1842        há 2h
−1 saída venda                    há 5h
+10 entrada compra                ontem

                    [ Salvar ajuste ]
```

- Quantidade absoluta (não delta) — alinhado com `adjustStockAction` atual.
- Motivo como toggle de 4 botões (mais rápido que select).
- Limites editáveis aqui — fim da inconsistência atual (hoje só via `/branches/[id]/stock`).
- `actorType: "user"` + `actorId: session.user.id` na escrita do movimento.
- `revalidatePath` em `/dashboard/tools/[id]`, `/dashboard/tools`, `/dashboard/branches/[id]/stock`.

### Tab Atividade

```
[🏢 Todas filiais] [📦 Todas variantes] [🗓 Últimos 30 dias] [📋 Todos motivos]                    [↓ Exportar]

ENTRADAS (30d)     SAÍDAS (30d)     PEDIDOS ATENDIDOS     PERDAS/AJUSTES
+42               −28              14                    3

HOJE
[+] −2 · saída venda · São Paulo · BSC-GWS-700-127        14:23
    Pedido #ORD-1842 · Cliente João Almeida · Carolina (manager SP)
[±] −1 · ajuste inventário · Curitiba · BSC-GWS-700-127 · 4 → 3                              09:15
    "Conferência semanal — 1 unidade não localizada" · Pedro (admin)

ONTEM
[+] +10 · entrada compra · São Paulo · BSC-GWS-700-127    16:40
    "NF-e #9012 · Bosch BR" · Pedro (admin)
[⨉] −1 · perda · Curitiba · BSC-GWS-700-220              11:02
    "Equipamento danificado — retornado pela locação #ORD-1801" · Sistema

                                                          [ Carregar mais ]
```

- Cor do ícone por motivo: entrada (success), saída/perda (destructive), ajuste (warning).
- Saídas com `orderId` linkam pra `/dashboard/orders/[id]`.
- KPIs no topo recalculam com o filtro de período.
- Paginação real (resolve o limite hard de 50 do `/tools/[id]/stock` atual).

### Tab Avaliações

Mantém comportamento atual (`ToolReviewsSection`). Sem mudança nesse spec.

## `/dashboard/branches/[id]/stock` — atualizações

Mantém a página (perspectiva inversa: uma filial, muitas ferramentas). Ganha:

- KPIs no topo (mesmas 4 métricas da tab Atividade, escopadas à filial).
- Botão `+ Adicionar ferramenta ao estoque desta filial` — abre dialog com busca e cria `stock_level` zerado.
- Motivos no `BranchStockEditSheet` viram toggle de 4 botões (alinha com tab Estoque).
- Cada card linka pra `/dashboard/tools/[id]?tab=estoque` (não só edit inline).

## Sidebar

```
Dashboard

Vendas
  Pedidos
  Clientes
  Avaliações

Site
  Promoções
  Banners (em breve)
  Configurações (em breve)

Catálogo
  Ferramentas    [47 a repor]    ← badge bg-primary/10 text-primary
  Categorias
  Fornecedores
  Filiais

Internos
  Usuários       [3]
```

- Grupo "Estoque" removido.
- Badge "N a repor" no link de Ferramentas: count de itens em modo Repor; click direciona pra `/tools?mode=repor`.
- Count vem de `cacheTag('inventory')` revalidado em `adjustStockAction`.

## Permissões

Correções aplicadas neste spec:

| Local | Hoje | Depois |
|---|---|---|
| Ajustar estoque (ex-`/tools/[id]/stock`) | `role === "admin"` | `requireCapability("stock.adjust")` — `admin` e `manager` |
| Editar limites de alerta | Só em `/branches/[id]/stock` | Tab Estoque sheet — mesma cap `stock.adjust` |
| `user_branch` scoping em filtros | Não aplicado | Default filtro de filial = filiais do usuário; `stock.read` continua escopado por `requireCapabilityWithContext({ targetBranchIds })` em mutations |

**Não corrigido nesse spec:** quirk `audit.read` (manager+super_admin têm, admin não). Flagged no `apps/web/CLAUDE.md`; decisão de produto.

**Deletar ferramenta:** mantém `tools.delete` cap (admin). Bloqueio se há `stock_movement` recente ou `order_item` vinculado — toast explicativo.

## Paleta — tokens

Todos vindos de `packages/ui/src/styles/globals.css`:

| Token | Valor | Uso |
|---|---|---|
| `--primary` | `oklch(0.65 0.13 38)` | tab ativa, CTA `Ajustar estoque`, badge "a repor" |
| `--primary/10` | `bg-primary/10` | bg do badge dentro de tab, bg do badge sidebar |
| `--destructive` | `oklch(0.55 0.2 15)` | borda card Repor, célula crítica, deletar, alerta strip |
| `--warning` | `oklch(0.78 0.15 85)` | célula repor, ícone de ajuste |
| `--success` | `oklch(0.62 0.13 155)` | badge "Ativa", ícone de entrada |
| `--muted-foreground` | — | tabs inativas, labels |
| `--border` | — | separadores |

Snippet de referência:

```tsx
<TabsTrigger
  className="data-[state=active]:text-primary
             data-[state=active]:border-b-2
             data-[state=active]:border-primary
             text-muted-foreground gap-2"
>
  Estoque
  {criticalCount > 0 && (
    <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
      {criticalCount}
    </Badge>
  )}
</TabsTrigger>
```

## Decisões travadas (pós-alinhamento)

| # | Tópico | Decisão |
|---|---|---|
| 1 | Edição de metadados | **Sheet lateral** (~480-560px), `?edit=1`. Form atual reaproveitado. Galeria + Markdown precisam caber; se na implementação ficar visivelmente apertado, escalonar pra decisão de UI (não decidir sozinho). |
| 2 | Default filtro de filial (non-`super_admin`) | **"Minhas filiais" agregadas** — backend soma `stock_level` das filiais em `user_branch`. Dropdown permite trocar pra filial específica. `super_admin` default = "Todas". |
| 3 | Escopo do spec | Mantido como está. Transferência entre filiais, condição (novo/usado), bulk actions, importação CSV e quirk `audit.read` ficam como ADRs/tickets separados. |
| 4 | Ponto de partida da implementação | **Slice 1** (Sidebar + redirects + remoção de `/stock`). Vertical slice fina, valor imediato, prepara terreno pros próximos. |

## Riscos & questões em aberto

1. **Persistência do filtro de filial entre listagem e tab Estoque.** Se usuário filtra Curitiba em `/tools`, abre uma ferramenta, e vai pra tab Estoque, esperado é a matriz já vir com filtro de filial = Curitiba. Implementação: query param compartilhado (`?branch=<slug>`).
2. **Performance da matriz.** Ferramenta com 5 variantes × 8 filiais = 40 células interativas. Provavelmente OK; vale benchmark em devtools no fim do slice 4.
3. **Card de Repor com muitas filiais em alerta.** Se uma ferramenta tem 8 filiais críticas, listar todas explode altura. Mitigação: mostrar 3 + "e mais N…" linkando pra tab Estoque.
4. **Sheet de Editar com form completo.** Form atual tem Markdown, galeria, specs dinâmicas. 560px pode ficar apertado — durante slice 2/3, comparar com mockup e decidir se vale escalar pra drawer bottom. Não decidir sozinho na implementação.

## Próximo passo

`writing-plans` para gerar o plano de implementação. Sugestão de fatiamento:

1. Sidebar + redirects + remoção de `/stock` (vertical slice fina, alto valor, baixo risco).
2. Detalhe `/tools/[id]` — shell com tabs + Visão geral (sem mexer em estoque).
3. Tab Variantes & preços editável inline.
4. Tab Estoque (matriz + sheet) + correção de permissão.
5. Tab Atividade (timeline + KPIs + paginação + export).
6. Listagem unificada `/tools` (toggle + filtro de filial + scoping `user_branch`).
7. `/branches/[id]/stock` modernizada (alinhar linguagem).
