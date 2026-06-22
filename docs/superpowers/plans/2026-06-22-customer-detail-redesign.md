# Redesign do detalhe de cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter `dashboard/customers/[id]` do design antigo para o padrão canônico de entidade (igual `tools/[id]`/`users/[id]`), com header contextual, tabs `EntityTabs`, edição por drawer e polish de dados.

**Architecture:** Reaproveitar 100% da camada de dados (`data.ts`/`actions.ts`/`schema.ts` — queries corretas, dados carregam). Trocar só a casca de UI: componentes próprios (`CustomerHeader`/`CustomerKpisHeader`/`CustomerTabs`/form inline) → canônicos (`EntityIdentityHeader`/`EntityKpisRow`/`EntityTabs`/`EntityEditSheet`). KPIs migram para dentro da tab "Visão geral". Ações do header passam a ser contextuais por `sp.tab`.

**Tech Stack:** Next 16 (App Router, RSC), React 19 (sem `forwardRef`, React Compiler ativo → sem `useMemo`/`useCallback` manual), Drizzle, Tailwind v4, `@emach/ui` (base-ui), zod, vitest (`environment: node`).

**Spec:** `docs/superpowers/specs/2026-06-22-customer-detail-redesign-design.md`

## Global Constraints

Toda task implicitamente herda estas regras (valores verbatim do projeto):

- **Sem `font-serif`** no chrome do dashboard (Cormorant só em login hero / capa de relatório).
- **Sem** `console.*`, `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`, `key={index}`, `<img>` puro, `forwardRef`, `useMemo`/`useCallback` manual.
- **Datas** sempre via `@/lib/format/datetime` (`formatDate`/`formatDateTime` — fuso fixo `America/Sao_Paulo`). Moeda via `Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"})` (exceção permitida). **Documento** via `formatDocument` de `@/lib/cpf-cnpj`.
- **Auth ecommerce isolada:** nunca importar `@emach/auth/ecommerce`. "Resetar senha" continua escrevendo em `clientVerification` + `ECOMMERCE_ORIGIN` (já implementado em `reset-password-dialog.tsx`/`actions.ts`) — não alterar a lógica, só o posicionamento.
- **Capabilities preservadas:** `customers.read` (gate da página), `customers.update_status` (`canEdit`), `customers.reset_password` (`canResetPassword`), `reviews.moderate` (`canModerateReviews`), `customers.manage_sessions` (`canManageSessions`).
- **Tab values em português** (preserva deep links): `perfil` (default, **label "Visão geral"**), `enderecos`, `pedidos`, `avaliacoes`, `consentimento`, `sessoes`, `auditoria`.
- **Verificação por task:** `bun check-types` + `bun check` verdes; **smoke visual** no dev server `localhost:3007` (já no ar) nas duas fixtures: `ATDidrnA0wmipTdoecwZfSpYwz3tqzNu` (Othavio, OAuth, 2 sessions, 0 pedidos) e `51863cb8-954f-4717-9d34-7dce70b63147` (Fernanda, b2c, 2 pedidos, 1 endereço, 2 reviews). `check-types`/lint **não** pegam erro de runtime SSR — o smoke visual é obrigatório.
- **Read antes de Edit** (cat/sed não contam para o harness). Hook PostToolUse roda `bun fix` após Write/Edit — se um `old_string` falhar, re-Read antes de re-tentar.

---

## File Structure

**Criar:**
- `apps/web/src/app/dashboard/customers/_lib/format-session-ip.ts` — normaliza IP de sessão (puro, testado).
- `apps/web/src/app/dashboard/customers/_lib/format-session-ip.test.ts` — teste vitest.
- `apps/web/src/app/dashboard/customers/_lib/customer-display.ts` — helpers de exibição compartilhados (initials, configs de badge, labels de status de pedido, formatadores).
- `apps/web/src/app/dashboard/customers/_components/customer-identity.tsx` — wrapper de `EntityIdentityHeader`.
- `apps/web/src/app/dashboard/customers/_components/edit-customer-button.tsx` — botão Client que seta `?edit=1`.
- `apps/web/src/app/dashboard/customers/_components/customer-edit-sheet.tsx` — drawer de edição (`EntityEditSheet`).
- `apps/web/src/app/dashboard/customers/_components/customer-overview-tab.tsx` — conteúdo da tab "Visão geral".

**Reescrever (recasca, lógica preservada):**
- `apps/web/src/app/dashboard/customers/[id]/page.tsx` — esqueleto canônico + header contextual + `EntityTabs` + lazy.
- `apps/web/src/app/dashboard/customers/_components/customer-sessions-table.tsx` — Card + IP normalizado, sem botão "Revogar todas" no corpo.
- `apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx` — Card + `body`/`moderationNote`.
- `apps/web/src/app/dashboard/customers/_components/customer-addresses-list.tsx`, `customer-orders-table.tsx`, `customer-consent-list.tsx`, `customer-audit-table.tsx` — Card + empty states.

**Remover (órfãos pós-migração):**
- `customer-header.tsx`, `customer-kpis-header.tsx`, `customer-tabs.tsx`, `customer-profile-form.tsx`.

**Intactos:** `data.ts`, `actions.ts`, `schema.ts`, `reset-password-dialog.tsx`, `revoke-session-dialog.tsx`, `revoke-all-sessions-dialog.tsx`.

---

## Task 1: Helper `formatSessionIp` (TDD)

Normaliza o IP cru das sessões (o banco grava IPv6 loopback como `0000:0000:…:0000`, que aparece cru na UI).

