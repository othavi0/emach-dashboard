# ADR 0008 — Documentos do Asaas chegam ao dashboard pelo banco de dados — o dashboard nunca chama a API do Asaas

**Data:** 2026-05-18
**Status:** Aceito
**Relaciona:** ADR-0004 (integração só DB compartilhada).

## Contexto

O site e-commerce integra com o gateway Asaas para processamento de pagamentos e emissão de NF-e. O gateway devolve URLs de comprovante de pagamento (`transactionReceiptUrl`) e de documentos fiscais (NF-e PDF/DANFE, NF-e XML). O dashboard administrativo precisa exibir esses documentos para o staff (rastreio de pagamento, impressão de nota fiscal) e potencialmente para o cliente no acompanhamento do pedido.

A questão é: o dashboard deve consultar a API do Asaas diretamente, ou receber os dados por outro mecanismo?

## Decisão

O dashboard **nunca chama a API do Asaas diretamente**. Os documentos do Asaas chegam ao dashboard pelos campos de `order` preenchidos pelo e-commerce no banco compartilhado:

| Campo em `order`      | Conteúdo                                                |
| --------------------- | ------------------------------------------------------- |
| `payment_receipt_url` | URL do comprovante de pagamento (`transactionReceiptUrl` do Asaas) |
| `nfe_number`          | Número da NF-e emitida                                  |
| `nfe_url`             | URL do PDF / DANFE da NF-e                              |
| `nfe_xml_url`         | URL do XML da NF-e                                      |
| `nfe_status`          | Status da NF-e (ex.: `authorized`, `cancelled`)         |

O e-commerce é o único ponto de contato com a API do Asaas. Ele preenche esses campos conforme o pagamento é confirmado e a nota fiscal é emitida. O dashboard lê os campos diretamente da tabela `order`.

## Opções consideradas

### Dashboard chama a API do Asaas diretamente

Permitiria buscar status em tempo real, sem depender de atualização dos campos na tabela.

Rejeitado porque:
- Viola o princípio estabelecido no ADR-0004: a integração entre os dois apps é exclusivamente pelo schema compartilhado — não há API entre eles, nem chamadas a serviços externos comuns.
- Exigiria que o dashboard mantivesse credenciais da API do Asaas — um novo segredo a gerenciar, rotacionar e proteger.
- O dashboard não tem lógica de negócio de pagamento; manter essa boundary limpa reduz acoplamento e superfície de ataque.
- Para os casos de uso do dashboard (exibir comprovante, imprimir NF-e), dados "quase em tempo real" vindos do banco são suficientes — não há necessidade de consulta live ao gateway.

### Dados via banco compartilhado — **escolha atual**

Mantém o dashboard isolado de qualquer dependência direta do Asaas. O e-commerce — que já tem a integração — preenche os campos e o dashboard apenas lê. Consistente com ADR-0004.

## Consequências

- O dashboard nunca importa um client do Asaas nem armazena API keys do Asaas.
- Se o e-commerce falhar em preencher `payment_receipt_url` ou os campos de NF-e, o dashboard exibirá os campos como nulos — o staff saberá que o documento ainda não está disponível. Não é um erro do dashboard.
- Atualizações de status da NF-e (ex.: NF-e cancelada) dependem de o e-commerce atualizar `nfe_status` no banco. O dashboard não tem mecanismo de polling ou webhook próprio para isso.
- O campo `payment_receipt_url` corresponde ao `transactionReceiptUrl` retornado pela API do Asaas na consulta de cobrança — o e-commerce deve mapear e persistir corretamente.
