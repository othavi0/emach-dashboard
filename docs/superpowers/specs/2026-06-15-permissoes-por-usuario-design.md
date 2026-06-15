# Design — Permissões por usuário (registry + overrides)

**Data:** 2026-06-15
**Branch:** `permissoes-por-usuario` (criada a partir de `niveis-auth`)
**Status:** Aprovado (brainstorming) — pendente plano de implementação
**Depende de:** PR #175 (`niveis-auth`, religação de gates ADR-0016) **mergeado primeiro** — esta feature estende aquele sistema.

## Problema

Hoje (pós-religação, ADR-0016) a autorização é **role-based pura**: 3 níveis fixos (`super_admin`/`admin`/`user`) com conjuntos de capability hardcoded em `apps/web/src/lib/permissions.ts`. Falta:
1. **Overrides por usuário** — ligar/desligar capabilities individuais por pessoa, sem mudar o role ("é admin, mas tirei o deletar-catálogo dele").
2. **Extensibilidade** — feature/seção nova deve se plugar no controle de permissão **sem reescrever tudo** (requisito explícito do usuário).
3. **Uma UI de gestão** de acessos por usuário.

## Decisões de produto (fechadas no brainstorming)

| Decisão | Resultado |
| --- | --- |
| Modelo | **Roles como template + overrides (grant/revoke) por usuário** |
| Base técnica | **Estender o nosso `permissions.ts`** com o padrão declarativo do Better Auth (NÃO adotar o plugin de access-control) |
| Quem gerencia | `super_admin` (qualquer um) + `admin` (só users `role=user` da própria filial, **teto = só concede capabilities que ele mesmo tem**) |
| Extensibilidade | Capability = entrada num **registry declarativo**; feature nova = 1 entrada → aparece na UI automaticamente |
| Default de capability nova / página não-mapeada | **Deny-by-default** (fail-closed, consistente com a religação) |
| Branch-scoping | **Inalterado e ortogonal** — overrides são só de capability ("o que pode fazer"); filial continua via `user_branch` ("sobre qual filial") |

## Arquitetura (abordagem A híbrida: registry código + overrides DB + resolução cacheada)

Performance: o caro-de-mudar fica **em memória** (registry/código), o que o usuário mexe fica numa **tabela enxuta**. Leitura resolvida **uma vez por request** com `React.cache()` — depois `can()` é in-memory (zero DB). Confirmado pela regra Vercel `server-cache-react` (mesmo padrão do `getUserBranchScope` já existente).

### 1. Capability Registry (código)
Substituir o union flat `Capability` por um catálogo declarativo (inspirado no `statement` do Better Auth: `createAccessControl({ resource: [actions] })`):
```ts
// apps/web/src/lib/capabilities.ts (novo)
export const CAPABILITIES = {
  "tools.delete": {
    group: "Catálogo", resource: "Ferramentas", action: "Deletar",
    description: "Excluir ferramenta", defaultRoles: ["super_admin"],
  },
  // ... uma entrada por capability (≈45), com metadata
} as const;
export type Capability = keyof typeof CAPABILITIES;
```
A UI lê isso pra montar o grid. **Feature nova = 1 entrada aqui.** O tipo `Capability` continua derivado das keys (type-safe; todos os 138 callsites continuam válidos).

### 2. Roles = templates derivados do registry
Os 3 roles continuam, mas o conjunto-base de cada um deriva de `defaultRoles` no registry — sem matriz hardcoded paralela. (`ROLE_CAPS` é reconstruído a partir do registry.)

### 3. Overrides por usuário (DB)
Nova tabela `user_capability_override`:
- `userId text` (FK `user.id`, cascade)
- `capability text` (uma das keys do registry)
- `effect text` enum `grant | revoke`
- `grantedBy text` (FK `user.id`), `grantedAt timestamptz`
- PK composta `(userId, capability)`; índice em `userId`.

Usuário sem nenhuma linha = **comportamento idêntico ao role puro** (rollout aditivo).

### 4. Resolução cacheada
```ts
// resolve UMA vez por request
export const getUserCapabilities = cache(async (session): Promise<Set<Capability>> => {
  const base = roleDefaults(session.user.role);     // do registry, em memória
  const overrides = await db.select()...where(userId);  // 1 query minúscula
  return applyOverrides(base, overrides);            // base + grants − revokes
});
export async function can(session, cap) { return (await getUserCapabilities(session)).has(cap); }
```
`requireCapability`/`requireCapabilityWithContext` passam a resolver via esse set efetivo. **Guards (status, self, last-super-admin, hierarquia, last-branch) e branch-scope continuam idênticos.**

### 5. UI de gestão
Tela em `dashboard/users/[id]` (nova aba "Permissões") ou tela dedicada:
- super_admin: qualquer usuário. admin: só `role=user` da própria filial.
- Grid de capabilities **agrupado por `group`/`resource`**, mostrando estado efetivo (default do role vs override) com toggle.
- Diff visual: o que é herdado do role vs override explícito (+ badge "concedido"/"revogado").
- **Teto (admin):** só renderiza/permite togglar capabilities que o próprio ator tem. Validado **no servidor** (não confiar na UI).

### 6. Quem gerencia + teto
`permissions.manage` é capability nova: super_admin global; admin com teto (só users da filial + só caps que tem). A action de toggle valida: ator tem `permissions.manage`, alvo está no escopo do ator (hierarquia + branch), e a cap sendo concedida ∈ caps do ator (anti-escalada).

