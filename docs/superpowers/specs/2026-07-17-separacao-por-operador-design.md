# Separação por operador: fila agrupada + posse de exceção

Data: 2026-07-17 · Status: aprovado em brainstorming (mockup A validado no visual companion)

## Contexto

O redesign do fluxo Pedidos → Separação (#348) já implementou o modelo de concorrência:
1 sessão `in_progress` por pedido (unique parcial `order_picking_one_active`),
não-dono cai em `PickingReadonly` sem ações, e `takeoverPicking`/`cancelPicking`
gated por `canManageOthersSession` (admin/super_admin), com testes em
`picking-guards.test.ts`. **Nada disso muda.**

Este design cobre os dois gaps restantes:

1. **Exibição**: a aba "Separando" mistura todo mundo numa grid única, diferenciando
   só por badge; o CTA "Retomar separação" aparece idêntico em card alheio e engana
   (leva pra tela somente-leitura).
2. **Posse de exceção**: hoje qualquer operador com `orders.pick` reabre pedido cuja
   última sessão terminou em `exception`, mesmo de outra pessoa. Decisão: `user` só
   resolve exceção que ele mesmo gerou; alheia é admin/super_admin.

## 1. Aba "Separando" — agrupamento por operador (layout A)

Em `separacao/page.tsx` + `picking-queue.tsx` (agrupamento no render; a query já
traz `pickerUserId`):

- Seção **"Minhas separações"** no topo: cards do ator, opacidade cheia, CTA âmbar
  "Retomar separação" (inalterado).
- Seção **"Outros operadores"** abaixo: cards com opacidade ~60%, badge âmbar
  "Separando · {Nome}" (inalterado).
- Header de seção: label caixa-alta 11px `muted-foreground` + count em chip
  `secondary` + régua (`border`) até a borda — padrão do mockup aprovado.
- CTA do card alheio por role:
  - `user` → **"Ver andamento"** (outline neutro, `border-input text-muted-foreground`).
  - admin/super_admin → **"Assumir separação"** (mesmo outline; a ação real continua
    sendo o botão dentro de `PickingReadonly` — o CTA do card só navega, como hoje).
- Seção vazia não renderiza (sem estado vazio dedicado — se não separo nada, a
  página abre direto em "Outros operadores").
- Ordenação dentro de cada seção: a atual (`startedAt` desc). Infinite scroll
  mantido; o agrupamento fatia cada página carregada (aceitável: a fila ativa é
  pequena, dezenas no pior caso).

## 2. Posse de exceção (novo guard de autorização)

Regra: a última sessão do pedido com `status = 'exception'` pertence ao
`pickerUserId` dela.

- `user` pode iniciar nova sessão **somente** se `pickerUserId === session.user.id`.
- admin/super_admin: sem restrição (`canManageOthersSession`).
- Sessão **`canceled`** volta ao pool geral — qualquer operador pode claimar.
  Cancelar/assumir é liberação deliberada; a posse vale só para exceção.
- `pickerUserId` null (operador deletado): trata como sem dono → pool geral.

Enforcement em profundidade (backend é a fonte da verdade):

- `startPicking` (`separacao/actions.ts`): após resolver a última sessão do pedido,
  se `exception` + não-dono + `!canManageOthersSession` → erro
  "Apenas {pickerName} ou um admin pode retomar esta exceção".
- `bulkStartPicking`: mesma checagem por pedido; pedidos bloqueados entram nos
  skipped com reason (padrão existente de "já em separação").
- UI (`start-picking.tsx` via `[orderId]/page.tsx`): quando há `exceptionContext`
  de outro dono e o ator não pode, esconder o botão de iniciar e mostrar o motivo
  da exceção + aviso de quem pode resolver.

## 3. Aba "Exceções" — mesmo padrão visual

- Agrupamento idêntico ao item 1: **"Minhas exceções"** (CTA "Resolver") e
  **"De outros operadores"** (esmaecido).
- No grupo alheio: `user` sem CTA (card ainda navega pro detalhe, que mostra o
  motivo sem botão); admin/super_admin com CTA "Resolver".

## 4. Fora de escopo

- Bloqueio de sessão ativa alheia, takeover, cancel — já implementados (#348).
- Schema/DB — nenhuma mudança; tudo deriva de `pickerUserId` já existente.
- Aba "A separar" e "Produtividade" — inalteradas.
- Capability nova — não há; a regra é ownership por role, no padrão de
  `canManageOthersSession`, não uma capability do catálogo.

## 5. Testes e verificação

- Unit (padrão `picking-guards.test.ts`): user reabre a própria exceção ✓; alheia ✗;
  admin reabre alheia ✓; qualquer um claima pedido de sessão cancelada ✓;
  `bulkStartPicking` pula exceção alheia com reason ✓; exceção com `pickerUserId`
  null → pool ✓.
- Smoke visual multi-role no browser (agent-browser, porta 3009, login fornecido
  pelo user): aba Separando agrupada nas duas visões (user/admin), CTAs corretos,
  fluxo de resolver exceção nas três combinações.
- Gate: `bun verify` + `bun run build` (lição do incidente do merge #348/#349:
  build é o gate autoritativo).
