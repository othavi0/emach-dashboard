# Redesign da página de detalhe de cliente — design

**Data:** 2026-06-22
**Status:** Design aprovado (via brainstorming) — pronto para plano
**Relaciona:** `apps/web/CLAUDE.md` "Entity detail / CRUD pattern", `DESIGN.md` §4, ADR-0014 (RLS/client tables), isolamento de auth ecommerce (CLAUDE.md raiz — Auth invariantes P0)
**Origem:** queixa do usuário — `dashboard/customers/[id]` usa um design antigo, divergente de `tools/[id]` e `users/[id]`. Botões do header não são contextuais à tab ativa; edição não usa o drawer padrão; e suspeita de dados não carregando ("principalmente nas sessões").

## Problema

A página `apps/web/src/app/dashboard/customers/[id]/` foi construída antes da consolidação do padrão de entidade e ficou para trás. Divergências confirmadas (inspeção visual + leitura de código + dados reais no Supabase `wrxohbzepoyscsacjzvd`):

1. **Header próprio** (`CustomerHeader`) em vez de `EntityIdentityHeader`. Usa `font-serif text-3xl` no nome — **classe banida** pelo CLAUDE.md (Cormorant restrito a login hero + capa de relatório).
2. **Botões do header fixos em toda tab.** "Editar" e "Resetar senha" aparecem em qualquer tab, em vez da ação primária mudar conforme `sp.tab` (regra do padrão canônico). Queixa direta do usuário.
3. **KPIs globais acima das tabs** (`CustomerKpisHeader`), em vez de dentro da tab de visão geral (como em `users/[id]`).
4. **Tabs próprias** (`CustomerTabs`, `Tabs` base + `<Link>` por trigger) em vez de `EntityTabs` (full-width, ícones, count badges, `router.replace({scroll:false})`).
5. **Conteúdo sem card.** Tab de perfil é um `<dl>` "pelado"; Sessões/Auditoria são tabelas soltas — sem o shell `<Card>` do padrão.
6. **Edição inline na tab** (`?edit=1` troca o `<dl>` por um `<form>`) em vez do drawer `EntityEditSheet` (`Sheet` via `?edit=1`).
7. **Polish de dados.** Não há bug de carregamento de fato — os dados aparecem. Mas: IP IPv6 renderizado cru (`0000:0000:…0000`); campos buscados e nunca exibidos (`review.body`, `review.moderationNote`, `client.emailVerified`, `client.lastSeenAt`, `kpis.daysSinceCreated`); fallback "Carregando…" enganoso; Consentimento/Auditoria sem empty state (hoje 0 linhas — parece quebrado).

### Estado real dos dados (Supabase, 2026-06-22)

9 clientes (8 completos com telefone/documento/tipo/endereço), 8 endereços, **2 sessions** (só o cliente OAuth real `Othavio Quiliao` tem; os seeds têm 0), 12 pedidos, 7 reviews, **0 consent_logs, 0 audit_logs**. Confirmado que KPIs e tabs **carregam** (ex.: `Fernanda Oliveira Santos` `51863cb8-…` mostra LTV R$1.549,60 / 2 pedidos / CPF formatado; `Othavio` `ATDidrnA0…?tab=sessoes` lista as 2 sessions). Logo: o trabalho é **casca de UI + polish**, não correção de query.

## Decisões (do brainstorming)

| Dimensão | Decisão |
|---|---|
| **Abordagem** | Convergência total aos componentes canônicos, **reaproveitando a camada de dados** (`data.ts`/`actions.ts` ficam; só a UI muda). Componentes próprios obsoletos são removidos. |
| **KPIs** | **Dentro da tab "Visão geral"** (canônico, igual `users/[id]`). Não ficam globais acima das tabs. |
| **Header — ações** | Contextual por `sp.tab`. **Visão geral → "Editar"** (primário, drawer). **Sessões → "Revogar todas (N)" + "Resetar senha"** (eixo segurança — escolha do usuário). Demais tabs sem ação no header (ações são inline: moderação de review, filtro de auditoria). |
| **Tab "Perfil" → "Visão geral"** | Renomeada (alinha com tools; agora hospeda KPIs + cards de overview). |
| **Endereços / Pedidos** | **Read-only** no admin (não cria endereço/pedido de cliente). Sem ação no header. |
| **Edição** | Drawer `EntityEditSheet` (`?edit=1`), substituindo o form inline. |

---

## Arquitetura-alvo

Esqueleto idêntico ao canônico (`users/[id]/page.tsx` é a referência mais próxima):