**Files:**
- Create: `apps/web/src/app/dashboard/customers/_lib/format-session-ip.ts`
- Test: `apps/web/src/app/dashboard/customers/_lib/format-session-ip.test.ts`

**Interfaces:**
- Produces: `formatSessionIp(ip: string | null): string`

- [ ] **Step 1: Escrever o teste que falha**

`apps/web/src/app/dashboard/customers/_lib/format-session-ip.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatSessionIp } from "./format-session-ip";

describe("formatSessionIp", () => {
  it("retorna travessão para null", () => {
    expect(formatSessionIp(null)).toBe("—");
  });
  it("colapsa IPv6 todo-zero para Local", () => {
    expect(formatSessionIp("0000:0000:0000:0000:0000:0000:0000:0000")).toBe("Local");
    expect(formatSessionIp("0:0:0:0:0:0:0:0")).toBe("Local");
    expect(formatSessionIp("::")).toBe("Local");
  });
  it("trata loopback como Local", () => {
    expect(formatSessionIp("::1")).toBe("Local");
    expect(formatSessionIp("127.0.0.1")).toBe("Local");
  });
  it("preserva IP público", () => {
    expect(formatSessionIp("177.133.209.36")).toBe("177.133.209.36");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun --cwd apps/web test format-session-ip`
Expected: FAIL — `Cannot find module './format-session-ip'`.

- [ ] **Step 3: Implementar o mínimo**

`apps/web/src/app/dashboard/customers/_lib/format-session-ip.ts`:
```ts
const ALL_ZERO_IPV6 = /^(0{1,4}:){7}0{1,4}$/;

/** Normaliza o IP cru de `client_session.ip_address` para exibição. */
export function formatSessionIp(ip: string | null): string {
  if (!ip) {
    return "—";
  }
  const trimmed = ip.trim();
  if (
    trimmed === "::" ||
    trimmed === "::1" ||
    trimmed === "127.0.0.1" ||
    ALL_ZERO_IPV6.test(trimmed)
  ) {
    return "Local";
  }
  return trimmed;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test format-session-ip`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_lib/format-session-ip.ts apps/web/src/app/dashboard/customers/_lib/format-session-ip.test.ts
git commit -m "feat(customers): formatSessionIp normaliza IP"
```

---

## Task 2: Helpers de exibição + header `CustomerIdentity`

Extrai os mapas de badge/initials (hoje duplicados em `customer-header.tsx`/`customer-profile-form.tsx`) e cria o wrapper canônico do header.

**Files:**
- Create: `apps/web/src/app/dashboard/customers/_lib/customer-display.ts`
- Create: `apps/web/src/app/dashboard/customers/_components/customer-identity.tsx`

**Interfaces:**
- Consumes: `EntityIdentityHeader` (`@/components/entity/entity-identity-header`) — props `{ avatarUrl?, avatarFallback, title, subtitle?, badges?, actions?, avatarClassName?, className? }`; `CustomerDetail` (`../data`).
- Produces:
  - `getInitials(name: string): string`
  - `CLIENT_STATUS_CONFIG: Record<ClientStatus, { label: string; variant: "secondary"|"destructive"|"success" }>`
  - `CLIENT_TYPE_CONFIG: Record<ClientType, { label: string; variant: "info"|"warning" }>`
  - `ORDER_STATUS_LABELS: Record<string, string>`
  - `CURRENCY: Intl.NumberFormat`, `COUNT: Intl.NumberFormat`
  - `CustomerIdentity({ customer, actions }): JSX` — wrapper de `EntityIdentityHeader`.

- [ ] **Step 1: Criar `customer-display.ts`**

`apps/web/src/app/dashboard/customers/_lib/customer-display.ts`:
```ts
import type { ClientStatus, ClientType } from "@emach/db/schema/client";

const WHITESPACE_RE = /\s+/;

export function getInitials(name: string): string {
  const parts = name.trim().split(WHITESPACE_RE);
  if (parts.length === 1) {
    return (parts[0]?.slice(0, 2) ?? "").toUpperCase();
  }
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export const CLIENT_STATUS_CONFIG: Record<
  ClientStatus,
  { label: string; variant: "secondary" | "destructive" | "success" }
> = {
  active: { label: "Ativo", variant: "success" },
  inactive: { label: "Inativo", variant: "secondary" },
  blocked: { label: "Bloqueado", variant: "destructive" },
};

export const CLIENT_TYPE_CONFIG: Record<
  ClientType,
  { label: string; variant: "info" | "warning" }
> = {
  b2c: { label: "Pessoa Física (B2C)", variant: "info" },
  b2b: { label: "Pessoa Jurídica (B2B)", variant: "warning" },
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pago",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregue",
  canceled: "Cancelado",
  refunded: "Reembolsado",
};

export const CURRENCY = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});
export const COUNT = new Intl.NumberFormat("pt-BR");
```

- [ ] **Step 2: Criar `customer-identity.tsx`**

`apps/web/src/app/dashboard/customers/_components/customer-identity.tsx`:
```tsx
import { Badge } from "@emach/ui/components/badge";
import type { ReactNode } from "react";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import type { CustomerDetail } from "../data";
import {
  CLIENT_STATUS_CONFIG,
  CLIENT_TYPE_CONFIG,
  getInitials,
} from "../_lib/customer-display";

interface Props {
  actions?: ReactNode;
  customer: CustomerDetail;
}

