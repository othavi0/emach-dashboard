# Remover o ator `lead` do consent log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todos os artefatos de schema e código relativos ao ator `lead` no consent log, conforme ADR-0003 — todo consentimento passa a ser de um `Client`.

**Architecture:** O enum `consent_actor` colapsa em valor único (`client`), então — pela orientação do issue #38 e do ADR-0003 — o enum e a coluna `actorType` são removidos por completo, em vez de mantidos como single-value. A coluna `leadId`, o índice `consent_log_lead_idx` e o CHECK `consent_actor_coherence` são dropados. A coluna `clientId` passa a ser `NOT NULL` (a coerência antes garantida pelo CHECK vira invariante de coluna). O helper `consent.ts` perde os campos `actorType`/`leadId` e exige `clientId`. Mudança versionada via migration Drizzle.

**Tech Stack:** Drizzle ORM 0.45 + drizzle-kit, Postgres (Supabase), Bun, Turborepo.

**Contexto do codebase (para quem tem zero contexto):**

- Schema da tabela: `packages/db/src/schema/consent-log.ts`. O barrel `packages/db/src/schema/index.ts` faz `export *` deste arquivo — remover `consentActorEnum`/`ConsentActor` do arquivo já os remove da API pública, sem editar o barrel.
- Helper de runtime: `apps/web/src/lib/consent.ts` (`logConsent` / `revokeConsent` / `getActiveConsent`).
- `logConsent` **não tem nenhum chamador** no codebase hoje (verificado por grep) — então o ajuste de assinatura não quebra nenhum call site. `revokeConsent`/`getActiveConsent` já operam só por `clientId`.
- Único leitor externo da tabela: `apps/web/src/app/dashboard/customers/data.ts:514` — seleciona apenas `id/kind/granted/version/grantedAt/revokedAt`. Não toca `actorType`/`leadId`, então **não precisa de mudança**.
- Migrations versionadas vivem em `packages/db/src/migrations/` (`0000`–`0005` + `_indexes.sql`/`_triggers.sql`). `bun db:generate` cria a próxima (`0006`). Config em `packages/db/drizzle.config.ts` lê `DATABASE_URL` de `apps/web/.env`.
- Migrations hand-written são aceitas no projeto (ex.: `0004_drop_category_image_url.sql`).

---

### Task 1: Simplificar o schema `consent-log.ts`

**Files:**
- Modify: `packages/db/src/schema/consent-log.ts`

- [ ] **Step 1: Reescrever o arquivo de schema**

Substituir todo o conteúdo de `packages/db/src/schema/consent-log.ts` por:

```typescript
import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { client } from "./client";

export const consentKindEnum = pgEnum("consent_kind", [
	"tos",
	"privacy",
	"marketing_email",
	"cookies",
]);
export type ConsentKind = (typeof consentKindEnum.enumValues)[number];

export const consentLog = pgTable(
	"consent_log",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => client.id, { onDelete: "cascade" }),
		kind: consentKindEnum("kind").notNull(),
		granted: boolean("granted").notNull(),
		version: text("version").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		grantedAt: timestamp("granted_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [
		index("consent_log_client_idx").on(
			table.clientId,
			table.kind,
			table.grantedAt.desc()
		),
	]
);

export const consentLogRelations = relations(consentLog, ({ one }) => ({
	client: one(client, {
		fields: [consentLog.clientId],
		references: [client.id],
	}),
}));

export type ConsentLog = typeof consentLog.$inferSelect;
export type NewConsentLog = typeof consentLog.$inferInsert;
```

Mudanças aplicadas: removidos `consentActorEnum`/`ConsentActor`, coluna `actorType`, coluna `leadId`, CHECK `consent_actor_coherence`, índice `consent_log_lead_idx` e os imports `check`/`sql` agora não usados. Coluna `clientId` ganhou `.notNull()`.

- [ ] **Step 2: Verificar tipos no workspace `db`**

Run: `bun --cwd packages/db check-types`
Expected: PASS (sem erros).

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/consent-log.ts
git commit -m "refactor: remover ator lead do schema consent_log"
```

---

### Task 2: Gerar e revisar a migration Drizzle

**Files:**
- Create: `packages/db/src/migrations/0006_*.sql` (nome gerado pelo drizzle-kit)
- Modify: `packages/db/src/migrations/meta/_journal.json` + snapshot (gerados)

- [ ] **Step 1: Gerar a migration**

Run: `bun db:generate`
Expected: cria `packages/db/src/migrations/0006_<slug>.sql` e atualiza `meta/`.

- [ ] **Step 2: Inspecionar o SQL gerado**

Run: `cat packages/db/src/migrations/0006_*.sql`

Expected: o SQL deve conter, em alguma ordem, equivalentes a:

```sql
ALTER TABLE "consent_log" DROP CONSTRAINT "consent_actor_coherence";--> statement-breakpoint
DROP INDEX "consent_log_lead_idx";--> statement-breakpoint
ALTER TABLE "consent_log" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_log" DROP COLUMN "actor_type";--> statement-breakpoint
ALTER TABLE "consent_log" DROP COLUMN "lead_id";--> statement-breakpoint
DROP TYPE "public"."consent_actor";
```

Se o drizzle-kit **não** gerar o `DROP TYPE "public"."consent_actor"` (ele às vezes deixa enums órfãos), adicionar a linha manualmente ao final do arquivo `.sql`, precedida de `--> statement-breakpoint` na linha anterior.

Se o drizzle-kit gerar o `DROP COLUMN "client_id"` por engano ou perder o `SET NOT NULL`, corrigir o arquivo à mão para bater com o bloco acima — migrations hand-written são prática aceita no projeto.

- [ ] **Step 3: Aplicar a migration no banco de dev**

Run: `bun db:migrate`
Expected: aplica `0006` sem erro.

Nota: se a tabela `consent_log` tiver linhas com `client_id IS NULL` (linhas de `lead` legadas em dev), o `SET NOT NULL` falha. Nesse caso, em **DB de dev apenas**, limpar essas linhas: `DELETE FROM consent_log WHERE client_id IS NULL;` e re-rodar. Não fazer isso em staging/prod.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/
git commit -m "feat: migration drop ator lead em consent_log"
```

