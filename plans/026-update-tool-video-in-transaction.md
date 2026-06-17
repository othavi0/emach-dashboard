# Plan 026: Ler prevVideo dentro da transação em updateTool

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/tools/actions.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`updateTool` lê `prevVideo` via `db.select()` **antes** da transação. Duas
chamadas concorrentes (ex.: duplo-submit ou race de SSE) lerão o mesmo valor
antigo e ambas tentarão deletar o mesmo objeto de storage após o commit —
double-delete que é idempotente na maioria dos stores, mas que pode também
operar sobre estado pré-update inconsistente se o Postgres ainda não commitou
a escrita da primeira chamada. Mover o select para dentro da transação, usando
`tx.select()`, garante que o valor lido e o valor atualizado pertençam ao
mesmo snapshot, eliminando a janela de race e tornando o código mais legível
(toda a lógica de dados do tool fica contida no bloco transacional).

## Current state

**Arquivo em escopo:**

- `apps/web/src/app/dashboard/tools/actions.ts` — server actions do módulo de
  ferramentas; contém `updateTool` (L332–L551).

**Trecho problemático atual** (`actions.ts:359–365`):

```ts
// L359
let toDelete: { id: string; url: string }[] = [];

// Captura URLs de vídeo/poster antes da transação para limpeza de storage pós-commit
const [prevVideo] = await db
  .select({ url: tool.videoUrl, poster: tool.videoPosterUrl })
  .from(tool)
  .where(eq(tool.id, id));
```

A variável `prevVideo` é declarada no escopo de `updateTool`, fora do bloco
`db.transaction(async (tx) => { ... })` (L369–L524). Ela é consumida **depois**
da transação (L534–L539):

```ts
// L533 (comment) + L534–L539 (if block)
// Limpa objeto de vídeo/poster antigo quando foi removido ou substituído
if (prevVideo?.url && prevVideo.url !== parsed.data.videoUrl) {
  await deleteToolVideoObject(prevVideo.url).catch(() => undefined);
  if (prevVideo.poster) {
    await deleteToolImage(prevVideo.poster).catch(() => undefined);
  }
}
```

**Convenções relevantes:**

- Server actions usam `ActionResult<T>` e `requireCapability` no início —
  padrão já presente em `updateTool` (L336).
- Variáveis auxiliares como `toDelete` (L359) já seguem o padrão de declaração
  antes da transação e atribuição dentro dela (`toDelete = existingImages.filter(...)` em L429).
  Seguiremos o mesmo padrão: declarar `prevVideo` antes, atribuí-la dentro.
- Nenhuma alteração em `deleteToolVideoObject` ou `deleteToolImage` — apenas o
  ponto de leitura muda.
- Anti-pattern banido: `: any` / `as any` — não introduzir.

## Commands you will need

| Purpose    | Command                                      | Expected on success     |
|------------|----------------------------------------------|-------------------------|
| Typecheck  | `bun check-types`                            | exit 0, sem erros       |
| Lint       | `bun check`                                  | exit 0                  |
| Testes     | `bun --cwd apps/web test`                    | verde (≥359 testes)     |
| Guard forms| `bun guard:forms`                            | exit 0                  |
| Build      | `bun run --cwd apps/web build`               | exit 0                  |

## Scope

**In scope** (o único arquivo a modificar):

- `apps/web/src/app/dashboard/tools/actions.ts`

**Out of scope** (NÃO tocar):

- `apps/web/src/app/dashboard/tools/_components/video-actions.ts` — apenas
  executa a deleção de storage; a assinatura e o fluxo não mudam.
- `apps/web/src/app/dashboard/tools/_components/image-actions.ts` — idem.
- Qualquer outro arquivo de actions, schema, componente ou teste existente.
- O fluxo de upload/storage (como o vídeo chega ao bucket não é alterado).

## Git workflow

- Branch: `advisor/026-update-tool-video-in-transaction`
- Commit único após verificação completa.
- Mensagem: `fix(tools): ler prevVideo dentro da transação em updateTool`
- **NÃO** fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Mover `prevVideo` para dentro da transação

Edite `apps/web/src/app/dashboard/tools/actions.ts`. A mudança tem três partes:

**1a. Transformar a declaração em `let` tipado, antes da transação.**

Substitua (L359–L365):

```ts
let toDelete: { id: string; url: string }[] = [];

// Captura URLs de vídeo/poster antes da transação para limpeza de storage pós-commit
const [prevVideo] = await db
  .select({ url: tool.videoUrl, poster: tool.videoPosterUrl })
  .from(tool)
  .where(eq(tool.id, id));
```

Por:

```ts
let toDelete: { id: string; url: string }[] = [];
let prevVideo: { url: string | null; poster: string | null } | undefined;
```

**1b. Adicionar o select de `prevVideo` no início do bloco `db.transaction`, usando `tx`.**

Dentro de `db.transaction(async (tx) => { ... })`, imediatamente **antes** do
`await tx.update(tool).set(payload).where(eq(tool.id, id))` (que está em L370),
adicione:

```ts
// Captura URLs de vídeo/poster dentro da transação — garante snapshot consistente
[prevVideo] = await tx
  .select({ url: tool.videoUrl, poster: tool.videoPosterUrl })
  .from(tool)
  .where(eq(tool.id, id));
```

