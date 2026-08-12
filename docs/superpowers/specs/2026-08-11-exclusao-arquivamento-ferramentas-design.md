# Exclusão e arquivamento de ferramentas — design

> Aprovado em 2026-08-11 via brainstorming. Origem: o dono tentou excluir a
> "Ferramenta de teste" (`b9bbf9b0-7771-4e4a-a745-f82de4b94fbc`), encontrou um
> botão morto na aba Variantes e concluiu que a exclusão não existia no sistema.
> Ela existe — o que falta é o sistema dizer por que está bloqueada e oferecer
> uma saída.

## Estado atual (levantado no código e no banco, 2026-08-11)

A exclusão está implementada de ponta a ponta:

| Peça | Onde |
|---|---|
| Server action | `deleteTool` — `apps/web/src/app/dashboard/tools/actions.ts:479` |
| UI (zona de perigo) | `variants-tab.tsx:141-165`, aba "Variantes & preços" |
| Dialog | `_components/delete-tool-dialog.tsx` |
| Capability | `tools.delete`, `defaultRoles: S` (só `super_admin`) |
| Exclusão de variante | `deleteToolVariant` + helper puro `_components/variant-deletion.ts` |

Regra vigente: ferramenta com qualquer linha em `order_item` não pode ser
excluída (`deleteTool:498-509`). Variante não pode ser excluída se tem pedidos,
se tem estoque > 0, ou se é a última da ferramenta (`variant-deletion.ts`).

**O caso concreto:** a "Ferramenta de teste" tem 4 pedidos de seed
(`EM-TEST-9102` a `9105`, todos `preparing`) e 90 un de estoque (45 + 45, filial
Balneário Camboriú), 0 avaliações. O bloqueio está correto; a comunicação dele
não.

## Problemas

1. **O bloqueio é mudo.** O motivo existe como string, mas vive num
   `<TooltipContent>` cujo trigger é `<Button disabled>`
   (`delete-tool-dialog.tsx:73-87`). Elemento desabilitado não emite eventos de
   ponteiro — verificado no browser: o tooltip não abre. Mesmo defeito no
   `DisabledDeleteIcon` das linhas de variante (`variants-tab.tsx:392-405`).
   O usuário vê um botão inerte e nenhuma explicação.

2. **Assimetria de estoque entre variante e ferramenta.** Excluir uma variante
   exige estoque zerado (guard deliberado, issue #335: `stock_level.variant_id`
   é `ON DELETE CASCADE` e a quantidade sumiria sem movimento de ajuste).
   Excluir a ferramenta inteira não checa estoque nenhum — o mesmo risco, um
   nível acima, com o dialog anunciando "e seus estoques por filial também".

3. **Avaliação estoura FK crua.** `review.tool_id` é `ON DELETE RESTRICT`
   (`packages/db/src/schema/reviews.ts:32`) e `deleteTool` não checa avaliações.
   Ferramenta sem pedido mas com review passa pelo guard, estoura no Postgres e
   o `actionErrorMessage` devolve o genérico "Não foi possível concluir a
   operação. Tente novamente." — que não diz o motivo e sugere retry inútil.

4. **Não existe arquivar.** A única saída oferecida é ocultar do site. A
   ferramenta continua ocupando as listas do admin para sempre quando há pedido.

### Referência de FKs (o que acontece hoje ao deletar um tool)

| Tabela | `onDelete` | Efeito |
|---|---|---|
| `order_item` | `restrict` | Bloqueia (a action checa antes, com mensagem boa) |
| `review` | `restrict` | Bloqueia (a action **não** checa → erro genérico) |
| `tool_variant`, `tool_image`, `tool_category`, `tool_attribute_*`, `stock_level`, `stock_alert_sent`, `promotion_tool`, `cart_event` | `cascade` | Apagam junto |
| `stock_movement.variant_id`, `order_picking_item.variant_id`, `order_picking_scan.variant_id` | `set null` | Histórico sobrevive, órfão da variante |

## Decisões

### D1 — Arquivar reusa `status='discontinued'`

Sem estado novo, sem alterar o CHECK `valid_tool_status`
(`packages/db/src/schema/tools.ts:108`), sem coordenação de enum com o app
e-commerce (ADR-0009). O enum já é `draft | active | discontinued` e o form de
publicação já expõe as três opções (`tool-schema.ts:4`).

Custo aceito: "produto que saiu de linha" e "teste que deu errado" compartilham
o mesmo estado; relatórios que segmentam por status não distinguem os dois.

### D2 — Arquivar não altera estoque

O estoque residual é dado físico. Zerar automaticamente seria apagar quantidade
sem movimento no ledger — exatamente o pecado que o #335 barrou na variante.
O dialog informa a quantidade e arquiva mesmo assim. As telas de Estoque
continuam mostrando o item.