---

### Task 3: Ajustar o helper `consent.ts`

**Files:**
- Modify: `apps/web/src/lib/consent.ts:5-34` (interface `ConsentInput` + `logConsent`)

- [ ] **Step 1: Atualizar a interface e o `logConsent`**

Em `apps/web/src/lib/consent.ts`, substituir o bloco da interface `ConsentInput` e da função `logConsent` por:

```typescript
interface ConsentInput {
	clientId: string;
	granted: boolean;
	kind: ConsentKind;
	request: Request;
	version: string;
}

export async function logConsent(input: ConsentInput): Promise<void> {
	const ipAddress =
		input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
	const userAgent = input.request.headers.get("user-agent") ?? null;

	await db.insert(consentLog).values({
		id: crypto.randomUUID(),
		clientId: input.clientId,
		kind: input.kind,
		granted: input.granted,
		version: input.version,
		ipAddress,
		userAgent,
	});
}
```

Mudanças: `ConsentInput` perde `actorType` e `leadId`, e `clientId` vira obrigatório (`string` em vez de `string?`). O insert de `logConsent` perde `actorType` e `leadId`. `revokeConsent` e `getActiveConsent` ficam inalterados (já operam só por `clientId`).

- [ ] **Step 2: Verificar tipos no workspace `web`**

Run: `bun --cwd apps/web check-types`
Expected: PASS — nenhum call site de `logConsent` quebra (não há chamadores hoje).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/consent.ts
git commit -m "refactor: consent.ts trata consentimento sempre como Client"
```

---

### Task 4: Validação final e atualização de docs

**Files:**
- Modify: `CLAUDE.md` (linha da tabela de schema descrevendo `consent-log.ts`)

- [ ] **Step 1: Rodar verificação de tipos do monorepo inteiro**

Run: `bun check-types`
Expected: PASS em todos os workspaces.

- [ ] **Step 2: Rodar lint/format**

Run: `bun check`
Expected: PASS (sem erros de lint/format).

- [ ] **Step 3: Atualizar a descrição do schema no `CLAUDE.md`**

Na tabela "Schema Drizzle" de `CLAUDE.md`, a linha `consent-log.ts` hoje diz:

> LGPD: `consent_kind` (`tos`/`privacy`/`marketing_email`/`cookies`) por `client`/`lead`. Helper em `apps/web/src/lib/consent.ts`. `leadId` é coluna sem FK até a tabela `lead` existir (Fase C).

Substituir por:

> LGPD: `consent_kind` (`tos`/`privacy`/`marketing_email`/`cookies`) sempre por `client` (ator `lead` removido — ADR-0003). Helper em `apps/web/src/lib/consent.ts`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: atualizar descrição de consent_log no CLAUDE.md"
```

---

## Self-Review

**Spec coverage (acceptance criteria do issue #38):**

- [x] Coluna `consentLog.leadId` removida — Task 1 (schema) + Task 2 (migration).
- [x] `consent_actor` não tem mais `lead` — enum e coluna `actorType` removidos por completo (Task 1 + Task 2), conforme orientação do issue para o caso single-value.
- [x] CHECK `consent_actor_coherence` simplificado ou removido — removido (Task 1 + Task 2); a coerência vira `NOT NULL` em `clientId`.
- [x] `consent.ts` ajustado — Task 3.
- [x] `bun check-types` e `bun check` passam — Task 4.

**Itens fora do escopo do issue mas necessários:** índice `consent_log_lead_idx` (referencia `leadId` removido — precisa cair junto) e `clientId NOT NULL` (substitui a garantia do CHECK). Ambos cobertos.

**Placeholder scan:** nenhum TODO/TBD; todo SQL e código mostrado por inteiro.

**Type consistency:** `ConsentKind` mantido; `ConsentLog`/`NewConsentLog` derivados de `$inferSelect`/`$inferInsert` refletem o schema novo automaticamente; `ConsentInput.clientId` agora `string` (não-opcional) consistente entre interface e uso em `logConsent`.
