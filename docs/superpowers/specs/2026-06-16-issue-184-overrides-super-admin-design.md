# Issue #184 — Blindar overrides de capability sobre super_admin

**Data:** 2026-06-16
**Issue:** #184 (origem: code-review do PR #183)
**Relaciona:** ADR-0017 (permissões por usuário), ADR-0016 (gates 3 níveis + filial)
**Status:** Design aprovado — pronto para plano de implementação

## Problema

É possível travar a gestão de permissões do dashboard inteiro por coordenação de
dois `super_admin` (ou comprometimento de conta) — um lock-out só recuperável via
SQL direto no banco.

`permissions.manage` (`capabilities.ts:352`, `defaultRoles: SA`) pode ser objeto de
um override `revoke` sobre um `super_admin`. Como `getUserCapabilities` resolve
`role default ± overrides` (`permissions.ts:54-77`), um override `revoke` **vence**
o default do role: o super_admin-alvo perde a cap **efetiva** mesmo continuando
`role = super_admin`.

### Por que os guards atuais não cobrem

1. `LAST_SUPER_ADMIN_GUARDED` (`permissions.ts:92-96`) lista só
   `users.suspend`/`users.delete`/`users.update_role` — **não** `permissions.manage`.
   Logo `assertNotLastActiveSuperAdmin` nem é chamado ao togglear `permissions.manage`
   (`permissions.ts:244-246`).
2. Mesmo se fosse chamado, `assertNotLastActiveSuperAdmin` (`permissions.ts:104-131`)
   só barra quando o alvo é o **último** super_admin ativo (checa `role`/`status`,
   não posse da cap). Com dois super_admins ativos, **nenhum** é "o último" → passa.

### Cenário de lock-out reproduzível

1. Super_admins **A** e **B**, ambos `active`.
2. **A** revoga `permissions.manage` de **B** → B perde a cap efetiva.
3. **B** (enquanto ainda tem a cap) revoga `permissions.manage` de **A**.
4. **Resultado:** zero usuários com `permissions.manage` efetiva. A aba "Permissões"
   fica inacessível para todos. Recuperação só por
   `DELETE FROM user_capability_override WHERE capability = 'permissions.manage'`.

Self-revogação já é barrada (`permissions.manage` ∈ `SELF_RESTRICTED`,
`permissions.ts:83-90`), então o lock-out exige **dois** atores — mas não exige
lock de DB nem condição de corrida.

### Confirmação da superfície (itens 1-3 do issue)

1. **Classe geral, não só `permissions.manage`.** Como `assertManageableTarget`
   (`permissions.ts:184-208`) deixa super_admin gerenciar super_admin sem restrição,
   um super_admin pode revogar via UI **qualquer** cap de outro super_admin
   (`branches.manage`, `users.delete`, etc.), degradando-o abaixo do teto do role.
   O lock-out de `permissions.manage` é o caso terminal (trava a própria recuperação).
2. **A UI expõe o vetor.** Em `page.tsx:86-90`, quando o ator é super_admin,
   `targetManageable` é `true` para qualquer outro usuário, inclusive outro
   super_admin. A aba "Permissões" é montada (`page.tsx:153-160`) e
   `manageableCaps = [...actorCaps]` (`page.tsx:100`) inclui `permissions.manage`,
   então o grid tri-state renderiza **"Revogar" habilitado** sobre `permissions.manage`
   de um super_admin-alvo. Alcançável só pela tela.
3. **Override sobre super_admin é semanticamente vazio.** super_admin tem tudo por
   role: um override `grant` é redundante, um `revoke` é exatamente o vetor de dano.
   Não há caso de uso legítimo para overrides sobre super_admin.

### Por que não é regressão do PR #183

Para chamar `setUserCapability` o ator já precisa possuir `permissions.manage`. A
anti-escalada antiga incidia sobre a cap-alvo (a própria `permissions.manage`), que
um super_admin **sempre** possui — revogar `permissions.manage` de outro super_admin
já era possível antes do #183. A Frente A (anti-escalada só no `grant`) não criou nem
ampliou este vetor para super_admins.

## Decisão: Opção A — overrides não se aplicam a super_admin

Overrides de capability passam a valer **apenas para `admin`/`user`**. super_admin é
sempre funcionalmente irrestrito (acesso total por role). Esta opção elimina a
**classe inteira** de bugs (não só `permissions.manage`), não apenas o lock-out.

### Alternativas descartadas

- **(B) Guard "≥1 super_admin com `permissions.manage` efetiva".** Cirúrgico, cobre o
  lock-out (inclusive o caso dois-super_admins), mas exige resolver caps efetivas de
  N super_admins a cada revoke (custo de query) e protege só esta cap — deixa a
  degradação de outras caps de super_admin de fora.
- **(C) Adicionar `permissions.manage` a `LAST_SUPER_ADMIN_GUARDED`.** Insuficiente
  sozinho: o guard só dispara para o *último* super_admin ativo, não para dois se
  revogando.
