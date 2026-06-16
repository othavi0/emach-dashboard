# Dashboard SEO e identidade da aba

## Contexto

O dashboard Next.js em `apps/web` hoje define metadata global mínima em `src/app/layout.tsx`, com título genérico `emach dashboard` e descrição curta. O arquivo visual desejado para a aba do navegador já existe em `apps/web/public/logo.jpg`.

A URL canônica informada para o sistema é `https://dashboard.emachferramentas.com.br/`.

## Objetivos

- Usar `apps/web/public/logo.jpg` como ícone do sistema na aba do navegador.
- Nomear melhor as abas do browser com um template consistente.
- Criar metadata pública completa para páginas compartilháveis.
- Impedir indexação de áreas internas, páginas com tokens e telas técnicas.

## Não objetivos

- Não mudar layout, componentes visuais, fluxo de autenticação ou permissões.
- Não criar sitemap público para a área autenticada.
- Não alterar assets da marca além de referenciar `logo.jpg` na metadata.

## Design aprovado

### Metadata global

Editar `apps/web/src/app/layout.tsx` para definir a base canônica e identidade padrão:

- `metadataBase`: `https://dashboard.emachferramentas.com.br`
- título padrão: `Emach Dashboard`
- template: `%s · Emach Dashboard`
- descrição institucional do dashboard administrativo.
- `applicationName`, `authors`/`creator`/`publisher` quando couber.
- `icons` apontando para `/logo.jpg`.
- Open Graph com `siteName`, `locale: pt_BR`, `type: website`, `url: /` e imagem `/logo.jpg`.
- Twitter card com `summary_large_image` usando a mesma imagem.
- canonical `/` no root.

### Estratégia de indexação

- `/login`: pode ser indexável, com title e descrição próprios.
- `/convite` e `/redefinir-senha`: `noindex, nofollow`, porque dependem de tokens em query string.
- `/esqueci-senha`: `noindex, nofollow`, por ser fluxo operacional de conta.
- `/pending` e `/suspended`: `noindex, nofollow`, porque são estados autenticados.
- `/dashboard` e rotas filhas: `noindex, nofollow`, porque a área é interna e exige sessão. O template de título fica só no root layout para evitar sufixo duplicado em layouts aninhados do Next.js.
- `/design`, `/design/preview` e dev-preview: `noindex, nofollow`, por serem telas técnicas.

### Títulos das abas

Usar titles curtos e consistentes. Exemplos:

- `Entrar · Emach Dashboard`
- `Convite · Emach Dashboard`
- `Redefinir senha · Emach Dashboard`
- `Visão geral · Emach Dashboard`
- `Pedidos · Emach Dashboard`
- `Ferramentas · Emach Dashboard`
- `Clientes · Emach Dashboard`
- `Estoque · Emach Dashboard`
- `Usuários · Emach Dashboard`

Para detalhes dinâmicos, a primeira versão pode usar título genérico por tipo de entidade, como `Detalhe da ferramenta`, sem buscar dados extras só para SEO. Isso evita ampliar queries SSR ou mexer em contratos existentes.

### Implementação enxuta

Preferir `export const metadata` em layouts e páginas existentes. Não criar wrappers novos nem helpers globais, a menos que a repetição fique alta o suficiente para justificar. Como a alteração é majoritariamente declarativa, a verificação principal será typecheck/lint focado no app.

## Validação

- Rodar verificação TypeScript/lint aplicável ao workspace após as alterações.
- Conferir que `logo.jpg` está referenciado como `/logo.jpg` e permanece em `apps/web/public`.
- Conferir por inspeção que páginas com tokens e dashboard usam `noindex`.

## Pontos melhorados após revisão

- Convite e redefinição de senha não serão indexáveis mesmo sendo públicas, pois carregam tokens em URL.
- Detalhes dinâmicos não farão queries extras só para personalizar título; isso mantém a mudança segura e pequena.
- A área administrativa terá SEO suficiente para compartilhamento controlado, mas sem expor rotas internas a buscadores.
- Após consulta à documentação do Next.js, o template `%s · Emach Dashboard` fica apenas em `apps/web/src/app/layout.tsx`; layouts aninhados só definem `robots`/descrição ou títulos próprios para evitar composição indesejada.
