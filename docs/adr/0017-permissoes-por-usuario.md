# ADR 0017 — Permissões por usuário (overrides de capability)

**Data:** 2026-06-15
**Status:** Aceito — **estende o ADR-0016**
**Relaciona:** estende a matriz role-based de `apps/web/src/lib/permissions.ts`; depende de ADR-0016 (gates 3 níveis + filial), ADR-0013 (convite-only), ADR-0006 (push-only).

## Contexto

O ADR-0016 ligou um sistema role-based puro: cada role tem um conjunto fixo de capabilities, sem possibilidade de ajuste por usuário. Dois problemas práticos surgiram:

1. **Sem override por usuário** — delegar uma capability avulsa a um `user` (ex: `reports.export`) exige elevar o role inteiro ou criar um role novo. Não há granularidade.
2. **Sem extensibilidade declarativa** — adicionar uma nova capability exigia editar enum, código de verificação e interface ao mesmo tempo, sem ponto único de registro.

Além disso, o sistema não registrava quem concedeu o quê nem quando — sem auditabilidade de concessão.

## Decisão

Estender o modelo role-based com **overrides de capability por usuário**, composto de quatro partes ortogonais:

### 1. Registry declarativo (`src/lib/capabilities.ts`)

Catálogo `CAPABILITIES` com 47 entradas, cada uma com metadata:

```ts
{ group, resource, action, description, defaultRoles: Role[] }
```

- `Capability` type derivado das keys do objeto (sem enum Postgres — ver Alternativas).
- `roleDefaultCapabilities(role)` — devolve o conjunto default do role.
- `isCapability(s)` — type guard para validação em runtime.
- **Regra de extensão:** 1 entrada no catálogo → aparece automaticamente na UI + nasce deny-by-default para roles não listados em `defaultRoles`.

### 2. Tabela `user_capability_override`

Schema em `packages/db/src/schema/user-capability-override.ts`:

| Coluna | Tipo | Detalhe |
|---|---|---|
| `userId` | text FK `user.id` | `onDelete: "cascade"` |
| `capability` | text | valor livre, validado pelo registry em código (não pgEnum) |
| `effect` | pgEnum `grant/revoke` | override positivo ou negativo |
| `grantedBy` | text FK `user.id` | ator que concedeu; `onDelete: "set null"` |
| `grantedAt` | timestamptz | timestamp do evento |

PK composta `(userId, capability)` — um override por capability por usuário.

### 3. Resolução efetiva (`getUserCapabilities` em `permissions.ts`)

```
capabilities_efetivas = role_defaults ± overrides
```

- `getUserCapabilities(session)` usa `cache()` do React por-request (mesmo padrão de `getUserBranchScope`) — uma query por render tree, sem duplo fetch.
- `can(session, cap)` — **async**, verifica o conjunto efetivo (role ± overrides).
- `roleHasCapability(role, cap)` — **sync**, verifica só o default do role (sem overrides); uso interno e em telas que precisam do default puro.
- `requireCapability*` continuam sendo os guards obrigatórios em server actions — internamente chamam `getUserCapabilities`.

### 4. Action `setUserCapability` com teto de segurança

`apps/web/src/app/dashboard/users/[id]/permissions/actions.ts`:

- **Teto**: ator precisa de `permissions.manage`.
- **Hierarquia**: ator não pode tocar usuário de role igual ou superior.
- **Branch-scope do alvo**: admin só gerencia capabilities de users da própria filial.
- **Anti-escalada**: ator só pode grant/revoke de capabilities que ele próprio possui — não pode conceder o que não tem.
- `inherit` remove o override (volta ao default do role).
- Toda operação escreve em `userActivityLog` (campo `metadata` com `{ capability, effect, before }`).

### 5. UI

Aba "Permissões" em `dashboard/users/[id]` — grid tri-state por grupo de capability (Herdar / Conceder / Revogar via `ToggleGroup`). Renderizada e habilitada apenas para atores com `permissions.manage`.

### Invariante de self-management

`permissions.manage` pertence ao conjunto `SELF_RESTRICTED` — nenhum usuário pode alterar a própria capability de gestão de permissões via `setUserCapability`.

## Considered options

- **A (escolhida)** — registry declarativo + tabela de overrides + resolução efetiva cacheada. Extensível por 1 entrada; rollout aditivo (tabela vazia = comportamento idêntico ao role puro); auditado; sem churn no banco para novas capabilities.
- **B — plugin `access-control` do Better Auth** — oferece statements `role/resource/action` com wildcards e um `ac.userHasPermission()`. Rejeitado: o plugin é role-based puro (sem override per-user nativo); a semântica de statement inspirou o formato de metadata do registry, mas o mecanismo de override teria de ser construído em cima de qualquer forma. Adotar o plugin adicionaria uma abstração extra sem eliminar a tabela de overrides.
- **C — `capability` como pgEnum** — tipagem forte no Postgres, validação na constraint. Rejeitado: cada nova capability exigiria `ALTER TYPE … ADD VALUE` + `db:sync` (push-only, ADR-0006) — churn alto para um catálogo que cresce com frequência. Validação em código via `isCapability()` é suficiente e não gera diff no banco.

## Consequences

- **Extensibilidade:** nova capability = 1 entrada no catálogo; UI, validação e resolução acompanham automaticamente.
- **`can` virou async:** todos os callsites que chamavam `can(session, cap)` foram migrados para `await can(session, cap)`. Callsites em Server Components (RSC) e server actions usam `await`; client-only contexts devem usar o subset de helpers sync (`roleHasCapability`) ou receber o resultado pré-computado via prop/context.
- **Branch-scoping intocado:** overrides de capability são ortogonais ao escopo de filial; `getUserBranchScope` não foi alterado. Um override `grant` não amplia o escopo de filial do usuário.
- **Tabela vazia = no-op:** antes de qualquer concessão, comportamento idêntico ao role puro (rollout aditivo sem migração de dados).
- **Self-management bloqueado:** `permissions.manage` em `SELF_RESTRICTED` — impede auto-escalada via UI e action.
- **Auditoria:** toda concessão/revogação rastreada em `userActivityLog` com ator, efeito e valor anterior.
- **Pré-produção:** popular `user_capability_override` é opcional; a tabela vazia não requer migração.
