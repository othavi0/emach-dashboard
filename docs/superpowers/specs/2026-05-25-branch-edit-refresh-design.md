# Branch Edit Refresh — Design

**Status:** Aprovado — pronto pra implementação
**Data:** 2026-05-25
**Escopo:** Refresh completo do formulário de editar filial em `/dashboard/branches/[id]?edit=1` + paridade com create form em `/dashboard/branches/new`.

---

## Motivação

O formulário atual de editar filial é fraco em vários pontos:

1. **Responsável** é um campo de texto que pede o UUID do usuário manualmente — UX inaceitável (ninguém decora UUID).
2. **Telefone** tem placeholder com formato `(00) 00000-0000` mas sem máscara real.
3. **Endereço** é single-line input no edit mas Textarea no create (inconsistente) e sem estrutura.
4. **Create form** (`/branches/new`) só tem `name + address` — não tem telefone nem responsável, então criar uma filial obriga a editar logo depois.
5. **Sem flag de status** — filiais "antigas" ou "fechadas" continuam aparecendo em todos os pickers.

## Decisões de design (aprovadas)

| Tópico | Decisão |
|---|---|
| **Escopo** | Refresh completo: select de Responsável + máscara telefone + endereço estruturado + status + paridade create/edit |
| **Responsável — quem aparece** | Apenas usuários vinculados à filial via `user_branch`, com `status='active'` |
| **Semântica de `inactive`** | Soft-flag: oculta de pickers de novos pedidos/ajustes, mas histórico mantido. Sem bloqueio de mutations existentes |
| **Endereço** | Refatorar para campos estruturados (cep, street, streetNumber, complement, neighborhood, city, state) |
| **Migração de `address`** | Dropar `address` (push-only schema, perde dados antigos por opção do usuário) |
| **Local da edição** | Manter Sheet (com seções scrolladas) |
| **ViaCEP** | Lookup client-side direto, fallback silencioso em erro |

## Mudanças de schema

Em `packages/db/src/schema/inventory.ts → branch`:

```diff
-  address: text("address"),
+  cep: text("cep"),                        // só dígitos (8)
+  street: text("street"),
+  streetNumber: text("street_number"),     // string: aceita "100", "S/N", "100A"
+  complement: text("complement"),
+  neighborhood: text("neighborhood"),
+  city: text("city"),
+  state: varchar("state", { length: 2 }),  // UF
+  status: text("status", { enum: ["active", "inactive"] }).default("active").notNull(),
```

**Rationale:**
- `state` como `varchar(2)` deixa porta aberta pra CHECK constraint de UFs válidas futura.
- `cep` armazenado sem hífen (igual padrão CPF/CNPJ do projeto).
- `status` com default `active` — filiais existentes migram sem ação manual.
- Push-only via `bun db:sync` (ADR-0006) dropa `address` — dados perdidos por opção.

## Arquitetura do formulário

### Componentes novos (`apps/web/src/app/dashboard/branches/_components/`)

| Arquivo | Responsabilidade |
|---|---|
| `branch-schema.ts` (rewrite) | Zod com novos campos + validações condicionais (cep → street+number+city+state obrigatórios) |
| `branch-form-fields.tsx` | JSX puro das 4 seções — compartilhado entre create page e edit sheet |
| `responsible-user-select.tsx` | Select avatar + nome + role; busca lazy via `listResponsibleCandidates(branchId)` |
| `cep-input.tsx` | `MaskedInput 00000-000` + ViaCEP lookup ao completar |

### Componente novo (`apps/web/src/lib/format/`)

| Arquivo | Responsabilidade |
|---|---|
| `branch.ts` | Helper `formatBranchAddress(branch)` para display agregado |

### Layout do Sheet