- **(D) Tratar caps `defaultRoles: S` como não-revogáveis para qualquer alvo.**
  Variante mais restrita de A; não fecha a degradação de caps `SA` de um super_admin.

A é a mais profunda e a mais simples de raciocinar: a invariante "super_admin =
acesso total" passa a ser verdadeira por construção, em vez de defendida cap-a-cap.

## Implementação — defesa em 3 camadas independentes

### Camada 1 — Resolução (`apps/web/src/lib/permissions.ts`, `getUserCapabilities` :54-77)

Early-return quando `role === "super_admin"`: devolve `roleDefaultCapabilities("super_admin")`
sem buscar nem aplicar overrides.

- **Defesa de fundo:** torna qualquer override sobre super_admin **inerte**, cobrindo
  dados legados e o caso "user com override `revoke` depois promovido a super_admin".
- **Bônus:** poupa a query de overrides por request para super_admins.
- **Sem perda semântica:** para super_admin, role já = tudo; `grant` é redundante,
  `revoke` é o vetor — ignorar ambos é correto.

### Camada 2 — Action (`apps/web/src/app/dashboard/users/[id]/permissions/actions.ts`, `setUserCapability`)

Buscar o `role` do alvo (query leve `SELECT role FROM "user" WHERE id = targetUserId`)
e rejeitar com `{ ok: false, error: "Super admin tem acesso total — permissões não são ajustáveis" }`
quando `targetRole === "super_admin"` **e** `state !== "inherit"`.

- Guard colocado logo após o `safeParse`/`isCapability`, **antes** de qualquer escrita.
- `inherit` (delete de override) **permanece permitido** sobre super_admin — é
  idempotente, só remove override fantasma, nunca cria lock-out, e serve de limpeza
  pela própria action.
- A query de role do alvo é nova (a action hoje só busca `userBranch`); não reusar
  `assertManageableTarget`, que retorna early para ator super_admin sem expor o role.

### Camada 3 — UI (`apps/web/src/app/dashboard/users/[id]/page.tsx` + `_components/permissions-tab.tsx`)

Quando `user.role === "super_admin"`, a aba "Permissões" continua aparecendo (para
super_admin atores), mas o conteúdo vira um **estado explicativo** em vez do grid
tri-state:

> Super admin tem acesso total irrestrito — permissões não são ajustáveis.

- Em `page.tsx`, derivar `targetIsSuperAdmin = user.role === "super_admin"`; quando
  true, `permissionsTabContent` = nota explicativa (não computar/renderizar o grid).
- A aba permanece na lista de tabs (`page.tsx:153-160`) para não criar tab "morta";
  o estado explicativo é o conteúdo.
- Sem toggles editáveis, sem estado-fantasma de override legado aparecendo travado.

## Testes (vitest, `apps/web`, `bun --cwd apps/web test`)

Mock de `@emach/db` via `vi.hoisted` + `vi.mock` (referência: `__tests__/activity.test.ts`).

1. **Lock-out do issue:** `setUserCapability({ target: superAdmin, capability: "permissions.manage", state: "revoke" })`
   → `{ ok: false }`, nenhum insert em `user_capability_override`.
2. **Classe geral:** `setUserCapability` com `state: "revoke"` de cap arbitrária sobre
   alvo super_admin → rejeitado.
3. **`inherit` permitido:** `setUserCapability({ target: superAdmin, state: "inherit" })`
   → `{ ok: true }`, delete idempotente.
4. **Resolução ignora override:** `getUserCapabilities` de session super_admin com
   override `revoke` de `permissions.manage` gravado → cap **ainda presente**.
5. **Regressão:** override `grant`/`revoke` sobre alvo `admin`/`user` continua
   funcionando (não barrado pela Camada 2; aplicado pela Camada 1).

## Documentação

Adendo ao **ADR-0017** com seção "Invariante: overrides não se aplicam a super_admin",
cobrindo os itens 1-3 do issue e a justificativa da Opção A vs B/C/D. Este spec fica
como o registro detalhado do design.

## Cleanup de dados legados (opcional)

Como a Camada 1 já neutraliza overrides legados, é só higiene:

```sql
DELETE FROM user_capability_override
WHERE user_id IN (SELECT id FROM "user" WHERE role = 'super_admin');
```

Push-only (ADR-0006) → script SQL pontual, idempotente e seguro. Toca o banco
compartilhado; rodar é opcional. Esperado: 0 linhas (feature de 2026-06-15).

## Critério de aceite

- [ ] Camada 1: `getUserCapabilities` ignora overrides para super_admin.
- [ ] Camada 2: `setUserCapability` rejeita `grant`/`revoke` sobre alvo super_admin.
- [ ] Camada 3: aba "Permissões" mostra estado explicativo para alvo super_admin.
- [ ] Testes 1-5 verdes.
- [ ] Adendo no ADR-0017.
- [ ] `bun check-types` + `bun check` limpos.