### 7. Extensibilidade / features não-mapeadas
Capability nova nasce **deny-by-default** — só quem `defaultRoles` ou override conceder. Página nova sem gate = bloqueada por convenção (fail-closed). Processo de dev: nova feature = registrar capability no registry + gatear o endpoint/UI.

### 8. Auditoria
Todo grant/revoke logado no `userActivityLog` existente (`actorUserId`, action `permission.granted`/`permission.revoked`, targetId = user alvo, metadata = capability).

### 9. Rollout (aditivo, sem big-bang)
1. Refatorar `Capability` → registry (sem mudança de comportamento; `ROLE_CAPS` derivado).
2. Tabela `user_capability_override` + `getUserCapabilities` cacheado + religar `can()` na resolução.
3. UI de gestão (grid + toggle).
4. `permissions.manage` + teto + auditoria.

Cada passo é verificável isolado; a tabela vazia mantém o comportamento atual até a UI começar a gravar overrides.

## Pitfalls (lições da religação `niveis-auth` — NÃO repetir)

> **Estas são as armadilhas que custaram caro no PR #175. O agente que pegar esta task DEVE internalizá-las.**

1. **Reads não-scoped escapam dos testes e do review.** Na religação, escopei as *listagens* mas esqueci detalhe/contadores/KPIs/feed/export de pedidos — vazavam dados cross-filial. **Só o smoke multi-role com dados reais por filial pegou.** Aqui o análogo: ao religar `can()` na resolução cacheada, **todo** callsite muda de fonte; cobrir todos. E **a UI de gestão é o novo ponto de vazamento** — o teto do admin tem que ser validado no servidor, não só escondido na tela.
2. **Caching derrota o scoping silenciosamente.** Dois usuários viam a mesma lista por causa de fetcher cacheado sem a chave certa. Com `React.cache()` por-request a chave é o `userId` (via session) — **NUNCA cachear capabilities cross-request sem o userId na chave** (`cacheTag('user-caps:{id}')` + invalidar no override, se um dia precisar).
3. **Código morto engana o review.** Um subagente escopou uma função que ninguém chamava (`getRecentOrderActivity`), enquanto o feed real (`fetchOrderActivityPage`) vazava. **Rastrear o que a página REALMENTE usa**, não confiar em nome de função.
4. **Lint do CI (`bun check`/ultracite) não é pego pelo `check-types`.** Regras que mordem: `noNestedTernary` (condições SQL inline), `noExcessiveCognitiveComplexity` (funções com muitos guards — extrair helpers), `useTopLevelRegex`. Rodar `bun check` **antes** do PR.
5. **`db.execute` raw não é checado por tipo.** SQL inválido em template passa no `check-types`. Conferir sintaxe à mão; preferir query builder do Drizzle onde der.
6. **Fail-closed exige dado.** A religação cega quem não tem `user_branch`. Aqui: tabela de override vazia = role puro (ok), mas cuidado com a ordem de deploy quando a UI começar a gravar.

## Fontes de pesquisa (já consultadas — referência pro agente)

- **Better Auth access-control** (`better-auth/plugins/access`, v1.6.11): `createAccessControl(statement)` + `ac.newRole()`. Doc via `npx ctx7@latest docs "/better-auth/better-auth/v1.6.11" "access control statements roles"`. **Padrão adotado para o registry; o plugin em si NÃO é usado** (role-based puro, sem override per-user nativo). Better Auth no projeto é 1.6.11, só plugin `nextCookies()` ativo (`packages/auth/src/dashboard.ts`).
- **Vercel `server-cache-react`** (`.claude/skills/vercel-react-best-practices/rules/server-cache-react.md`): `React.cache()` para dedup por-request de auth/DB — base da resolução cacheada. Evitar objetos inline como arg (shallow-eq quebra o cache).
- **Skills úteis para a implementação:** `find-docs`/`ctx7` (Better Auth, Drizzle), `vercel-react-best-practices` (perf), `next-cache-components` (se for pro cross-request cache), `superpowers:writing-plans` → `subagent-driven-development` (execução), `/code-review` (review do diff).

## Arquivos-âncora (do sistema atual a estender)

| Arquivo | Papel |
| --- | --- |
| `apps/web/src/lib/permissions.ts` | `can`/`requireCapability*`/`ROLE_CAPS`/guards — núcleo a refatorar p/ resolução via registry |
| `apps/web/src/lib/branch-scope.ts` | Branch-scoping (ortogonal, NÃO mexer na lógica) |
| `apps/web/src/lib/session.ts` | `UserRole`, `ROLE_WEIGHT` |
| `packages/db/src/schema/*.ts` | Adicionar `user_capability_override` (push-only, ADR-0006: `bun db:sync`) |
| `apps/web/src/app/dashboard/users/**` | UI de gestão (nova aba/tela) |
| `apps/web/__tests__/permissions.test.ts` | Estender testes (matriz + override + teto) |
| ADR | Novo ADR (permissões por usuário) referenciando ADR-0016 |

## Não decidido (levar pro plano)

- Local exato da UI: aba "Permissões" em `users/[id]` vs tela dedicada `/dashboard/users/[id]/permissoes`.
- Se o cross-request cache (`cacheTag` + invalidação) entra já no v1 ou fica como YAGNI (recomendado: request-cache só, medir depois).
- Formato exato do grid (agrupamento, diff visual) — pode pedir `impeccable`/visual companion no design da UI.