export function CustomerIdentity({ customer, actions }: Props) {
  const status = CLIENT_STATUS_CONFIG[customer.status];
  const type = customer.clientType
    ? CLIENT_TYPE_CONFIG[customer.clientType]
    : null;

  return (
    <EntityIdentityHeader
      actions={actions}
      avatarFallback={getInitials(customer.name)}
      avatarUrl={customer.image}
      badges={
        <>
          <Badge variant={status.variant}>{status.label}</Badge>
          {type ? <Badge variant={type.variant}>{type.label}</Badge> : null}
        </>
      }
      subtitle={customer.email}
      title={customer.name}
    />
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS (componentes novos compilam; ainda não consumidos).

- [ ] **Step 4: Lint**

Run: `bun check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_lib/customer-display.ts apps/web/src/app/dashboard/customers/_components/customer-identity.tsx
git commit -m "refactor(customers): header via EntityIdentityHeader"
```

---

## Task 3: Edição por drawer (`EditCustomerButton` + `CustomerEditSheet`)

Substitui a edição inline (`customer-profile-form.tsx` em modo edit) pelo drawer canônico `EntityEditSheet`, controlado por `?edit=1`.

**Files:**
- Create: `apps/web/src/app/dashboard/customers/_components/edit-customer-button.tsx`
- Create: `apps/web/src/app/dashboard/customers/_components/customer-edit-sheet.tsx`

**Interfaces:**
- Consumes: `EntityEditSheet` (`@/components/entity/entity-edit-sheet`), `LabeledField` (`@/components/labeled-field`), `useFormErrors` (`@/lib/use-form-errors`), `updateCustomerProfileSchema`/`UpdateCustomerProfileInput` (`../schema`), `updateCustomerProfile` (`../actions`), `formatDocument` (`@/lib/cpf-cnpj`), `notify` (`@/lib/notify`).
- Produces:
  - `EditCustomerButton(): JSX`
  - `CustomerEditSheet({ customer: CustomerDetail }): JSX`

- [ ] **Step 1: Criar `edit-customer-button.tsx`**

`apps/web/src/app/dashboard/customers/_components/edit-customer-button.tsx`:
```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function EditCustomerButton() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const handleEdit = () => {
    const sp = new URLSearchParams(params);
    sp.set("edit", "1");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <Button onClick={handleEdit} size="sm" variant="outline">
      <Pencil aria-hidden className="mr-1.5 size-3.5" />
      Editar cliente
    </Button>
  );
}
```

- [ ] **Step 2: Criar `customer-edit-sheet.tsx`**

`apps/web/src/app/dashboard/customers/_components/customer-edit-sheet.tsx`:
```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@emach/ui/components/select";
import { Textarea } from "@emach/ui/components/textarea";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { LabeledField } from "@/components/labeled-field";
import { formatDocument } from "@/lib/cpf-cnpj";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { updateCustomerProfile } from "../actions";
import type { CustomerDetail } from "../data";
import {
  type UpdateCustomerProfileInput,
  updateCustomerProfileSchema,
} from "../schema";

interface Props {
  customer: CustomerDetail;
}

type FormValues = {
  name: string;
  email: string;
  phone: string;
  status: CustomerDetail["status"];
  clientType: string; // "" | "b2c" | "b2b"
  internalNotes: string;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
};

function toFormValues(c: CustomerDetail): FormValues {
  return {
    name: c.name,
    email: c.email,
    phone: c.phone ?? "",
    status: c.status,
    clientType: c.clientType ?? "",
    internalNotes: c.internalNotes ?? "",
  };
}

export function CustomerEditSheet({ customer }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const open = params.get("edit") === "1";

  const [values, setValues] = useState<FormValues>(() => toFormValues(customer));
  const { errors, reportValidationError, clearErrors } =
    useFormErrors<UpdateCustomerProfileInput>();
  const [submitting, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setValues(toFormValues(customer));
      clearErrors();
    }
  }, [open, customer, clearErrors]);

  const close = () => {
    const sp = new URLSearchParams(params);
    sp.delete("edit");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = updateCustomerProfileSchema.safeParse({
      clientId: customer.id,
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() || null,
      internalNotes: values.internalNotes.trim() || null,
      status: values.status,
      clientType: (values.clientType as "b2c" | "b2b") || null,
    });
    if (!parsed.success) {
      reportValidationError(parsed.error);
      return;
    }
    startTransition(async () => {
      const res = await updateCustomerProfile(parsed.data);
      if (res.ok) {
        notify.success("Cliente atualizado");
        close();
        router.refresh();
      } else {
        notify.error(res.error);
      }
    });
  };

  return (
    <EntityEditSheet
      description="Atualize os dados do cliente"
      onOpenChange={(v) => !v && close()}
      onSubmit={handleSubmit}
      open={open}
      submitting={submitting}
      title={`Editar ${customer.name}`}
    >
      <div className="flex flex-col gap-4">
        <LabeledField error={errors.name} label="Nome" required>
          {(field) => (
            <Input
              {...field}
              onChange={(e) =>
                setValues((p) => ({ ...p, name: e.target.value }))
              }
              value={values.name}
            />
          )}
        </LabeledField>

        <LabeledField error={errors.email} label="Email" required>
          {(field) => (
            <Input
              {...field}
              onChange={(e) =>
                setValues((p) => ({ ...p, email: e.target.value }))
              }
              type="email"
              value={values.email}
            />
          )}
        </LabeledField>

        <LabeledField error={errors.phone} label="Telefone">
          {(field) => (
            <Input
              {...field}
              onChange={(e) =>
                setValues((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="+55 11 9 9999-9999"
              value={values.phone}
            />
          )}
        </LabeledField>

        <LabeledField
          help={{ text: "Documento não é editável pelo admin (vem do cadastro do cliente)." }}
          label="Documento"
        >
          {() => (
            <Input
              disabled
              readOnly
              value={
                customer.document
                  ? formatDocument(customer.document)
                  : "Não informado"
              }
            />
          )}
        </LabeledField>

        <LabeledField error={errors.status} label="Status" required>
          {(field) => (
            <Select
              onValueChange={(v) =>
                v !== null &&
                setValues((p) => ({ ...p, status: v as FormValues["status"] }))
              }
              value={values.status}
            >
              <SelectTrigger {...field}>
                <SelectValue>{(v: string) => STATUS_LABELS[v] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="blocked">Bloqueado</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </LabeledField>

        <LabeledField error={errors.clientType} label="Tipo de cliente">
          {(field) => (
            <Select
              onValueChange={(v) =>
                setValues((p) => ({
                  ...p,
                  clientType: v === "__none__" || v === null ? "" : v,
                }))
              }
              value={values.clientType || "__none__"}
            >
              <SelectTrigger {...field}>
                <SelectValue>
                  {(v: string) =>
                    v === "__none__"
                      ? "Não definido"
                      : v === "b2c"
                        ? "Pessoa Física (B2C)"
                        : "Pessoa Jurídica (B2B)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none__">Não definido</SelectItem>
                  <SelectItem value="b2c">Pessoa Física (B2C)</SelectItem>
                  <SelectItem value="b2b">Pessoa Jurídica (B2B)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </LabeledField>

        <LabeledField error={errors.internalNotes} label="Notas internas">
          {(field) => (
            <Textarea
              {...field}
              maxLength={2000}
              onChange={(e) =>
                setValues((p) => ({ ...p, internalNotes: e.target.value }))
              }
              placeholder="Observações internas (não visível ao cliente)…"
              rows={4}
              value={values.internalNotes}
            />
          )}
        </LabeledField>
      </div>
    </EntityEditSheet>
  );
}
```

> **Nota sobre `LabeledField`:** o `children` é render-prop que recebe `field = { id, "aria-invalid" }` para spread no controle. `Input`/`SelectTrigger`/`Textarea` repassam `aria-invalid`. Se a API local de `help` divergir (checar `@/components/labeled-field`), trocar pela forma suportada (`help` aceita `{ text }` ou `{ title, body, example }`); na dúvida, omitir o `help` e deixar o `<p>` de aviso fora do `LabeledField` não é permitido (usar `hint` prop).

- [ ] **Step 3: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS. (Componentes ainda não montados na página.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/edit-customer-button.tsx apps/web/src/app/dashboard/customers/_components/customer-edit-sheet.tsx
git commit -m "feat(customers): editar cliente via drawer"
```

---

## Task 4: Tab "Visão geral" (`CustomerOverviewTab`)

KPIs (via `EntityKpisRow`) + card "Identidade & contato" + card "Últimos pedidos". Substitui `CustomerKpisHeader` (global) e o modo leitura de `CustomerProfileForm`.

**Files:**
- Create: `apps/web/src/app/dashboard/customers/_components/customer-overview-tab.tsx`

**Interfaces:**
- Consumes: `EntityKpisRow`/`KpiItem` (`@/components/entity/entity-kpis-row`), `Card`/`CardContent`/`CardHeader`/`CardTitle` (`@emach/ui/components/card`), `Badge`, `Table*` (`@emach/ui/components/table`), `formatDate`/`formatDateTime` (`@/lib/format/datetime`), `formatDocument`, helpers de `../_lib/customer-display`; tipos `CustomerDetail`/`CustomerKpis`/`CustomerOrderRow` (`../data`).
- Produces: `CustomerOverviewTab({ customer, kpis, recentOrders }): JSX`

- [ ] **Step 1: Criar `customer-overview-tab.tsx`**

`apps/web/src/app/dashboard/customers/_components/customer-overview-tab.tsx`:
```tsx
import { Badge } from "@emach/ui/components/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@emach/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@emach/ui/components/table";
import { CalendarDays, Receipt, ShoppingCart, Wallet } from "lucide-react";
import Link from "next/link";

import {
  EntityKpisRow,
  type KpiItem,
} from "@/components/entity/entity-kpis-row";
import { formatDocument } from "@/lib/cpf-cnpj";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import type {
  CustomerDetail,
  CustomerKpis,
  CustomerOrderRow,
} from "../data";
import {
  CLIENT_STATUS_CONFIG,
  CLIENT_TYPE_CONFIG,
  COUNT,
  CURRENCY,
  ORDER_STATUS_LABELS,
} from "../_lib/customer-display";

interface Props {
  customer: CustomerDetail;
  kpis: CustomerKpis;
  recentOrders: CustomerOrderRow[];
}

function Field({
  label,
  children,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function CustomerOverviewTab({ customer, kpis, recentOrders }: Props) {
  const status = CLIENT_STATUS_CONFIG[customer.status];
  const type = customer.clientType
    ? CLIENT_TYPE_CONFIG[customer.clientType]
    : null;

  const kpiItems: KpiItem[] = [
    {
      label: "LTV total",
      value: CURRENCY.format(kpis.ltv),
      hint: "receita confirmada",
      icon: Wallet,
    },
    {
      label: "Pedidos",
      value: COUNT.format(kpis.ordersCount),
      hint: "total de pedidos",
      icon: ShoppingCart,
    },
    {
      label: "Ticket médio",
      value: CURRENCY.format(kpis.averageTicket),
      hint: "por pedido pago",
      icon: Receipt,
    },
    {
      label: "Último pedido",
      value: kpis.lastOrderAt ? formatDate(kpis.lastOrderAt) : "—",
      hint: kpis.lastOrderAt
        ? (kpis.lastOrderStatus &&
            (ORDER_STATUS_LABELS[kpis.lastOrderStatus] ??
              kpis.lastOrderStatus)) || undefined
        : "Sem pedidos",
      icon: CalendarDays,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <EntityKpisRow items={kpiItems} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Identidade & contato</CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Email">
              <span className="flex items-center gap-1.5">
                {customer.email}
                {customer.emailVerified ? (
                  <Badge variant="success">Verificado</Badge>
                ) : (
                  <Badge variant="secondary">Não verificado</Badge>
                )}
              </span>
            </Field>
            <Field label="Telefone">{customer.phone ?? "—"}</Field>
            <Field label="Documento">
              <span className="font-mono">
                {customer.document ? formatDocument(customer.document) : "—"}
              </span>
            </Field>
            <Field label="Tipo">{type ? type.label : "—"}</Field>
            <Field label="Cliente desde">
              {formatDate(customer.createdAt)} · há {kpis.daysSinceCreated}{" "}
              {kpis.daysSinceCreated === 1 ? "dia" : "dias"}
            </Field>
            <Field label="Visto por último">
              {customer.lastSeenAt ? formatDateTime(customer.lastSeenAt) : "—"}
            </Field>
            <Field label="Notas internas">
              <span className="whitespace-pre-wrap">
                {customer.internalNotes ?? "—"}
              </span>
            </Field>
          </dl>
          <div className="-mx-4 mt-4 -mb-4 border-border border-t">
            <div className="flex flex-col items-center py-2.5">
              <span className="font-medium font-mono text-[13px] text-foreground">
                {customer.id}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                ID do cliente
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Últimos pedidos</CardTitle>
          <Link
            className="text-primary text-xs hover:underline"
            href="?tab=pedidos"
          >
            Ver tudo
          </Link>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum pedido ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      {order.number}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {CURRENCY.format(order.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {formatDate(order.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

> **Verificar a forma de `KpiItem.hint`:** é `ReactNode` opcional. O encadeamento `&&`/`|| undefined` acima evita passar `false`/`""`. Se `bun check` reclamar de `boolean` em `hint`, trocar por um helper local `lastOrderHint()` que retorna `string | undefined` explicitamente.

- [ ] **Step 2: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-overview-tab.tsx
git commit -m "feat(customers): tab Visao geral (KPIs + cards)"
```

---

## Task 5: Integração da página (`page.tsx`) — `EntityTabs` + header contextual

Reescreve o Server Component para o esqueleto canônico: header com ação por tab, `EntityTabs`, drawer de edição, lazy data (incl. `recentOrders` para a Visão geral). Remove os 4 componentes órfãos.

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/[id]/page.tsx` (reescrita)
- Delete: `customer-header.tsx`, `customer-kpis-header.tsx`, `customer-tabs.tsx`, `customer-profile-form.tsx`

**Interfaces:**
- Consumes: `CustomerIdentity` (Task 2), `EditCustomerButton`/`CustomerEditSheet` (Task 3), `CustomerOverviewTab` (Task 4), `EntityTabs`/`EntityTab` (`@/components/entity/entity-tabs`), os componentes de tab existentes, `getCustomer*` (`../data`), `ResetPasswordDialog`/`RevokeAllSessionsDialog` (`../_components/*`).

- [ ] **Step 1: Reescrever `page.tsx`**

Substituir TODO o conteúdo de `apps/web/src/app/dashboard/customers/[id]/page.tsx` por:
```tsx
import type { ClientAuditAction } from "@emach/db/schema/client-audit";
import {
  FileClock,
  MapPin,
  Monitor,
  ShieldCheck,
  ShoppingCart,
  Star,
  User,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  EntityTabs,
  type EntityTab,
} from "@/components/entity/entity-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { CustomerAddressesList } from "../_components/customer-addresses-list";
import { CustomerAuditTable } from "../_components/customer-audit-table";
import { CustomerConsentList } from "../_components/customer-consent-list";
import { CustomerEditSheet } from "../_components/customer-edit-sheet";
import { CustomerIdentity } from "../_components/customer-identity";
import { CustomerOrdersTable } from "../_components/customer-orders-table";
import { CustomerOverviewTab } from "../_components/customer-overview-tab";
import { CustomerReviewsTable } from "../_components/customer-reviews-table";
import { CustomerSessionsTable } from "../_components/customer-sessions-table";
import { EditCustomerButton } from "../_components/edit-customer-button";
import { ResetPasswordDialog } from "../_components/reset-password-dialog";
import { RevokeAllSessionsDialog } from "../_components/revoke-all-sessions-dialog";
import {
  getCustomerAddresses,
  getCustomerAudit,
  getCustomerConsent,
  getCustomerDetail,
  getCustomerKpis,
  getCustomerOrders,
  getCustomerReviews,
  getCustomerSessions,
} from "../data";
import { auditFilterSchema } from "../schema";

export const metadata: Metadata = { title: "Detalhe do cliente" };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const VALID_TABS = [
  "perfil",
  "enderecos",
  "pedidos",
  "avaliacoes",
  "consentimento",
  "sessoes",
  "auditoria",
] as const;
type TabKey = (typeof VALID_TABS)[number];

function parseTab(raw: unknown): TabKey {
  if (typeof raw === "string" && (VALID_TABS as readonly string[]).includes(raw)) {
    return raw as TabKey;
  }
  return "perfil";
}

function parsePage(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function pick(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function CustomerDetailPage({ params, searchParams }: PageProps) {
  return <CustomerDetailPageContent params={params} searchParams={searchParams} />;
}

async function CustomerDetailPageContent({ params, searchParams }: PageProps) {
  const session = await requireCapabilityOrRedirect(
    "customers.read",
    "/dashboard/sem-acesso?recurso=Clientes"
  );

  const { id } = await params;
  const raw = await searchParams;

  const currentTab = parseTab(pick(raw.tab));
  const page = parsePage(pick(raw.page));
  const parsedAudit = auditFilterSchema.safeParse({ action: pick(raw.auditAction) });
  const auditAction = parsedAudit.success ? parsedAudit.data.action : undefined;

  const [canEdit, canResetPassword, canModerateReviews, canManageSessions] =
    await Promise.all([
      can(session, "customers.update_status"),
      can(session, "customers.reset_password"),
      can(session, "reviews.moderate"),
      can(session, "customers.manage_sessions"),
    ]);

  const customer = await getCustomerDetail(id);
  if (!customer) {
    notFound();
  }

  const onOverview = currentTab === "perfil";

  const [kpis, recentOrders, addresses, ordersResult, reviews, consentByKind, sessions, auditItems] =
    await Promise.all([
      onOverview ? getCustomerKpis(id) : null,
      onOverview ? getCustomerOrders(id, 1) : null,
      currentTab === "enderecos" ? getCustomerAddresses(id) : null,
      currentTab === "pedidos" ? getCustomerOrders(id, page) : null,
      currentTab === "avaliacoes" ? getCustomerReviews(id) : null,
      currentTab === "consentimento" ? getCustomerConsent(id) : null,
      currentTab === "sessoes" ? getCustomerSessions(id) : null,
      currentTab === "auditoria"
        ? getCustomerAudit(id, { action: auditAction as ClientAuditAction | undefined })
        : null,
    ]);

  const tabs: EntityTab[] = [
    {
      value: "perfil",
      label: "Visão geral",
      icon: <User aria-hidden className="size-3.5" />,
      content:
        onOverview && kpis ? (
          <CustomerOverviewTab
            customer={customer}
            kpis={kpis}
            recentOrders={recentOrders?.items.slice(0, 3) ?? []}
          />
        ) : null,
    },
    {
      value: "enderecos",
      label: "Endereços",
      icon: <MapPin aria-hidden className="size-3.5" />,
      content:
        currentTab === "enderecos" && addresses ? (
          <CustomerAddressesList addresses={addresses} />
        ) : null,
    },
    {
      value: "pedidos",
      label: "Pedidos",
      icon: <ShoppingCart aria-hidden className="size-3.5" />,
      content:
        currentTab === "pedidos" && ordersResult ? (
          <CustomerOrdersTable customerId={customer.id} result={ordersResult} />
        ) : null,
    },
    {
      value: "avaliacoes",
      label: "Avaliações",
      icon: <Star aria-hidden className="size-3.5" />,
      content:
        currentTab === "avaliacoes" && reviews ? (
          <CustomerReviewsTable canModerate={canModerateReviews} reviews={reviews} />
        ) : null,
    },
    {
      value: "consentimento",
      label: "Consentimento",
      icon: <ShieldCheck aria-hidden className="size-3.5" />,
      content:
        currentTab === "consentimento" && consentByKind ? (
          <CustomerConsentList consentByKind={consentByKind} />
        ) : null,
    },
    {
      value: "sessoes",
      label: "Sessões",
      icon: <Monitor aria-hidden className="size-3.5" />,
      content:
        currentTab === "sessoes" && sessions ? (
          <CustomerSessionsTable
            canManage={canManageSessions}
            clientId={customer.id}
            sessions={sessions}
          />
        ) : null,
    },
    {
      value: "auditoria",
      label: "Auditoria",
      icon: <FileClock aria-hidden className="size-3.5" />,
      content:
        currentTab === "auditoria" && auditItems ? (
          <CustomerAuditTable auditAction={auditAction} items={auditItems} />
        ) : null,
    },
  ];

  let headerAction: ReactNode = null;
  if (onOverview && canEdit) {
    headerAction = <EditCustomerButton />;
  } else if (currentTab === "sessoes") {
    headerAction = (
      <>
        {canResetPassword ? (
          <ResetPasswordDialog clientId={customer.id} clientName={customer.name} />
        ) : null}
        {canManageSessions && sessions && sessions.length > 0 ? (
          <RevokeAllSessionsDialog clientId={customer.id} sessionCount={sessions.length} />
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <CustomerIdentity actions={headerAction} customer={customer} />
      <EntityTabs defaultValue="perfil" tabs={tabs} />
      {canEdit ? <CustomerEditSheet customer={customer} /> : null}
    </div>
  );
}
```

> **Atenção a props dos componentes de tab existentes.** Os nomes de prop acima (`CustomerOrdersTable result=`, `CustomerReviewsTable canModerate=`/`reviews=`, `CustomerConsentList consentByKind=`, `CustomerAuditTable items=`/`auditAction=`, `CustomerAddressesList addresses=`) são o **alvo**. Antes de assumir, **abrir cada componente** e casar as props reais (eles hoje recebem props via `CustomerTabs`). Se a assinatura atual diferir, ajustar a chamada aqui OU a assinatura do componente na sua própria task (6–9). O objetivo: cada componente recebe só o que precisa, direto da página.

- [ ] **Step 2: Deletar os órfãos**

```bash
git rm apps/web/src/app/dashboard/customers/_components/customer-header.tsx \
       apps/web/src/app/dashboard/customers/_components/customer-kpis-header.tsx \
       apps/web/src/app/dashboard/customers/_components/customer-tabs.tsx \
       apps/web/src/app/dashboard/customers/_components/customer-profile-form.tsx
```

- [ ] **Step 3: Caçar referências mortas**

Run: `grep -rn "customer-header\|customer-kpis-header\|customer-tabs\|customer-profile-form\|CustomerHeader\|CustomerKpisHeader\|CustomerTabs\|CustomerProfileForm" apps/web/src`
Expected: nenhuma referência fora de arquivos já deletados. Se aparecer, corrigir o import.

- [ ] **Step 4: Verificar tipos + lint + build**

Run: `bun check-types && bun check`
Expected: PASS. (Build completo roda no smoke; `check-types` não pega hook client em Server Component nem SQL — por isso o passo 5.)

- [ ] **Step 5: Smoke visual (obrigatório)**

Com o dev server em `localhost:3007`, abrir e conferir:
- `/dashboard/customers/51863cb8-954f-4717-9d34-7dce70b63147` → header `EntityIdentityHeader` (nome **sem serif**), tabs full-width com ícones, **Visão geral** com KPIs dentro + cards "Identidade & contato" e "Últimos pedidos". Botão **Editar cliente** abre **drawer**.
- Trocar para `?tab=sessoes` → header mostra **Resetar senha** + **Revogar todas**; **Editar some**.
- `/dashboard/customers/ATDidrnA0wmipTdoecwZfSpYwz3tqzNu` → Visão geral com "Nenhum pedido ainda"; tab Sessões lista as 2 sessions.
- Erros de runtime: `nextjs_call 3007 get_errors` (MCP next-devtools) se algo quebrar.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/app/dashboard/customers
git commit -m "refactor(customers): EntityTabs + acoes no header"
```

---

## Task 6: Tab Sessões em Card + IP normalizado

`customer-sessions-table.tsx` ganha shell `<Card>` e usa `formatSessionIp`. Remove o botão "Revogar todas" do corpo (migrou para o header na Task 5).

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-sessions-table.tsx`

**Interfaces:**
- Consumes: `formatSessionIp` (Task 1), `Card`/`CardContent`/`CardHeader`/`CardTitle`.
- Props alvo: `CustomerSessionsTable({ sessions, clientId, canManage })` (mantém — usado pela Task 5).

- [ ] **Step 1: Aplicar as mudanças**

Em `customer-sessions-table.tsx`:
1. Adicionar imports: `import { Card, CardContent, CardHeader, CardTitle } from "@emach/ui/components/card";` e `import { formatSessionIp } from "../_lib/format-session-ip";`. Remover `import { RevokeAllSessionsDialog } from "./revoke-all-sessions-dialog";` (não mais usado aqui).
2. Trocar a célula de IP:
```tsx
<TableCell className="font-mono text-muted-foreground text-xs">
  {formatSessionIp(session.ipAddress)}
</TableCell>
```
3. Remover o bloco `{canManage && (<div className="flex justify-end"><RevokeAllSessionsDialog … /></div>)}` (o "Revogar todas" agora vive no header).
4. Envolver a `<Table>` num `<Card>` com header:
```tsx
return (
  <Card>
    <CardHeader>
      <CardTitle className="text-sm">Sessões ativas</CardTitle>
    </CardHeader>
    <CardContent>
      <Table>{/* … */}</Table>
    </CardContent>
  </Card>
);
```
O early-return de lista vazia (`<Empty>`) também passa a vir dentro do `<Card>` (ou manter o `<Empty>` solto — escolher um; preferir dentro do Card para consistência).

- [ ] **Step 2: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 3: Smoke**

`/dashboard/customers/ATDidrnA0wmipTdoecwZfSpYwz3tqzNu?tab=sessoes` → tabela dentro de Card; coluna IP mostra **"Local"** (não `0000:0000:…`) e `177.133.209.36`; "Revogar todas" só no header; revogar individual continua na linha.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-sessions-table.tsx
git commit -m "refactor(customers): tab Sessoes em card + IP"
```

---

## Task 7: Tab Avaliações expõe corpo e nota de moderação

`customer-reviews-table.tsx` passa a renderizar `review.body` e `review.moderationNote` (hoje buscados e invisíveis) e ganha shell `<Card>`.

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx`

**Interfaces:**
- Props alvo (casar com a Task 5): `CustomerReviewsTable({ reviews, canModerate })`. Se a assinatura atual usar outro nome (ex: `canModerateReviews`), alinhar página e componente — escolher `canModerate` e atualizar a chamada na Task 5 se preciso.

- [ ] **Step 1: Ler o componente atual**

Run: `Read` em `customer-reviews-table.tsx` para ver a estrutura (tabela + ações de moderação inline).

- [ ] **Step 2: Aplicar mudanças**

1. Envolver o conteúdo num `<Card><CardHeader><CardTitle className="text-sm">Avaliações</CardTitle></CardHeader><CardContent>…</CardContent></Card>`.
2. Renderizar `body` abaixo do `title`/rating de cada review (ex: célula ou linha expandida):
```tsx
<div className="flex flex-col gap-0.5">
  {review.title ? <span className="font-medium text-sm">{review.title}</span> : null}
  <span className="text-muted-foreground text-sm">{review.body}</span>
</div>
```
3. Quando `review.moderationNote` existir, exibir como nota discreta (ex: abaixo do status):
```tsx
{review.moderationNote ? (
  <p className="text-muted-foreground text-xs">
    Nota de moderação: {review.moderationNote}
  </p>
) : null}
```

- [ ] **Step 3: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 4: Smoke**

`/dashboard/customers/51863cb8-954f-4717-9d34-7dce70b63147?tab=avaliacoes` → as 2 reviews mostram o **texto (body)**; moderação inline (aprovar/rejeitar/spam) intacta para quem tem `reviews.moderate`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx
git commit -m "feat(customers): reviews mostram corpo e moderacao"
```

---

## Task 8: Tabs Endereços e Pedidos em Card

Recasca leve: `customer-addresses-list.tsx` e `customer-orders-table.tsx` ganham shell `<Card>` (read-only, sem ação de header). Alinhar props com a Task 5.

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-addresses-list.tsx`
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx`

- [ ] **Step 1: Ler os dois componentes**

`Read` em ambos para confirmar assinatura/estrutura atuais.

- [ ] **Step 2: Endereços — Card**

Em `customer-addresses-list.tsx`: cada endereço já é um Card-like; garantir o shell `<Card>` padrão por endereço (header "Endereço" + badge "Principal" quando `isDefault`; corpo com `recipient`, `street, number` + `complement`, `neighborhood — city/state`, `CEP zipCode`, `country` só se `!= "BR"`). Empty state: `<Empty>` "Nenhum endereço cadastrado". Props alvo: `CustomerAddressesList({ addresses })`.

- [ ] **Step 3: Pedidos — Card**

Em `customer-orders-table.tsx`: envolver a tabela em `<Card>` (`CardTitle` "Pedidos"). Manter paginação atual. Props alvo: `CustomerOrdersTable({ result, customerId })` (casar com a chamada da Task 5; se hoje for `ordersResult`, renomear para `result` ou ajustar a página — escolher um e manter consistente).

- [ ] **Step 4: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 5: Smoke**

Fernanda `?tab=enderecos` (1 endereço, Balneário Camboriú/SC) e `?tab=pedidos` (EMC-1010 / EMC-1002, ambos "Enviado") dentro de Cards.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-addresses-list.tsx apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx
git commit -m "refactor(customers): enderecos e pedidos em card"
```

---

## Task 9: Tabs Consentimento e Auditoria — Card + empty states

Hoje têm **0 linhas** no banco (não é bug). Garantir empty state decente e shell `<Card>`.

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-consent-list.tsx`
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-audit-table.tsx`

- [ ] **Step 1: Ler os dois componentes**

`Read` em ambos (confirmar assinatura/estrutura + se já tratam vazio).

- [ ] **Step 2: Consentimento**

`CustomerConsentList({ consentByKind })`: quando o objeto não tem nenhuma `kind`, renderizar `<Empty><EmptyHeader><EmptyTitle>Nenhum consentimento registrado</EmptyTitle></EmptyHeader></Empty>`. Cards por kind dentro do padrão.

- [ ] **Step 3: Auditoria**

`CustomerAuditTable({ items, auditAction })`: quando `items` vazio, `<Empty>` "Nenhum registro de auditoria". Tabela dentro de `<Card>`; filtro de ação inline preservado.

- [ ] **Step 4: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 5: Smoke**

Qualquer cliente `?tab=consentimento` e `?tab=auditoria` → mostram empty state limpo, não tela quebrada.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-consent-list.tsx apps/web/src/app/dashboard/customers/_components/customer-audit-table.tsx
git commit -m "feat(customers): empty states consent/auditoria"
```

---

## Task 10: Verificação final

- [ ] **Step 1: Suite completa**

Run: `bun verify` (= `bun check-types && bun check && bun --cwd apps/web test`)
Expected: tudo verde (inclui o teste de `formatSessionIp`).

- [ ] **Step 2: Build de produção (gate de `"use server"`/SSR)**

Run: `bun run build`
Expected: build OK. (Pega `Only async functions are allowed to be exported in a "use server" file` e erros de SSR que `check-types` não vê.)

- [ ] **Step 3: Smoke visual completo**

Percorrer TODAS as tabs nas duas fixtures (Othavio + Fernanda):
- Header mostra **só** a ação da tab ativa (Editar na Visão geral; Resetar senha + Revogar todas em Sessões; nada nas demais).
- Editar abre **drawer** (`?edit=1`), salva e fecha.
- Sem `font-serif` no nome. KPIs dentro da Visão geral. IP "Local". Reviews com body. Empty states em Consent/Auditoria.

- [ ] **Step 4: Confirmar ausência de regressão de referências**

Run: `grep -rn "CustomerHeader\|CustomerKpisHeader\|CustomerTabs\|CustomerProfileForm" apps/web/src`
Expected: zero resultados.

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura da spec:**
- Header `EntityIdentityHeader` + sem `font-serif` → Task 2/5. ✔
- Ações contextuais (Editar na Visão geral; Resetar senha + Revogar todas em Sessões) → Task 5. ✔
- KPIs dentro da Visão geral → Task 4/5. ✔
- `EntityTabs` (ícones, lazy, `?tab=`) → Task 5. ✔
- Edição por drawer `EntityEditSheet` → Task 3. ✔
- Conteúdo em Card (overview, sessões, reviews, endereços, pedidos, consent, auditoria) → Task 4/6/7/8/9. ✔
- Polish: IP normalizado (Task 1/6), review body/note (Task 7), emailVerified/lastSeenAt/daysSinceCreated (Task 4), empty states (Task 9). ✔
- Remoção dos órfãos → Task 5. ✔
- Invariantes (auth ecommerce intacta, capabilities, datas, documento) → Global Constraints + Task 3/5. ✔

**Riscos / pontos a validar na execução:**
- **Props dos componentes de tab existentes** (orders/reviews/consent/audit/addresses) podem diferir dos nomes-alvo da Task 5 — cada task 6–9 abre o componente e alinha. Tasks marcam isso explicitamente.
- **API de `LabeledField.help`** e tipagem de `KpiItem.hint` — notas inline nas tasks 3 e 4 dão o fallback.
- `check-types` não pega hook client em Server Component nem SSR/SQL — **build + smoke visual** cobrem (Task 5 passo 5, Task 10).
