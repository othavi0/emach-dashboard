# Plan 020: Corrigir segundo argumento de revalidateTag nos banners

> **Instruções ao executor**: Siga este plano passo a passo. Execute cada
> comando de verificação e confirme o resultado esperado antes de avançar.
> Se qualquer condição de STOP ocorrer, pare e reporte — não improvise.
> Quando concluir, atualize a linha de status deste plano em `plans/README.md`
> — a menos que um revisor tenha te despachado e dito que ele mantém o índice.
>
> **Drift check (execute primeiro)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/site/banners/actions.ts`
> Se o arquivo mudou desde que este plano foi escrito, compare os trechos
> de "Estado atual" contra o código vivo antes de prosseguir; em caso de
> divergência, trate como condição de STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

Em Next.js 16.2.6 a assinatura de `revalidateTag` é
`(tag: string, profile: string | CacheLifeConfig)` — o segundo argumento
é **obrigatório** no nível de tipos e tem semântica de comportamento
em runtime. Todos os 5 sites em `banners/actions.ts` passam `{}` (objeto
vazio) como profile, que é truthy e válido para o compilador, mas produz
um `cacheLife` sem `expire`, fazendo com que a flag
`store.pathWasRevalidated` **não seja setada para
`ActionDidRevalidateStaticAndDynamic`**. Isso significa que, do ponto de
vista do runtime do Next, a invalidação tratada pela action é
stale-while-revalidate com expire indefinido em vez de expirar o cache
imediatamente para o storefront. O efeito prático é que a propagação da
invalidação de banner para o storefront (que consome a tag `site-banners`)
pode não ocorrer como esperado. O fix é trocar `{}` pelo profile `"max"`
(stale-while-revalidate recomendado pelo Next para server actions) em
todos os 5 callsites.

## Estado atual

Arquivo relevante:
- `apps/web/src/app/dashboard/site/banners/actions.ts` — server actions de
  CRUD de banners; contém os 5 callsites com segundo argumento incorreto.

Assinatura real em
`node_modules/.bun/next@16.2.6+b70b6098376f99e4/node_modules/next/dist/server/web/spec-extension/revalidate.d.ts:9`:
```ts
export declare function revalidateTag(tag: string, profile: string | CacheLifeConfig): undefined;
```

Runtime em `revalidate.js:40-47`:
```js
function revalidateTag(tag, profile) {
    if (!profile) {
        console.warn('"revalidateTag" without the second argument is now deprecated, ...');
    }
    return revalidate([tag], `revalidateTag ${tag}`, profile);
}
```

Runtime em `revalidate.js:207-211` — decisão crítica que é afetada:
```js
const cacheLife = profile && typeof profile === 'object' ? profile : ...
if (!profile || (cacheLife?.expire) === 0) {
    store.pathWasRevalidated = ActionDidRevalidateStaticAndDynamic;
}
```
Com `profile = {}`: `cacheLife = {}`, `cacheLife.expire = undefined`,
portanto a condição é falsa e `pathWasRevalidated` **não é setado**.
Com `profile = "max"`: o profile é resolvido via `store.cacheLifeProfiles`,
a tag é marcada como stale e o cache do storefront é invalidado
corretamente.

Trechos do arquivo a modificar com localização exata:

`apps/web/src/app/dashboard/site/banners/actions.ts:106`:
```ts
		revalidateTag("site-banners", {});
```

`apps/web/src/app/dashboard/site/banners/actions.ts:162`:
```ts
		revalidateTag("site-banners", {});
```

`apps/web/src/app/dashboard/site/banners/actions.ts:190`:
```ts
		revalidateTag("site-banners", {});
```

`apps/web/src/app/dashboard/site/banners/actions.ts:212`:
```ts
		revalidateTag("site-banners", {});
```

`apps/web/src/app/dashboard/site/banners/actions.ts:249`:
```ts
		revalidateTag("site-banners", {});
```

Contexto de convencão relevante de `apps/web/CLAUDE.md` (seção Cache):
> `cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...).
> `revalidateTag` em mutations. Ver skill `next-cache-components`.