```
<div className="flex flex-col gap-6 p-6">
  <CustomerIdentity actions={headerAction} customer={customer} />   {/* EntityIdentityHeader */}
  <EntityTabs defaultValue="perfil" tabs={tabs} />
  <CustomerEditSheet customer={customer} />                         {/* EntityEditSheet, ?edit=1 */}
</div>
```

**Valores de tab** ficam em português (preserva deep links existentes): `perfil` (default, label "Visão geral"), `enderecos`, `pedidos`, `avaliacoes`, `consentimento`, `sessoes`, `auditoria`. Só o **label** do default muda ("Perfil" → "Visão geral"); o `value` segue `perfil`. Tab default omite o param na URL (comportamento do `EntityTabs`).

O Server Component (`page.tsx`) lê `sp.tab`, carrega **só** os dados da tab ativa (lazy, já é o comportamento hoje) e decide `headerAction`:

```tsx
let headerAction: ReactNode = null;
if (!sp.tab || sp.tab === "perfil") {
  headerAction = <EditCustomerButton />;                 // ?edit=1
} else if (sp.tab === "sessoes") {
  headerAction = (
    <>
      <ResetPasswordDialog clientId={customer.id} clientName={customer.name} />
      <RevokeAllSessionsDialog clientId={customer.id} count={sessions?.length ?? 0} />
    </>
  );
}
```

### Componentes canônicos reusados (sem alteração)

- `EntityIdentityHeader` — `apps/web/src/components/entity/entity-identity-header.tsx`. Props: `{ avatarUrl?, avatarFallback, title, subtitle?, badges?, actions?, avatarClassName?, className? }`.
- `EntityTabs` — `apps/web/src/components/entity/entity-tabs.tsx`. Tabs: `{ value, label, icon?, badge?, content?, href? }[]`; sincroniza `?tab=`; default omite o param.
- `EntityKpisRow` — `apps/web/src/components/entity/entity-kpis-row.tsx`. Items: `{ label, value, icon?, hint?, tone?, href? }[]`; grid `grid-cols-2 md:grid-cols-4`.
- `EntityEditSheet` — `apps/web/src/components/entity/entity-edit-sheet.tsx`. Props: `{ open, onOpenChange, onSubmit, submitting?, title, description?, children, widthClassName?, submitLabel?, cancelLabel? }`. **Gotcha:** `widthClassName` precisa do prefixo `data-[side=right]:sm:max-w-*`.
- `Card`/`CardHeader`/`CardTitle`/`CardContent` (`@emach/ui/components/card`) para as seções.

### Tabs e ações

| value | label | ícone (lucide, `size-3.5`) | badge | conteúdo (em `<Card>`) | ação header |
|---|---|---|---|---|---|
| `perfil` (default) | Visão geral | `LayoutGrid`/`User` | — | KPIs + "Identidade & contato" + "Últimos pedidos" | **Editar** (drawer) |
| `enderecos` | Endereços | `MapPin` | nº endereços | lista de cards de endereço | — |
| `pedidos` | Pedidos | `ShoppingCart` | nº pedidos | tabela/linhas + scroll infinito | — |
| `avaliacoes` | Avaliações | `Star` | nº reviews | tabela + `body`/nota de moderação + moderação inline | — |
| `consentimento` | Consentimento | `ShieldCheck` | — | cards por kind + empty state | — |
| `sessoes` | Sessões | `Monitor` | nº sessions ativas | tabela em Card (IP normalizado) | **Revogar todas (N)** + **Resetar senha** |
| `auditoria` | Auditoria | `History` | — | tabela + filtro + empty state | — |

Count badges: preferir count de KPI agregado a carregar coleção inteira só pro `.length` (regra do padrão). Tabs não-ativas entregam `content: null` (lazy).

### Tab "Visão geral" — composição (espelha `ProfileTab` de usuário)

```
<div className="flex flex-col gap-6">
  <EntityKpisRow items={[ LTV, Pedidos, Ticket médio, Último pedido ]} />

  <Card>  {/* Identidade & contato */}
    <CardHeader …justify-between> <CardTitle>Identidade & contato</CardTitle> <StatusBadge/> </CardHeader>
    <CardContent>
      <dl className="grid …sm:grid-cols-2 lg:grid-cols-3">
        Nome · Email (+ badge "Verificado" se emailVerified) · Telefone · Documento (mono) ·
        Tipo (B2C/B2B) · Visto por último (lastSeenAt) · Notas internas
      </dl>
      {/* footer edge-to-edge: ID do cliente */}
      <div className="-mx-4 mt-4 -mb-4 border-border border-t"> … {customer.id} … </div>
    </CardContent>
  </Card>

  <Card>  {/* Últimos pedidos — preview dos 3 mais recentes */}
    <CardHeader …justify-between> <CardTitle>Últimos pedidos</CardTitle> <Link href="?tab=pedidos">Ver tudo</Link> </CardHeader>
    <CardContent> <Table>…</Table> | empty state "Nenhum pedido ainda" </CardContent>
  </Card>
</div>
```