Já coberto sem trabalho extra: o cron `stock-alerts` filtra `t.status = 'active'`
(`api/cron/stock-alerts/route.ts:202`), então ferramenta arquivada para de gerar
alerta de reposição; o modo "esgotado" da listagem também é só `active`
(`tools/data.ts:161`).

### D3 — Excluir com estoque > 0 passa a ser bloqueado

Alinha `deleteTool` ao `resolveVariantDeletion`. Mensagem: zere o estoque nas
filiais antes de excluir, com arquivar oferecido ao lado. Consequência: o dialog
de confirmação perde a frase "e seus estoques por filial também", que deixa de
ser verdadeira.

### D4 — Uma única fonte para a decisão de bloqueio

Novo módulo puro `tools/_lib/tool-deletion.ts`:

```ts
resolveToolDeletion({ orderCount, reviewCount, stockQty }): ToolDeletionDecision
// { allowed: true }
// | { allowed: false; reason: string; suggestArchive: boolean }
```

Precedência: **pedidos → avaliações → estoque**, do imutável ao acionável
(mesma ordenação de intenção do helper de variante).

Consumidores:

- `deleteTool` — autoritativo: busca os três fatos e chama o helper antes de
  deletar. Substitui a checagem inline de pedidos e fecha os problemas 2 e 3.
- `getToolDetail` (`[id]/_lib/tool-detail-data.ts`) — devolve `toolDeletion` já
  resolvido. Já computa `orderedVariantIds` e `stockedVariantIds`; ganha a
  contagem de avaliações e a soma de estoque. Ambas **sem branch-scope**, pelo
  mesmo motivo documentado em `tool-detail-data.ts:228-232` (o bloqueio do
  servidor é global; escopar aqui faria a UI mentir).
- `variants-tab.tsx` — só renderiza a decisão; as frases duplicadas das linhas
  287-303 são removidas.

### D5 — `archiveTool` guardada por `tools.update`

Arquivar não destrói: `admin` pode arquivar, não só `super_admin`. A action seta
`status='discontinued'` **e** `visibleOnSite=false`, audita como
`tool.archived` via `logUserActivity`, e revalida `TOOLS_PATH` + o detalhe.

O `visibleOnSite=false` é o que garante saída da vitrine mesmo se o app
e-commerce não filtrar por status — não é possível verificar o código dele deste
repo (ver "Fora de escopo").

### D6 — Listagem esconde arquivadas por padrão

`/dashboard/tools` sem filtro explícito de status deixa de trazer
`discontinued` (`tools/data.ts:122-131`); o Select de status ganha a opção para
trazê-las de volta. Desarquivar é editar o status pelo form existente
(`fields/publish-fields.tsx`) — sem ação nova.

Risco: ferramenta some da vista de quem não esperava. Mitigação é o filtro
visível.

## UX do bloqueio

`DeleteToolDialog` nunca mais renderiza `<Button disabled>`. O botão fica sempre
clicável e o conteúdo do dialog varia:

| Estado | Título | Corpo | Ações |
|---|---|---|---|
| Bloqueado | "Não é possível excluir" | Motivo com números reais ("Esta ferramenta tem 4 pedidos") | `Fechar` · `Arquivar ferramenta` (oculto se já `discontinued`) |
| Livre | "Remover ferramenta?" | Confirmação atual, sem a frase de estoque | `Cancelar` · `Remover` |
| Arquivar com estoque | "Arquivar ferramenta?" | "Ainda há N un em M filiais; o estoque não será alterado" | `Cancelar` · `Arquivar` |

Os cadeados por variante (`DisabledDeleteIcon`) recebem o mesmo princípio: o
motivo precisa ser alcançável por interação, não morrer num trigger
desabilitado. A forma concreta (botão ativo que abre popover, ou wrapper
`<span>` sob o tooltip) fica para a implementação; o requisito é o
comportamento.

## Fora de escopo

- **App e-commerce.** Nada de schema muda, então nada quebra do lado dele. Ele
  lê `tool` para exibir catálogo (`docs/integration/admin-ecommerce.md:25`), mas
  como filtra a vitrine não é verificável deste repo — daí D5 setar
  `visibleOnSite=false` além do status.
- **Soft-delete genérico** para outras entidades.
- **Purga de ferramentas antigas** ou rotina de limpeza de arquivadas.

## Verificação

- `tools/_lib/__tests__/tool-deletion.test.ts` — matriz de precedência (só
  pedido; só review; só estoque; pedido + estoque; tudo zero), espelhando
  `variant-deletion.test.ts`.
- Teste de `archiveTool` com `@emach/db` mockado no padrão do repo
  (`vi.hoisted` + `vi.mock`, ver `__tests__/activity.test.ts`).
- `bun verify` (check-types + check + test).
- Smoke na "Ferramenta de teste": é o caso bloqueado por pedido, então prova o
  caminho inteiro — dialog nomeando os 4 pedidos, arquivamento sumindo da
  listagem, filtro trazendo de volta. Prova perceptual por screenshot antes e
  depois, conforme a régua de "pronto" do CLAUDE.md.