```
┌─ Sheet (scroll interno) ────────────────────┐
│  Header: "Editar — {nome}"                  │
├─────────────────────────────────────────────┤
│  [FormErrorPanel — se houver issues]        │
│                                              │
│  ── Identidade ──                            │
│  Nome *           [_______________]          │
│  Status           ◉ Ativa  ○ Inativa         │
│                   hint: "Inativa esconde     │
│                   de novos pedidos/ajustes"  │
│                                              │
│  ── Contato ──                               │
│  Telefone         [(00) 00000-0000]          │
│                                              │
│  ── Endereço ──                              │
│  CEP              [00000-000] 🔍             │
│  Rua *            [_______________]          │
│  Nº *  [____]  Complemento [_______]         │
│  Bairro *         [_______________]          │
│  Cidade *         [____]  UF * [__]          │
│                                              │
│  ── Equipe ── (oculto no /new)               │
│  Responsável      [👤 Maria Silva ▾]         │
│                   empty: "Vincule alguém     │
│                   na aba Equipe"             │
│                                              │
├─────────────────────────────────────────────┤
│            [Cancelar]  [Salvar alterações]   │
└─────────────────────────────────────────────┘
```

### `ResponsibleUserSelect`

- Props: `branchId`, `value`, `onChange`
- Server action `listResponsibleCandidates(branchId)` retorna `{ id, name, role, image }[]`
- Trigger: avatar + nome + role badge
- Opção "Sem responsável" no topo (limpa valor)
- Empty state inline: link "Adicionar membro na aba Equipe" → `/branches/[id]?tab=team`
- Loading: skeleton no trigger enquanto busca

### `CepInput`

- `MaskedInput` pattern `00000-000`
- 8 dígitos completos → debounce 300ms → `fetch("https://viacep.com.br/ws/{cep}/json/")` com `AbortController` (timeout 5s)
- Sucesso: callback `onResolve({ logradouro, bairro, localidade, uf })` — pai preenche campos vazios (não sobrescreve preenchidos) + toast "Endereço encontrado"
- Erro/404/timeout: `logger.warn` + toast neutro "Não foi possível buscar endereço" (usuário preenche manual)
- Loading: spinner inline ao lado do input

### Validações Zod

```ts
- name: min 2, max 120
- status: enum ["active", "inactive"]
- phone: regex BR opcional (mantém atual)
- cep: regex /^\d{8}$/ opcional (normaliza tirando hífen antes)
- street, neighborhood, city: obrigatórios SE cep preenchido (refine condicional)
- streetNumber: obrigatório SE street preenchido
- state: regex /^[A-Z]{2}$/, obrigatório SE cep preenchido
- complement: opcional, max 100
- responsibleUserId: optional uuid; server action valida que está em user_branch
```

## Server actions

### `listResponsibleCandidates(branchId)` (novo)

Em `apps/web/src/app/dashboard/branches/actions.ts`:

```ts
export async function listResponsibleCandidates(branchId: string): Promise<{
  id: string;
  name: string;
  role: string;
  image: string | null;
}[]> {
  await requireCapability("branches.manage");
  return db
    .select({ id: user.id, name: user.name, role: user.role, image: user.image })
    .from(userBranch)
    .innerJoin(user, eq(userBranch.userId, user.id))
    .where(and(
      eq(userBranch.branchId, branchId),
      eq(user.status, "active"),
    ))
    .orderBy(asc(user.name));
}
```

- Capability `branches.manage` (mesma do form).
- Sem cache server-side — equipe muda; sheet abre on-demand.

### `updateBranch` (refatorar)

Pontos novos:

```ts
const data = branchSchema.parse(input);

// Valida que responsibleUserId está em user_branch
if (data.responsibleUserId) {
  const linked = await db.select()
    .from(userBranch)
    .where(and(
      eq(userBranch.branchId, branchId),
      eq(userBranch.userId, data.responsibleUserId),
    )).limit(1);
  if (linked.length === 0) {
    return { ok: false, error: "Responsável precisa estar vinculado à filial" };
  }
}

// Normaliza CEP — só dígitos
const cepDigits = data.cep?.replace(/\D/g, "") || null;

await db.update(branch).set({ ...data, cep: cepDigits }).where(eq(branch.id, branchId));
await logUserActivity(...);
revalidatePath(`/dashboard/branches/${branchId}`);
revalidatePath(`/dashboard/branches`);
```

### `listBranches({ activeOnly?: boolean })` (extender)

- Default mantém comportamento atual (lista todas).
- Caller decide: pickers de novos pedidos/ajustes passam `activeOnly: true`.