O profile `"max"` é o recomendado pela documentação oficial do Next 16
para server actions: stale-while-revalidate, a tag marcada como stale é
revalidada na próxima visita à página que usa aquela tag.

## Comandos necessários

| Propósito    | Comando                                                                 | Esperado em sucesso                   |
|--------------|-------------------------------------------------------------------------|---------------------------------------|
| Typecheck    | `bun check-types`                                                       | exit 0, sem erros                     |
| Lint         | `bun check`                                                             | exit 0                                |
| Testes       | `bun --cwd apps/web test`                                               | verde (baseline ≥54 arquivos / ≥359)  |
| Guard forms  | `bun guard:forms`                                                       | exit 0                                |
| Build        | `bun run --cwd apps/web build`                                          | exit 0                                |
| Grep de confim. | `grep -n 'revalidateTag.*{}' apps/web/src/app/dashboard/site/banners/actions.ts` | 0 linhas |

## Escopo

**In scope** (único arquivo a modificar):
- `apps/web/src/app/dashboard/site/banners/actions.ts`

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):
- Qualquer outro arquivo do repo — a mudança é cirúrgica a um único arquivo.
- Outros callsites de `revalidateTag` no codebase (nenhum identificado com
  o padrão `{}`, mas se encontrado, não está no escopo deste plano).
- A configuração de `cacheLife` em `next.config.ts` — o profile `"max"` é
  built-in no Next 16, não precisa de configuração.

## Git workflow

- Branch: `advisor/020-fix-revalidate-tag-banners`
- 1 commit para o único arquivo modificado.
- Mensagem de commit (Conventional Commits em PT, ≤50 chars):
  `fix: corrigir profile de revalidateTag nos banners`
- NÃO fazer push nem abrir PR sem instrução.

## Passos

### Passo 1: Criar branch e verificar drift

```bash
git checkout -b advisor/020-fix-revalidate-tag-banners
git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/site/banners/actions.ts
```

Se o diff mostrar mudanças no arquivo, leia o estado atual e compare com
os trechos em "Estado atual". Se divergir, **STOP**.

**Verify**: `git branch --show-current` → `advisor/020-fix-revalidate-tag-banners`

### Passo 2: Aplicar a substituição nos 5 callsites

Leia o arquivo primeiro (obrigatório para Edit funcionar):

```
Read: apps/web/src/app/dashboard/site/banners/actions.ts
```

Em seguida, use `replace_all` (ou 5 Edits individuais) para substituir
todas as ocorrências de `revalidateTag("site-banners", {})` por
`revalidateTag("site-banners", "max")`.

Padrão exato a substituir (incluindo o tab de indentação):
```
		revalidateTag("site-banners", {});
```
Substituto:
```
		revalidateTag("site-banners", "max");
```

São 5 ocorrências nas linhas 106, 162, 190, 212 e 249.
Use `replace_all: true` para garantir que todas sejam trocadas de uma vez.

**Verify**: `grep -n 'revalidateTag' apps/web/src/app/dashboard/site/banners/actions.ts`
→ deve mostrar 5 linhas com `"site-banners", "max"` e nenhuma com `{}`.

### Passo 3: Typecheck

```bash
bun check-types
```

**Verify**: exit 0, sem erros. Se aparecer erro de tipo relacionado a
`revalidateTag`, verifique se o segundo argumento está como `"max"` (string)
— o tipo aceita `string | CacheLifeConfig`.

### Passo 4: Lint

```bash
bun check
```

**Verify**: exit 0. Nenhum erro novo introduzido.

### Passo 5: Testes

```bash
bun --cwd apps/web test
```

**Verify**: todos os testes passam (baseline ≥359 testes). Nenhum teste
novo é necessário para esta mudança (não há lógica nova; é substituição
de argumento em chamada de framework).

### Passo 6: Guard de forms

```bash
bun guard:forms
```

**Verify**: exit 0.