Subtítulo do header: `email` (a linha "Cadastrado em … · N dias como cliente" — `daysSinceCreated` — vira `subtitle`/badge auxiliar, não dois `<p>` soltos).

---

## Mudanças por arquivo

**Criar** (em `_components/`, padrão dos wrappers canônicos):
- `customer-identity.tsx` — wrapper de `EntityIdentityHeader` (avatar `image`+iniciais, title `name`, subtitle, badges Status+Tipo, `actions`).
- `edit-customer-button.tsx` — Client Component que seta `?edit=1` via `router.replace({scroll:false})` (padrão `edit-branch-button.tsx`).
- `customer-edit-sheet.tsx` — `EntityEditSheet` controlado por `params.get("edit")==="1"`; campos do perfil; chama `updateCustomerProfile`. Usa `useFormErrors`/`<FieldError>` (padrão de forms novo) em vez do `notify.error` genérico atual.
- `customer-overview-tab.tsx` — composição da Visão geral (KPIs + 2 cards).
- helper de IP: `formatSessionIp(ip)` em `_lib/` (normaliza `0000:0000:…` → `::1`/"local"; mantém IPv4).

**Reescrever (recasca para o padrão, lógica preservada):**
- `page.tsx` — novo esqueleto (header contextual + `EntityTabs` + `CustomerEditSheet`); `headerAction` por `sp.tab`; KPIs movidos pra dentro de `overview`.
- `customer-addresses-list.tsx`, `customer-orders-table.tsx`, `customer-reviews-table.tsx` (+ `body`/nota), `customer-consent-list.tsx` (+ empty state), `customer-sessions-table.tsx` (Card + IP), `customer-audit-table.tsx` (+ empty state) — envolver em `<Card>`, ajustar para o conteúdo das tabs do `EntityTabs`.

**Remover (órfãos após migração):**
- `customer-header.tsx`, `customer-kpis-header.tsx`, `customer-tabs.tsx`, `customer-profile-form.tsx` (substituído por overview read-only + edit sheet).

**Camada de dados/ações (quase intacta):**
- `actions.ts`, `schema.ts`, `reset-password-dialog.tsx`, `revoke-session-dialog.tsx`, `revoke-all-sessions-dialog.tsx` — intactos. `getCustomerKpis` já calcula `daysSinceCreated` (hoje ignorado) — passa a ser consumido.
- **`data.ts` — única adição:** o preview "Últimos pedidos" da Visão geral precisa dos 3 pedidos mais recentes, carregados **junto com o overview** (a tab Pedidos é lazy e só carrega em `?tab=pedidos`). Reusar `getCustomerOrders(id, 1)` e fatiar 3, **ou** adicionar um helper enxuto `getCustomerRecentOrders(id, limit=3)` (read-only, mesmas colunas/formatação dos pedidos). O plano decide; preferir reuso se a query de página já trouxer os campos certos. Carregar só quando a tab ativa for `perfil` (default).

## Invariantes a preservar

- **Isolamento de auth.** "Resetar senha" escreve em `clientVerification` + usa `ECOMMERCE_ORIGIN` (tabelas/origin do ecommerce, via `@emach/db/schema/client` — permitido). **Nunca** importar `@emach/auth/ecommerce`. Comportamento funcional inalterado — só muda de lugar (header de Sessões).
- **Capabilities.** Gates de `customers.*` nas actions e o gate de exibição das ações (`canEdit`, `canResetPassword`, `canModerateReviews`) preservados.
- **Datas** via `src/lib/format/datetime.ts` (fuso fixo). **Documento** normalizado/máscara CPF-CNPJ. **Sem** `font-serif` no chrome.

## Verificação (smoke visual obrigatório — `check-types` não pega)

Em `localhost:3007`, percorrer:
1. `customers/ATDidrnA0…` (Othavio, OAuth, vazio comercial) — Visão geral sem pedidos (empty state), tab **Sessões** com 2 sessions + IP normalizado + "Revogar todas (2)" e "Resetar senha" **no header**.
2. `customers/51863cb8-…` (Fernanda, b2c rica) — KPIs dentro da Visão geral, "Últimos pedidos" preview, tabs Endereços/Pedidos/Avaliações (com `body`).
3. Header mostra **só** a ação da tab ativa (Editar só na Visão geral). Editar abre **drawer**.
4. `bun verify` (check-types + check + test) verde antes do commit.