## Enforcement de `status: inactive`

| Ponto | Mudança |
|---|---|
| `listBranches()` | Param `{ activeOnly?: boolean }` |
| Pickers em `apps/web/src/app/dashboard/orders/**` | Chamam `listBranches({ activeOnly: true })` |
| Pickers em `apps/web/src/app/dashboard/stock/**` | Idem |
| `BranchesFilters` | Chip "Mostrar inativas" (default OFF) |
| `BranchCard` | Badge cinza "Inativa" + `opacity-70` se `status === "inactive"` |
| `lockOrderAndAuthorize` | **Não bloqueia** — pedidos em transição continuam |
| `adjustStock` | **Não bloqueia** — backwards compat |

## Paridade create ↔ edit

- `/branches/new` deixa de renderizar `BranchForm` próprio → renderiza `BranchFormFields` compartilhado.
- Seção "Equipe" oculta no create (filial sem ID ainda não tem `user_branch`).
- Server action `createBranch` ignora `responsibleUserId` se vier (defesa).

## Display helper

```ts
// apps/web/src/lib/format/branch.ts
export function formatBranchAddress(b: {
  street?: string | null;
  streetNumber?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null {
  if (!b.street && !b.city) return null;
  const parts = [
    b.street && b.streetNumber ? `${b.street}, ${b.streetNumber}` : b.street,
    b.neighborhood,
    b.city && b.state ? `${b.city}/${b.state}` : (b.city || b.state),
  ].filter(Boolean);
  return parts.join(" — ");
}
```

Consumido por: `branch-card.tsx`, `overview-tab.tsx`, qualquer lugar que hoje usa `branch.address`.

## Consumidores impactados

| Arquivo | Mudança |
|---|---|
| `branch-card.tsx` | `{branch.address}` → `formatBranchAddress(branch)` |
| `overview-tab.tsx` | Bloco "Endereço" estruturado se houver dados, senão "—" |
| `branch-edit-sheet.tsx` | Substituído inteiro (renderiza `BranchFormFields`) |
| `branch-form.tsx` | Renomeia/substitui pelo `BranchFormFields` compartilhado |
| `branches/data.ts` | `BranchDetail` e `BranchTableRow` ganham novos campos no select |
| `branches/actions.ts` | `listResponsibleCandidates` + `updateBranch` refactor + `listBranches({activeOnly})` |

## Testes / verificação manual

Não há test suite automatizada — verificação manual via `bun dev:web`:

1. **Editar filial existente** (`/branches/[id]?edit=1`):
   - Trocar telefone → máscara funciona.
   - Preencher CEP válido → outros campos preenchem.
   - CEP inválido → toast neutro, campos não mudam.
   - Marcar como inativa → badge "Inativa" aparece em `/branches`.
2. **Filtro de inativas em `/branches`** — chip "Mostrar inativas" OFF esconde corretamente.
3. **Picker em novo pedido** — filial inativa não aparece.
4. **Select de responsável** — só lista usuários vinculados em `user_branch`.
5. **Empty state responsável** — filial nova sem equipe mostra CTA correto.
6. **Criar filial** (`/branches/new`) — formulário com novos campos, seção Equipe oculta.
7. **Salvar com responsibleUserId não vinculado** (via DevTools) — server action retorna erro "Responsável precisa estar vinculado à filial".

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| **Drop de `address` é destrutivo** | Documentado — usuário optou. Recomendar `pg_dump branch` antes de rodar `bun db:sync` em prod. |
| **ViaCEP offline** | Fallback silencioso, usuário preenche manual. |
| **Status enforcement parcial** | Aceito: novos pickers escondem; admins podem reativar editando filial direto. |
| **Empty state de responsável confunde** | CTA inline aponta pra aba Equipe — workflow correto. |

## Não-objetivos

- Email da filial (não solicitado).
- Horário de funcionamento (futuro).
- Geolocalização / coordenadas (futuro).
- Múltiplos endereços (filial-mãe + sub-endereços) — fora de escopo.
- Histórico de alterações de responsável (já coberto por `logUserActivity` genérico).
