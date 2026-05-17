# Orders são criados apenas pelo site e-commerce

O dashboard admin compartilha o banco Postgres com o site e-commerce, mas a criação de **Order** pertence exclusivamente ao site — o admin apenas progride o ciclo de vida do pedido (status, rastreio, notas, filial de fulfillment). Descartamos dar ao admin a criação de pedido (venda B2B ou por telefone, pedido manual): manter um único ponto de origem evita divergência das regras de carrinho, precificação e débito de estoque entre os dois apps. Reabrir essa decisão exige replicar essas regras no admin — não é uma mudança barata.
