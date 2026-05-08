# Product

## Register

product

## Users

Equipe interna emach (admin / manager / user). Funcionários cadastrando ferramentas, conferindo estoque por filial, processando pedidos, moderando reviews, gerenciando promoções e clientes BR. Contexto: desktop, horário comercial, usuários recorrentes que conhecem o domínio (catálogo de ferramentas industriais, voltagens BR, regras fiscais, hierarquia de categorias). Não é app público — clientes BR consomem via app ecomerce externo separado, com DB compartilhada.

## Product Purpose

Dashboard interno emach: única fonte de verdade operacional para catálogo (ferramentas + variantes + atributos dinâmicos), inventário multi-filial, pedidos, promoções, fornecedores, clientes BR e moderação. Sucesso = funcionário acha o que precisa em ≤2 cliques, edita sem fricção, confia que o dado refletido é o real. Métricas: tempo médio para concluir tarefa, erros de digitação em forms longos, taxa de retorno para corrigir cadastro.

## Brand Personality

**Confiante, técnico, denso.** UI fala como engenheiro experiente, não como AI assistente prestativo. Densidade informacional alta — equipe lê tudo, não precisa ser embalada. Cor é sistema, não decoração: cada role (primary / secondary / destructive / warning / info / success) tem identidade própria reconhecível à distância. Voz direta em pt-BR, sem hedging, sem soft language. Vocabulário do domínio (variante, voltagem, filial, SKU, atributo) sempre exato.

## Anti-references

- **Anthropic / Claude visual signature.** Cormorant serif gigante editorial, cream parchment canvas, coral terracotta como cor de marca, copy "helpful AI assistant" tom suave. Inspiração tipográfica ok, mimetismo direto não. Trocar coral por sistema cromático próprio.
- **Shopify / Magento admin.** Cards coloridos com ilustrações flat, dashboards com métricas hero gigantes, navegação com ícones genéricos.
- **SaaS clone (Linear / Stripe / Notion stamp).** Cool blue-grays, navy gradients, layouts modernos sem identidade.
- **Tom "AI prestativo".** Copy que pede desculpa, sugere com cautela, suaviza ações. Equipe quer ferramenta, não assistente.
- **Sistema de cores sem graça.** Botões/badges/options atuais leem como neutros fundidos — cada variant precisa identidade clara, não só trocar text color.

## Design Principles

1. **Cor é sistema, não decoração.** Cada role (primary, secondary, destructive, warning, info, success) tem cor distinta com hierarquia reconhecível. Usuário identifica estado pelo rabo do olho. Coral terracotta sai como assinatura — paleta nova, mais ampla e contrastante.
2. **Densidade > respiro.** Equipe interna preza informação na tela. text-sm baseline, padding compacto, listas densas. Nada de hero areas, nada de espaçamento marketing.
3. **Voz de engenheiro, não de assistente.** Labels e error messages diretos: "SKU duplicado em variante 2" não "Parece que houve um problema com o SKU". Português técnico do domínio.
4. **Editorial sai, utilitário entra.** Serif weight 400 tracking-tight em headline 48px é assinatura Anthropic — substituir por hierarquia tipográfica funcional (sans denso, contraste por peso/case, não por família serif).
5. **AAA + reduced motion não-negociável.** Contraste 7:1 em body, focus visível com 2px sólido, animações respeitam `prefers-reduced-motion`. Equipe pode incluir gente com fadiga visual em sessão longa.

## Accessibility & Inclusion

- **WCAG AAA** target em texto e UI controls. Contraste 7:1 body / 4.5:1 large text / 3:1 non-text UI.
- **`prefers-reduced-motion: reduce`** desativa transitions e animations em todos componentes. Sem fade-ins decorativos quando respeitado.
- **Focus state** sempre `ring-2` sólido, nunca opacity-multiplied. Keyboard navigation testada em todas server actions críticas (forms de tool / variant / order status).
- **Color blindness:** roles nunca dependem só de matiz. Cada estado carrega ícone + label + cor (ex: badge cancelado tem ícone X + label "Cancelado" + bg destructive — não só cor).
- **Densidade não compromete legibilidade:** text-sm é o piso, nunca text-xs em body principal.
