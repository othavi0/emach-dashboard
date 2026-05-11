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

- **Anthropic / Claude visual signature.** Cormorant serif gigante editorial em chrome, cream parchment canvas, coral terracotta como cor de marca, copy "helpful AI assistant" tom suave. **Sistema atual já saiu disso** — paleta industrial dark + copper própria, sans-only no chrome. Cormorant Garamond permanece carregada apenas para momentos editoriais restritos (login hero, capa de relatório impresso), nunca como assinatura sistêmica.
- **Shopify / Magento admin.** Cards coloridos com ilustrações flat, dashboards com métricas hero gigantes, navegação com ícones genéricos.
- **SaaS clone (Linear / Stripe / Notion stamp).** Cool blue-grays, navy gradients, layouts modernos sem identidade.
- **Tom "AI prestativo".** Copy que pede desculpa, sugere com cautela, suaviza ações. Equipe quer ferramenta, não assistente.
- **Sistema de cores sem graça.** Botões/badges/options atuais leem como neutros fundidos — cada variant precisa identidade clara, não só trocar text color.

## Design Principles

1. **Cor é sistema, não decoração.** Cada role (primary copper, secondary warm graphite, destructive oxide red, warning mustard, info teal, success jade) tem matiz própria separada por ≥20° de hue circle. Usuário identifica estado pelo rabo do olho. Tokens canônicos em `DESIGN.md` seção Paleta.
2. **Densidade > respiro.** Equipe interna preza informação na tela. text-sm baseline, padding compacto, listas densas. Nada de hero areas, nada de espaçamento marketing.
3. **Voz de engenheiro, não de assistente.** Labels e error messages diretos: "SKU duplicado em variante 2" não "Parece que houve um problema com o SKU". Português técnico do domínio.
4. **Editorial sai do chrome, utilitário entra.** Hierarquia tipográfica funcional: Inter sans denso, contraste por peso (`font-medium` 500 baseline) e case (`uppercase tracking-wider` em section markers), não por família serif. Cormorant Garamond fica restrito a login hero + capa de relatório — nunca no chrome do dashboard.
5. **AAA + reduced motion não-negociável.** Contraste 7:1 em body, focus visível com 2px sólido, animações respeitam `prefers-reduced-motion`. Equipe pode incluir gente com fadiga visual em sessão longa.

## Accessibility & Inclusion

- **WCAG AAA** target em texto e UI controls. Contraste 7:1 body / 4.5:1 large text / 3:1 non-text UI.
- **`prefers-reduced-motion: reduce`** desativa transitions e animations em todos componentes. Sem fade-ins decorativos quando respeitado.
- **Focus state** sempre `ring-2` sólido, nunca opacity-multiplied. Keyboard navigation testada em todas server actions críticas (forms de tool / variant / order status).
- **Color blindness:** roles nunca dependem só de matiz. Cada estado carrega ícone + label + cor (ex: badge cancelado tem ícone X + label "Cancelado" + bg destructive — não só cor).
- **Densidade não compromete legibilidade:** text-sm é o piso, nunca text-xs em body principal.