O restante do bloco transacional (variantes, imagens, categorias, atribuições)
permanece idêntico. A variável `prevVideo` já foi declarada no escopo externo
como `let`, então a atribuição dentro do callback da transação é válida.

**1c. Verificar que o consumo pós-transação não muda.**

As linhas L533–L539 (consumo de `prevVideo`) não precisam de alteração — a
variável agora carrega o valor lido de dentro da transação, mas o uso é igual.

**Verify**: `bun check-types` → exit 0, sem erros de tipo.

### Step 2: Lint e testes

Execute lint e testes completos para confirmar que nada foi quebrado:

```
bun check
bun guard:forms
bun --cwd apps/web test
```

**Verify**: todos os três comandos encerram com exit 0 e a suíte de testes
reporta ≥359 testes passando (baseline da escrita deste plano).

### Step 3: Commit

```bash
git add apps/web/src/app/dashboard/tools/actions.ts
git commit -m "fix(tools): ler prevVideo dentro da transação em updateTool"
```

**Verify**: `git show --stat HEAD` → exibe apenas
`apps/web/src/app/dashboard/tools/actions.ts` como arquivo modificado.

## Test plan

O bug é uma race condition de baixíssima reprodutibilidade (requer dois
requests exatamente simultâneos), portanto um teste unitário isolado tem
utilidade marginal — o double-delete é idempotente no storage e o efeito
observável seria difícil de provocar deterministicamente num ambiente de teste.

**Abordagem adotada: refactor de consistência com smoke manual.**

Após o Step 1, realizar smoke visual:

1. `bun dev:web` (porta padrão).
2. Navegar para uma ferramenta existente com vídeo cadastrado.
3. Editar a ferramenta **trocando** o vídeo por outro (ou removendo-o).
4. Confirmar que a ferramenta salva com sucesso (toast de sucesso) e que o
   vídeo antigo não aparece mais na UI.
5. Editar novamente **sem** trocar o vídeo; confirmar que o vídeo existente
   permanece e nenhum delete de storage é disparado.

Se não houver ferramenta com vídeo disponível no ambiente de desenvolvimento,
confirmar que a edição normal (sem vídeo) continua funcionando — o caminho
`if (prevVideo?.url && prevVideo.url !== parsed.data.videoUrl)` simplesmente
não entra.

**Testes automatizados existentes:** a suíte atual (`bun --cwd apps/web test`)
não inclui testes para `updateTool` — a adição de um teste novo está fora do
escopo deste plano (effort S; o risco é LOW e a mudança é de 4 linhas).

## Done criteria

Machine-checkable. Todos devem ser verdadeiros:

- [ ] `bun check-types` encerra com exit 0
- [ ] `bun check` encerra com exit 0
- [ ] `bun guard:forms` encerra com exit 0
- [ ] `bun --cwd apps/web test` encerra com exit 0, ≥359 testes passando
- [ ] `git diff HEAD~1 -- apps/web/src/app/dashboard/tools/actions.ts` mostra
      apenas: remoção do `await db.select(prevVideo)` pré-transação, adição do
      `let prevVideo` tipado, adição do `[prevVideo] = await tx.select(...)` no
      início da transação
- [ ] Nenhum outro arquivo modificado (`git status` limpo exceto o commit)
- [ ] `grep -n "const \[prevVideo\]" apps/web/src/app/dashboard/tools/actions.ts`
      retorna zero matches (o `const` foi trocado pelo `let` + atribuição via `tx`)

## STOP conditions

Parar e reportar (não improvisar) se:

- O trecho em `actions.ts:359–365` não corresponder ao excerpt em "Current
  state" (o arquivo derivou desde a escrita deste plano).
- `bun check-types` reportar erro de tipo na atribuição `[prevVideo] = await tx.select(...)`.
  Isso pode ocorrer se o Drizzle inferir o tipo retornado de `tx.select` diferente
  do `let prevVideo` declarado — nesse caso, ajustar a tipagem explícita do `let`
  para coincidir com o tipo inferido pelo select, reportando a diferença.
- A variável `prevVideo` for consumida em outro lugar além de L533–L539
  (buscar com `grep -n "prevVideo" apps/web/src/app/dashboard/tools/actions.ts`
  antes de começar).
- Qualquer step de verificação falhar duas vezes após tentativa de correção.

## Maintenance notes

- **Padrão estabelecido:** toda leitura de estado "antes" que fundamenta uma
  ação pós-commit (limpeza de storage, deleção de arquivo) deve ocorrer dentro
  da mesma transação que realiza o update. Ver também o padrão de `toDelete`
  (imagens) já seguido neste mesmo arquivo.
- **Revisão de PR:** confirmar que o `tx.select` está posicionado **antes** do
  `tx.update` dentro da transação (L370), preservando a semântica de "ler o
  valor antigo antes de sobreescrevê-lo".
- **Seguimento explicitamente adiado:** adicionar `FOR UPDATE` na leitura de
  `prevVideo` para serializar escritas concorrentes do mesmo `toolId` foi
  considerado e excluído do escopo — o Drizzle suporta `.for("update")` (ver
  uso em `deleteToolVariant` L1023), mas o risco de deadlock com o update da
  mesma linha logo em seguida precisaria de validação; o double-delete de
  storage já é idempotente (P3/LOW). Reavaliar se o módulo de tools ganhar
  edição colaborativa em tempo real.
