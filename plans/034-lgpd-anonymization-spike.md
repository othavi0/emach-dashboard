# Plan 034: [SPIKE/DESIGN] Anonimização de cliente (LGPD direito ao esquecimento)

> **Executor instructions**: Este é um plano de **SPIKE/DESIGN** — o objetivo é
> produzir documentação de decisão e (opcionalmente) uma assinatura de protótipo,
> **não** implementar a mutação real. Siga os passos de investigação, preencha o
> documento de design e marque como pronto apenas quando todos os entregáveis de
> design estiverem completos. Nenhuma mutação de banco ocorre neste plano.
> Submeta tudo para revisão humana antes de qualquer implementação.
>
> **Drift check (run first)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/customers/ packages/db/src/schema/client.ts packages/db/src/schema/client-audit.ts apps/web/src/lib/capabilities.ts packages/db/src/schema/orders.ts apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`
> Se qualquer arquivo em escopo mudou desde este plano, compare as excerpts de
> "Current state" contra o código vivo antes de prosseguir; divergência = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `79379ef5`, 2026-06-17

---

## Why this matters

O LGPD Art. 18, VI garante ao cliente o direito à eliminação dos dados pessoais
tratados com base no consentimento. Não existe hoje nenhum script, server action
ou UI de anonimização no dashboard — o gap está registrado explicitamente como
blocker pré-produção em `packages/db/CLAUDE.md:135-137` e `CONTEXT.md:110`.
Sem essa feature, o sistema não pode responder a um pedido formal de
esquecimento, o que configura violação da LGPD após o lançamento em produção.
Este spike entrega o **documento de decisão** (mapa de PII, API proposta, nova
capability, fluxo de UI, impacto cross-repo e open questions) para aprovação
antes de qualquer implementação.

---

## Current state

### Onde a lacuna está documentada

- `packages/db/CLAUDE.md:133-137`:
  ```
  ## ⚠️ Gaps conhecidos
  ### Anonimização LGPD
  Não há script nem server action de anonimização de cliente ("direito ao esquecimento").
  Só export existe (`client_export_log` + `dashboard/customers/export/`).
  **Implementar antes de produção.**
  ```
- `CONTEXT.md:110`:
  ```
  **Right to be forgotten** — direito do Client à anonimização dos seus dados pessoais
  sob a LGPD. Ainda **não implementado** — não há script nem server action
  (gap registrado em `packages/db/CLAUDE.md`).
  ```

### Arquivos relevantes para o design

| Arquivo | Papel |
|---|---|
| `packages/db/src/schema/client.ts` | Tabela `client` e tabelas dependentes (`clientSession`, `clientAccount`, `clientVerification`, `clientAddress`) |
| `packages/db/src/schema/client-audit.ts` | Enum `client_audit_action` e tabela `client_audit_log`; rastreio de mutações de dados de Client |
| `packages/db/src/schema/consent-log.ts` | Tabela `consent_log` — consentimentos LGPD por Client |
| `packages/db/src/schema/orders.ts` | `order.clientId` (FK → `client.id`, `onDelete: "restrict"`) — FK impede delete; snapshots `shippingAddress` (JSONB) e `order_item.name/sku/...` congelados no checkout |
| `apps/web/src/lib/capabilities.ts` | Registry das 47 capabilities; `customers.anonymize` não existe — linha 211-246 mostra o bloco "Clientes" sem ela |
| `apps/web/src/app/dashboard/customers/actions.ts` | Server actions existentes; padrão canônico de `requireCapability` + `db.transaction` + `clientAuditLog` |
| `apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx` | `DestructiveActionDialog` — componente de UI para ações destrutivas com reason obrigatório; padrão a reusar |
| `apps/web/src/app/dashboard/customers/_components/customer-header.tsx` | Header do detalhe de cliente; onde o botão "Anonimizar" deve ser inserido (gated por capability) |
| `docs/integration/admin-ecommerce.md` | Tabela de ownership: `client` é owned pelo e-commerce, lido por ambos; `client_audit_log` e `client_export_log` são owned pelo dashboard |

### Schema de campos PII em `client` (live, `packages/db/src/schema/client.ts:21-49`)

```ts
export const client = pgTable("client", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),               // PII — anonimizar
  email: text("email").notNull().unique(),    // PII — substituir por placeholder único
  emailVerified: boolean("email_verified")...,
  image: text("image"),                       // PII — NULLar
  phone: text("phone"),                       // PII — NULLar
  document: text("document").unique(),        // CPF/CNPJ — PII sensível; NULLar
  status: clientStatusEnum("status")...,      // manter (operacional)
  clientType: clientTypeEnum("client_type"),  // manter (B2C/B2B — sem PII)
  internalNotes: text("internal_notes"),      // PII indireto — NULLar
  lastSeenAt: timestamp("last_seen_at",...),  // manter (operacional)
  createdAt: timestamp("created_at",...),     // manter (trilha de auditoria)
  updatedAt: timestamp("updated_at",...),     // manter (trilha de auditoria)
});
```

### Tabelas relacionadas e impacto

| Tabela | Vínculo | Campos PII | Estratégia proposta |
|---|---|---|---|
| `client_session` | `onDelete: "cascade"` via `clientSession.userId` | `ipAddress`, `userAgent` | Deletar todas as sessões (cascade automático ou delete explícito antes) |
| `client_account` | `onDelete: "cascade"` via `clientAccount.userId` | `accessToken`, `refreshToken`, `idToken`, `password` | Delete automático por cascade |
| `client_verification` | Sem FK explícita em `clientVerification.ts` (verificar no schema do Better Auth) | `identifier`, `value` | Delete pelo `identifier = client.email` pré-anonimização |
| `client_address` | `onDelete: "cascade"` via `clientAddress.clientId` | `recipient`, `zipCode`, `street`, `number`, `complement`, `neighborhood`, `city` | Delete em cascata |
| `consent_log` | `onDelete: "cascade"` via `consentLog.clientId` | Metadados: `ipAddress`, `userAgent` | **Decisão em aberto** — ver Open Questions |
| `client_audit_log` | `onDelete: "cascade"` via `clientAuditLog.clientId` | `beforeJson`, `afterJson` podem conter dados PII | **Decisão em aberto** — trilha de auditoria vs. direito ao esquecimento |
| `order` | `onDelete: "restrict"` via `order.clientId` — **FK não permite delete do client** | `shippingAddress` (JSONB snapshot), `notes` | **Não há delete possível** por restrição fiscal; snapshot de endereço congelado no JSONB — ver Open Questions |
| `refund_request` | `onDelete: "restrict"` via `refundRequest.clientId` (`packages/db/src/schema/orders.ts:321-323`) | `reasonText` pode conter PII; `amount` é dado fiscal | **Não há delete possível** (restrict). `reasonText` e `rejectionReason` podem ser NULLados; `amount` é dado fiscal a preservar — ver Open Questions §3 |
| `review` | `onDelete: "restrict"` via `review.clientId` (`packages/db/src/schema/reviews.ts:33-35`); coluna `NOT NULL` — **não pode ser NULLada sem schema change** | `title`, `body` podem conter texto de opinião pessoal identificável | **Não há delete possível** (restrict); NULLar `clientId` requer `bun db:sync` (tornar nullable) — ver Open Questions §4 |

**Conclusão crítica:** `order.clientId`, `refund_request.clientId` e `review.clientId` são `onDelete: "restrict"`. O `client` **nunca pode ser deletado** enquanto houver pedidos, estornos ou avaliações vinculadas. A anonimização é portanto uma **operação de NULLar/substituir campos PII**, não um DELETE da linha. Adicionalmente, `review.clientId` é `NOT NULL` — desassociar autoria de review requer schema change (`bun db:sync`) para tornar a coluna nullable.

### Enum `client_audit_action` atual (`packages/db/src/schema/client-audit.ts:16-25`)

```ts
export const clientAuditActionEnum = pgEnum("client_audit_action", [
  "profile_updated",
  "status_changed",
  "type_changed",
  "notes_updated",
  "session_revoked",
  "sessions_revoked_all",
  "password_reset_link_generated",
  "exported",
]);
```

O valor `"anonymized"` ainda **não existe** — adicioná-lo é parte da implementação futura.

### Capabilities existentes no bloco "Clientes" (`apps/web/src/lib/capabilities.ts:211-246`)

```ts
"customers.read":             { defaultRoles: SA },
"customers.update_status":    { defaultRoles: SA },
"customers.export":           { defaultRoles: SA },
"customers.manage_sessions":  { defaultRoles: SA },
"customers.reset_password":   { defaultRoles: SA },
```

`customers.anonymize` **não existe** (confirmado por `grep -n "anonymize" src/lib/capabilities.ts` → 0 matches).

### Padrão canônico de server action (exemplar: `actions.ts:171-224`)

```ts
export async function updateCustomerStatus(input: unknown): Promise<ActionResult> {
  const parsed = updateCustomerStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados inválidos" };
  const data = parsed.data;
  const session = await requireCapability("customers.update_status");  // ← gate
  try {
    await db.transaction(async (tx) => {
      // ... mutações ...
      await tx.insert(clientAuditLog).values({ ... action: "status_changed", reason: data.reason });
    });
    revalidateAll(data.clientId);  // helper local — chama revalidatePath para lista + detalhe
    return { ok: true, data: undefined };
  } catch (error) {
    logger.error("updateCustomerStatus", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return { ok: false, error: msg };
  }
}
```

### Padrão de UI destrutiva (exemplar: `destructive-action-dialog.tsx:17-30`)

```ts
interface Props {
  cancelLabel?: string;      // default "Cancelar"
  confirmLabel: string;
  description: string;
  destructive?: boolean;     // default true
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  open: boolean;
  reasonRequired?: boolean;  // default true — MIN_REASON_LENGTH = 10 chars
  submitting?: boolean;
  title: string;
}
```

### Contrato cross-repo (ADR-0004, `docs/integration/admin-ecommerce.md:17`)

> `client` — Dono primário: E-commerce. Dashboard lê para `customers/`, `reviews/`;
> nunca cria sessão de client.

O dashboard **pode escrever** em `client` para anonimização (é uma operação
administrativa legítima), mas a operação muda dados que o e-commerce lê ao
exibir o perfil e histórico do cliente. A coordenação é via banco — sem chamada
HTTP entre os dois.

---

## Entregáveis deste spike

O executor deve produzir **os cinco itens abaixo** em forma de documento (pode ser
um arquivo Markdown em `docs/design/` ou seções deste plano completadas). Nenhuma
implementação deve ocorrer sem aprovação do dono do produto sobre as Open Questions.

---

## Commands you will need

| Propósito | Comando | Esperado em sucesso |
|---|---|---|
| Typecheck | `bun check-types` | exit 0, sem erros |
| Lint + regras biome | `bun check` | exit 0 |
| Testes | `bun --cwd apps/web test` | verde (baseline ≥54 arquivos / 359 testes) |
| Guard de forms | `bun guard:forms` | exit 0 |
| Confirmar ausência de `anonymize` | `grep -rn "anonymize" apps/web/src/ packages/db/src/` | 0 matches (confirmando estado inicial) |
| Contar capabilities | `grep -c '"customers\.' apps/web/src/lib/capabilities.ts` | 5 (confirmando que `customers.anonymize` ainda não existe) |

---

## Scope

**In scope** (arquivos que o spike pode criar):
- `docs/design/034-lgpd-anonymization.md` — documento de design completo (entregável principal)
- `apps/web/src/app/dashboard/customers/schema.ts` — apenas adição de `anonymizeClientSchema` (Zod schema de input, opcional — só se o executor quiser prototiprar a assinatura)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):
- `packages/db/src/schema/client-audit.ts` — `"anonymized"` não deve ser adicionado ao enum sem aprovação; mudar enum em push-only requer `bun db:sync` no banco compartilhado
- `apps/web/src/lib/capabilities.ts` — `customers.anonymize` não deve ser adicionado sem aprovação
- Qualquer mutação real de dados de `client` no banco
- `plans/README.md` — o índice é atualizado por agente dedicado

---

## Git workflow

- Branch: `advisor/034-lgpd-anonymization-spike`
- Commits: Conventional Commits em PT, subject ≤50 chars.
  Exemplo: `docs: adiciona design de anonimização LGPD (spike 034)`
- **NÃO** fazer push nem abrir PR sem instrução explícita.

---

## Steps

### Step 1: Confirmar estado base (drift check)

Rodar o drift check do cabeçalho e verificar que os arquivos em escopo estão no
estado descrito em "Current state". Especificamente:

1. Confirmar que `grep -n "anonymize" apps/web/src/lib/capabilities.ts` retorna 0 matches.
2. Confirmar que a tabela `clientAuditActionEnum` em
   `packages/db/src/schema/client-audit.ts:16-25` tem 8 valores (sem `"anonymized"`).
3. Confirmar que `order` tem `onDelete: "restrict"` em `clientId`
   (`packages/db/src/schema/orders.ts:83-85`).

**Verify**: `bun check-types` → exit 0

---

### Step 2: Mapear todos os campos PII por tabela

Com base nas excerpts em "Current state", produzir o mapa definitivo de campos PII.
Para cada campo, classificar como:

- **NULL**: campo se torna `null` após anonimização (ex.: `phone`, `image`, `document`, `internalNotes`)
- **SUBSTITUIR**: campo recebe valor placeholder único (ex.: `email` → `anon-<id>@deleted.emach.com.br`, `name` → `Cliente Anonimizado`)
- **PRESERVAR**: campo sem PII, necessário para integridade operacional/fiscal (ex.: `id`, `status`, `clientType`, `createdAt`)
- **CASCADE/DELETE**: tabela inteira é deletada (ex.: `clientSession`, `clientAccount`, `clientAddress`)
- **DECISÃO ABERTA**: requer aprovação do dono do produto (ex.: `consentLog`, `clientAuditLog`, pedidos)

A tabela mínima esperada é:

| Campo | Tabela | Classificação | Justificativa |
|---|---|---|---|
| `name` | `client` | SUBSTITUIR | PII primário; substituir por `"Cliente Anonimizado"` |
| `email` | `client` | SUBSTITUIR | PII primário único; substituir por `"anon-<clientId>@deleted.emach.com.br"` (preserva unicidade do índice) |
| `phone` | `client` | NULL | PII secundário; nullable no schema |
| `image` | `client` | NULL | PII (foto de perfil); nullable |
| `document` | `client` | NULL | CPF/CNPJ — PII sensível; nullable (índice único: `null` não viola unique) |
| `internalNotes` | `client` | NULL | Notas do staff podem conter PII indireto |
| `clientSession.*` | `client_session` | CASCADE/DELETE | Sessões não têm valor sem o cliente ativo |
| `clientAccount.*` | `client_account` | CASCADE/DELETE | Credentials e tokens |
| `clientAddress.*` | `client_address` | CASCADE/DELETE | Endereços físicos são PII primário |
| `clientVerification.*` | `client_verification` | DELETE explícito | Verificar FK do Better Auth; delete por `identifier = email` pré-anonimização |
| `consentLog.*` | `consent_log` | DECISÃO ABERTA | Ver Open Questions §1 |
| `clientAuditLog.*` | `client_audit_log` | DECISÃO ABERTA | Ver Open Questions §2 |
| `order.shippingAddress` | `order` | DECISÃO ABERTA | Snapshot JSONB; ver Open Questions §3 |
| `review.clientId` | `review` | DECISÃO ABERTA | Ver Open Questions §4 |

**Verify**: `test -f docs/design/034-lgpd-anonymization.md && grep -q "Mapa de Campos PII" docs/design/034-lgpd-anonymization.md && echo OK` → `OK`

---

### Step 3: Desenhar a server action `anonymizeClient`

Documentar a assinatura, fluxo transacional e guardrails da server action.
O design deve honrar os padrões do codebase (ver exemplar em `actions.ts:170-224`).

**Assinatura proposta** (registrar no documento de design e,
opcionalmente, em `customers/schema.ts`):

```ts
// Schema de input (Zod)
const anonymizeClientSchema = z.object({
  clientId: z.string().min(1),
  reason: z.string().min(10),   // motivo obrigatório, ≥10 chars (padrão DestructiveActionDialog)
});

// Assinatura da action
export async function anonymizeClient(input: unknown): Promise<ActionResult>
```

**Fluxo transacional proposto** (dentro de `db.transaction`):

1. `SELECT ... FOR UPDATE` no `client` — evitar condição de corrida com escritas do e-commerce.
2. Verificar que o cliente **não** está em estado que bloqueie a operação (ex.: se houver open questions sobre pedidos ativos, definir o guard aqui).
3. NULLar/substituir campos PII em `client` conforme mapa do Step 2.
4. DELETE explícito em `clientVerification` pelo `identifier = email` (antes de mudar o email).
5. DELETE em `clientSession` (cascade garante, mas DELETE explícito é mais legível).
6. Soft-block de export futuro: proposta — adicionar flag `anonymizedAt: timestamp` em `client`
   ou gravar flag no `clientAuditLog` e checar antes de permitir export. **DECISÃO ABERTA** — ver §5.
7. `INSERT` em `clientAuditLog` com:
   - `action: "anonymized"` (requer adição ao enum)
   - `actorType: "user"`, `actorUserId: session.user.id`
   - `beforeJson: { name, email, phone, document }` (snapshot dos campos PII removidos)
   - `afterJson: null` (dados apagados)
   - `reason: data.reason`

**Nota sobre o enum**: adicionar `"anonymized"` ao `clientAuditActionEnum` requer:
- Edição de `packages/db/src/schema/client-audit.ts`
- `bun db:sync` (push-only, ADR-0006)
- CI PR automático para o e-commerce (ADR-0009) — o enum é sincronizado; o e-commerce precisa mergear antes do deploy

**Verify**: `grep -q "anonymizeClient" docs/design/034-lgpd-anonymization.md && echo OK` → `OK`

---

### Step 4: Definir a nova capability `customers.anonymize`

Documentar a entrada a ser adicionada em `apps/web/src/lib/capabilities.ts`
(sem adicionar ainda — apenas o design):

```ts
"customers.anonymize": {
  group: "Clientes",
  resource: "Clientes",
  action: "Anonimizar",
  description: "Anonimizar dados pessoais de cliente (LGPD Art. 18 VI)",
  defaultRoles: S,  // S = ["super_admin"] apenas
},
```

**Justificativa para `defaultRoles: S`** (apenas `super_admin`):
- Anonimização é irreversível — não há "desfazer".
- Afeta o e-commerce (dados que o site ainda lê de `client.*`).
- É uma ação de compliance regulatório, não operacional do dia a dia.
- Padrão alinhado com outros exclusivos de `super_admin`: `users.delete`, `tools.delete`,
  `branches.manage`, `site.update_*` (todos `defaultRoles: S` em `capabilities.ts`).
- `admin` pode iniciar o processo (ex.: receber o pedido do cliente), mas a execução
  deve ser aprovada por `super_admin`. Fluxo alternativo: `admin` cria issue interno;
  `super_admin` executa — fora do escopo deste plano.

**Verify**: `grep -q "customers.anonymize" docs/design/034-lgpd-anonymization.md && echo OK` → `OK`

---

### Step 5: Documentar o fluxo de UI

Documentar como o botão "Anonimizar" aparece no detalhe do cliente e como o fluxo funciona.

**Localização**: `apps/web/src/app/dashboard/customers/_components/customer-header.tsx`.
Atualmente o header exibe (linhas 95-114): botão "Editar" (gated por `canEdit`) e
`<ResetPasswordDialog>` (gated por `canResetPassword`). O botão "Anonimizar" segue o mesmo
padrão — prop `canAnonymize: boolean` derivada de `can(session, "customers.anonymize")` na
`CustomerDetailPage` (`[id]/page.tsx:86-92`).

**Componente de UI**: reusar `DestructiveActionDialog`
(`apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`)
com `reasonRequired={true}` e `destructive={true}`. Mensagem sugerida:

```
title: "Anonimizar cliente — ação irreversível"
description: "Esta ação remove permanentemente o nome, e-mail, documento e
  endereços deste cliente para atender ao direito ao esquecimento (LGPD Art. 18 VI).
  Os pedidos históricos são preservados sem vínculo identificável.
  Esta ação não pode ser desfeita."
confirmLabel: "Anonimizar permanentemente"
```

**Estado após anonimização**: o `client` continua existindo no banco (FK de
`order.clientId` impede delete). A página de detalhe deve exibir um badge
"Anonimizado" e desabilitar todas as ações de edição. Isso requer o `anonymizedAt`
ou outro marcador (ver Open Questions §5).

**Verify**: `grep -q "customer-header" docs/design/034-lgpd-anonymization.md && echo OK` → `OK`

---

### Step 6: Documentar impacto cross-repo

Com base em `docs/integration/admin-ecommerce.md`, documentar o que o e-commerce
lê de `client.*` e o que muda após a anonimização.

**O que o e-commerce lê de `client`** (fonte: `docs/integration/admin-ecommerce.md:17`):
- `client.name` — exibido no perfil do cliente no site
- `client.email` — login e comunicações transacionais (Asaas, etc.)
- `client.document` — CPF/CNPJ para NF-e e checkout B2B
- `client.phone` — contato
- `client.status` — controla acesso ao site
- `client_address.*` — endereços no checkout

**Impacto pós-anonimização**:
- Nome: cliente vira "Cliente Anonimizado" no site — não há mais exibição de nome real.
- Email: `anon-<id>@deleted.emach.com.br` não recebe emails; Better Auth ecommerce
  deve tratar login com esse email como inativo (garantir que `client.status` seja
  `blocked` ou que a anonimização implique bloqueio).
- Endereços deletados: checkout novo pelo e-commerce falhará se o cliente tentar
  comprar novamente (mas cliente anonimizado não deve ter acesso ao site).
- `client_account` deletado: providers OAuth invalidados.
- `consent_log`: ver Open Questions §1.

**Coordenação necessária**:
- Informar o time do e-commerce antes do deploy (ADR-0004/0009).
- Não há schema change que precise do CI PR (apenas se `anonymizedAt` for adicionado
  — ver Open Questions §5). O e-commerce não lê `client_audit_log` (owned pelo dashboard).
- Se `client.status` for setado para `blocked` na anonimização: o e-commerce já
  verifica `status` em sessões novas (Better Auth middleware) — nenhuma mudança no
  e-commerce necessária para bloquear o acesso.

**Verify**: `grep -q "cross-repo\|Cross-Repo\|ecommerce\|e-commerce" docs/design/034-lgpd-anonymization.md && echo OK` → `OK`

---

### Step 7: Listar open questions explícitas

Documentar as seguintes perguntas abertas no documento de design.
**NÃO tomar decisões sobre elas** — são para o dono do produto resolver.

**OQ-1: Retenção de `consent_log`**
O `consent_log` contém registros de consentimento com `ipAddress` e `userAgent` —
metadados que são PII. Por outro lado, manter o histórico de consentimento pode ser
obrigação legal (LGPD exige que o controlador comprove que o consentimento foi
obtido). Opções:
- (A) Deletar `consent_log` em cascata (já configurado: `onDelete: "cascade"` via `clientId`)
- (B) Preservar `consent_log` mas NULLar `ipAddress` e `userAgent`
- (C) Preservar `consent_log` integralmente (argumento: prova de consentimento previsto na LGPD)
**Pergunta para o dono do produto:** Qual é a obrigação legal de retenção de consent?
Consultar assessoria jurídica antes de decidir.

**OQ-2: Retenção de `client_audit_log`**
O `client_audit_log` é trilha de auditoria de mutações feitas pelo staff, incluindo
campos `beforeJson`/`afterJson` que podem conter PII (ex.: `name`, `email` antes de uma
edição). Opções:
- (A) Deletar `client_audit_log` em cascata
- (B) Preservar `client_audit_log` mas NULLar `beforeJson`/`afterJson` nos registros
- (C) Preservar integralmente (auditoria interna)
**Pergunta:** trilha de auditoria de dados pessoais é obrigação interna ou pode ser
eliminada junto com o sujeito dos dados?

**OQ-3: Retenção de dados fiscais em `order` e `order_item`**
`order.shippingAddress` é JSONB snapshot congelado no checkout — contém nome, CEP,
logradouro, cidade do cliente. `order_item` tem snapshots de produto (sem PII direta,
mas o histórico de compra é dado pessoal). A FK `order.clientId` é `onDelete: "restrict"`,
logo o `client` não pode ser deletado. Opções:
- (A) NULLar `order.shippingAddress` (perde dados de entrega do histórico fiscal)
- (B) Preservar `order.shippingAddress` (pedidos são documentos fiscais com retenção
  legal de 5 anos — Lei 9430/96 e regulamentos de NF-e)
- (C) Substituir `order.shippingAddress` por placeholder (`{"recipient":"Dados removidos",...}`)
**Pergunta:** qual é a política de retenção de dados fiscais de pedido? Dados de NF-e
emitida são obrigação do contador/contabilidade — provavelmente retenção de 5 anos obrigatória.
Esta é uma **decisão legal**, não técnica.

**OQ-4: Retenção de `review`**
`review` contém texto de opinião do cliente sobre um produto. A FK `review.clientId` é
`onDelete: "restrict"` e `NOT NULL` (`packages/db/src/schema/reviews.ts:33-35`), portanto:
- delete do `client` é bloqueado enquanto houver reviews;
- NULLar `clientId` requer schema change (tornar coluna nullable via `bun db:sync`).
O texto da review pode ser dado pessoal se identificar o autor. Opções:
- (A) Deletar todas as reviews do cliente (requer delete explícito antes de anonimizar; nenhum schema change)
- (B) Manter reviews mas NULLar `clientId` para desassociar autoria (requer `bun db:sync` — tornar nullable + CI PR)
- (C) Manter reviews integralmente (dado agregado sem identificação; nenhuma mudança)
**Pergunta:** reviews moderadas e publicadas são dados pessoais identificáveis? Consultar
assessoria jurídica. A escolha de opção (B) implica schema change coordenado com o e-commerce (ADR-0009).

**OQ-5: Marcador de cliente anonimizado**
Após a anonimização, como o sistema sabe que um `client` está anonimizado?
- (A) Adicionar coluna `anonymizedAt: timestamp` em `client` (requer `bun db:sync` + CI PR)
- (B) Usar `client.status = "blocked"` combinado com valor de email sentinel (`anon-<id>@...`)
- (C) Checar `clientAuditLog` pelo action `"anonymized"` (não requer schema change, mas é O(n) se frequente)
A escolha afeta: navegação da lista (filtrar clientes anonimizados?), badge "Anonimizado" na UI,
bloqueio de export futuro, e a necessidade de um CI PR para o e-commerce.

**OQ-6: Gatilho do pedido de esquecimento**
Quem inicia a anonimização?
- (A) O próprio staff ao receber uma solicitação formal do cliente por email/telefone
- (B) O cliente via formulário no site e-commerce (requer feature no e-commerce)
- (C) Ambos
O plano de implementação varia significativamente por opção.

**Verify**: `grep -c "OQ-" docs/design/034-lgpd-anonymization.md | grep -qE "^[6-9]|^[1-9][0-9]" && echo OK` → `OK` (≥6 ocorrências de "OQ-")

---

### Step 8: Verificar integridade do design document

Confirmar que o arquivo `docs/design/034-lgpd-anonymization.md` contém todas as
seções obrigatórias:

- [ ] Mapa de Campos PII (Step 2)
- [ ] Assinatura da Server Action (Step 3)
- [ ] Nova Capability `customers.anonymize` (Step 4)
- [ ] Fluxo de UI (Step 5)
- [ ] Impacto Cross-Repo (Step 6)
- [ ] Open Questions OQ-1 a OQ-6 (Step 7)
- [ ] Marcação clara: "DESIGN/SPIKE — aguarda aprovação do dono do produto antes de implementar"

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0; `bun --cwd apps/web test` → verde (spike não altera código de produção).

---

## Test plan

Este é um spike de design — **não há testes novos** a escrever neste plano.

Se o executor criar o `anonymizeClientSchema` opcional em `customers/schema.ts`,
deve verificar que `bun guard:forms` → exit 0 (nenhum `<p|span|div>` com erro
cru fora de `<FieldError>`).

A suíte existente deve continuar verde sem modificação:
`bun --cwd apps/web test` → ≥359 testes passando.

---

## Done criteria

Machine-checkable. TODOS devem ser verdade:

- [ ] `bun check-types` exit 0
- [ ] `bun check` exit 0
- [ ] `bun --cwd apps/web test` verde; contagem de testes ≥ baseline
- [ ] `bun guard:forms` exit 0
- [ ] `grep -rn "anonymize" apps/web/src/ packages/db/src/` → 0 matches em código de produção (exceto se o executor criou o schema Zod opcional — nesse caso, aceitar exatamente 1 match no schema de input)
- [ ] `docs/design/034-lgpd-anonymization.md` existe e contém as 6 open questions
- [ ] Nenhum arquivo fora do escopo modificado (`git status` mostra apenas `docs/design/034-lgpd-anonymization.md` e opcionalmente `apps/web/src/app/dashboard/customers/schema.ts`)
- [ ] Documento marcado claramente como spike/design aguardando aprovação

---

## STOP conditions

Parar e reportar (não improvisar) se:

- Código nos arquivos de "Current state" não corresponde aos trechos citados
  (indica drift desde a escrita do plano — rodar o drift check e reportar quais arquivos divergem).
- Qualquer step de verify falhar duas vezes com tentativa razoável de correção.
- O executor sentir pressão para adicionar `"anonymized"` ao enum, `customers.anonymize`
  ao registry de capabilities, ou qualquer mutação real de dados — **esses são out-of-scope
  e requerem aprovação explícita das Open Questions**.
- O executor descobrir que `order.clientId` tem `onDelete` diferente de `"restrict"` —
  isso mudaria a estratégia de anonimização fundamentalmente.
- O executor descobrir que `review.clientId` mudou de `onDelete: "restrict"` para `"cascade"` —
  isso resolveria a OQ-4 automaticamente, mas deve ser reportado antes de agir.
  (Nota: no momento da escrita do plano, `review.clientId` é `restrict` e `NOT NULL` —
  `packages/db/src/schema/reviews.ts:33-35`.)
- Qualquer decisão nas Open Questions §1-§6 parecer ter uma resposta óbvia que o executor
  quer implementar: **não implementar** — registrar a observação e parar.

---

## Maintenance notes

**Para o revisor humano:**
- As Open Questions OQ-1, OQ-2 e OQ-3 têm implicações legais (retenção fiscal, LGPD
  e direitos do titular) — **requerem consulta jurídica antes de qualquer implementação**.
  Não aprovar a implementação sem parecer jurídico sobre cada uma.
- OQ-5 ("marcador de cliente anonimizado") tem impacto direto no schema — se a opção (A)
  for escolhida, requer `bun db:sync` e CI PR para o e-commerce (ADR-0009). Coordenar
  o deploy com o time do e-commerce.
- A adição de `"anonymized"` ao `clientAuditActionEnum` (push-only, ADR-0006) dispara o
  CI PR automático para o e-commerce (ADR-0009) — o time do e-commerce precisa estar
  ciente antes do merge na `main`.

**Para o plano de implementação subsequente (não este spike):**
- A implementação deve ser um plano separado (ex.: `035-lgpd-anonymization-impl.md`)
  criado após aprovação das Open Questions.
- A implementação requer smoke visual obrigatório: visitar `/dashboard/customers/<id>`
  de um cliente anonimizado e confirmar que nome, email, documento e endereços
  não aparecem em lugar nenhum (incluindo tabs de Auditoria e Consentimento).
- `check-types` não detecta queries com colunas removidas nem SQL inválido em templates
  — smoke no browser é obrigatório (`apps/web/CLAUDE.md`).
- O e-commerce lê `client.email` para comunicações transacionais — garantir que o
  gateway de email (Asaas ou similar) não tente enviar emails para o placeholder
  `anon-<id>@deleted.emach.com.br`.
