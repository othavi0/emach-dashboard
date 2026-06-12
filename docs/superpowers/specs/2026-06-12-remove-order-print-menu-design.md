# Remover impressão interna de pedidos

Data: 2026-06-12

## Contexto

No detalhe de pedido (`/dashboard/orders/[id]`), o header mostra um botão `Imprimir` com menu. Hoje ele oferece:

- `DANFE (NF-e)`, quando `order.nfeUrl` existe.
- `Etiqueta de envio`, abrindo `/dashboard/orders/[id]/print?type=shipping`.
- `Lista de separação`, abrindo `/dashboard/orders/[id]/print?type=picking`.

As telas internas de impressão não estão em uso. O objetivo é remover esse fluxo para reduzir ruído na operação.

## Escopo

Remover o menu inteiro do header do detalhe de pedido, incluindo o atalho `DANFE (NF-e)` que existe dentro dele.

Remover também a rota interna de impressão e os componentes usados só por ela:

- `apps/web/src/app/dashboard/orders/[id]/_components/print-menu.tsx`
- `apps/web/src/app/dashboard/orders/[id]/print/page.tsx`
- `apps/web/src/app/dashboard/orders/_components/print-button.tsx`
- `apps/web/src/app/dashboard/orders/_components/print-picking-slip.tsx`
- `apps/web/src/app/dashboard/orders/_components/print-shipping-label.tsx`

Atualizar `order-identity.tsx` para deixar o header sem `actions`.

## Fora do escopo

Não remover campos de dados como `nfeUrl`, `nfeNumber` ou `paymentReceiptUrl`.

Não remover links ou blocos de DANFE/PDF que aparecem fora do menu `Imprimir`, como o bloco financeiro/NF-e do detalhe do pedido.

Não alterar schema, permissões, status de pedido, anexos ou fluxo de expedição.

## Comportamento esperado

Ao abrir `/dashboard/orders/[id]`, o header não deve exibir o botão `Imprimir` nem qualquer dropdown relacionado.

A rota `/dashboard/orders/[id]/print` deixa de existir. Se alguém acessar a URL manualmente, o Next deve cair no comportamento padrão de rota inexistente.

O detalhe do pedido continua carregando os mesmos dados e mantendo os blocos atuais não relacionados à impressão interna.

## Verificação

- Rodar busca por referências a `PrintMenu`, `PrintButton`, `PrintPickingSlip`, `PrintShippingLabel` e `/print?type=`.
- Rodar `bun check-types`.
- Rodar `bun check` se o tempo permitir, porque regras de lint não aparecem no TypeScript.
- Como é mudança visual no detalhe de pedido, validar a rota no browser/dev server antes de afirmar que a UI está pronta.