### Passo 7: Confirmar ausência do padrão antigo

```bash
grep -rn 'revalidateTag.*{}' apps/web/src/app/dashboard/site/banners/actions.ts
```

**Verify**: zero linhas retornadas.

### Passo 8: Commit

```bash
git add apps/web/src/app/dashboard/site/banners/actions.ts
git commit -m "fix: corrigir profile de revalidateTag nos banners"
```

**Verify**: `git log --oneline -1` → mostra o commit acima.

## Plano de testes

Não há testes unitários existentes para `banners/actions.ts` (as server
actions de banner não possuem arquivo `__tests__` identificado). Esta
mudança não altera lógica de negócio, apenas o argumento de uma chamada
de framework.

**Smoke opcional** (recomendado mas não bloqueante para done criteria):
Após o commit, iniciar `bun dev:web` e na rota
`/dashboard/site/banners`, criar ou editar um banner. Verificar nos logs
do servidor que não aparecem warnings sobre `revalidateTag` deprecated.
Se houver acesso ao storefront (app ecommerce em porta separada), confirmar
que após editar um banner ele é refletido na próxima visita à home do site.

## Done criteria

Todos os seguintes devem ser verdadeiros:

- [ ] `bun check-types` exit 0
- [ ] `bun check` exit 0
- [ ] `bun --cwd apps/web test` verde (sem regressões no baseline)
- [ ] `bun guard:forms` exit 0
- [ ] `grep -n 'revalidateTag.*{}' apps/web/src/app/dashboard/site/banners/actions.ts` retorna 0 linhas
- [ ] `grep -c 'revalidateTag("site-banners", "max")' apps/web/src/app/dashboard/site/banners/actions.ts` retorna `5`
- [ ] Nenhum outro arquivo modificado (`git diff --name-only HEAD` lista apenas `apps/web/src/app/dashboard/site/banners/actions.ts`)
- [ ] Linha de status do plano `020` em `plans/README.md` atualizada para `DONE`

## Condições de STOP

Pare e reporte de volta (não improvise) se:

- O drift check (Passo 1) mostrar que `banners/actions.ts` mudou desde
  o commit `79379ef5` de forma que os trechos em "Estado atual" não
  correspondem ao código vivo.
- `bun check-types` falhar com erro relacionado a `revalidateTag` após a
  substituição — isso indicaria que o segundo argumento mudou de assinatura
  novamente (ex: versão do Next atualizada com API incompatível).
- A assinatura de `revalidateTag` em
  `node_modules/.bun/next@*/node_modules/next/dist/server/web/spec-extension/revalidate.d.ts`
  tiver mudado para tornar o segundo argumento opcional — nesse caso o
  fix correto pode ser diferente (remover o arg em vez de trocar por "max").
- Forem encontrados outros callsites de `revalidateTag` **no mesmo arquivo**
  com padrão diferente que indique uma convenção intencional diferente de `{}`.
- O segundo argumento for obrigatório mas o profile `"max"` não existir nas
  `store.cacheLifeProfiles` do projeto — verificar `apps/web/next.config.ts`
  se houver dúvida; `"max"` é built-in no Next 16 e não precisa de
  configuração manual.

## Notas de manutenção

- **Cache Components (use cache)**: Este projeto tem Cache Components
  **desligados** (ADR referenciado em `plans/006-cache-components-spike.md`).
  Se em algum momento Cache Components for habilitado e `cacheTag("site-banners")`
  for adicionado ao storefront, revisar se `revalidateTag("site-banners", "max")`
  continua o perfil adequado ou se convém trocar para `updateTag` (que
  tem semântica de invalidação imediata para server actions).
- **Outros recursos**: A mesma verificação deve ser feita para outros
  `revalidateTag` que possam ter sido adicionados no futuro. O padrão
  correto para server actions nesta versão do Next é `revalidateTag(tag, "max")`.
- **Reviewer**: No PR, validar que as 5 substituições são idênticas e que
  nenhum arquivo fora do escopo foi tocado.
