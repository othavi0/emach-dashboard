# ADR 0021 — Remoção do `cookieCache` da sessão do dashboard

**Data:** 2026-06-18
**Status:** Aceito — substitui [0020](0020-cookie-cache-sessao-dashboard.md)
**Relaciona:** ADR-0016 (gates de 3 níveis — gate de `status`/`role`). Issue #223 (perf: DashboardLayout bloqueia shell no hard load).

## Contexto

O ADR-0020 habilitou `session.cookieCache` (`maxAge: 60`) no Better Auth do dashboard para cortar o round-trip de `get-session` ao Postgres no hard load, aceitando conscientemente uma janela de staleness de ≤60s no gate de `status`/`role` (invariante P0).

A verificação pós-merge prevista no próprio ADR-0020 (gate da Fase B do #223) foi feita: medição em **produção** (Vercel), no Brave logado, com o deploy da Fase A (PR #226) ativo. Ela revelou que **o `cookieCache` não entrega no caminho que motivou a decisão**:

- O render do `DashboardLayout` é um **Server Component** — ele **lê** o cookie `session_data`, mas **não consegue escrevê-lo** (RSC não propaga `Set-Cookie` no Next.js App Router). Confirmado na doc do Better Auth.
- **Não há middleware** nem chamada client de `get-session` que refresque o cookie no caminho de navegação. Logo o cookie só é escrito no sign-in (e em server actions via `nextCookies`), expira em 60s e nunca é renovado por hard load.
- Prova empírica: hard loads repetidos de `/dashboard` **não** aceleram (cada um cai no DB); só um `GET /api/auth/get-session` explícito refresca o cache, e aí o load seguinte cai de ~178ms para ~163ms.
- Em prod **warm**, o DB read da sessão é barato (~178ms ≈ apenas o RTT BR→`iad1`); o ganho potencial do cache é da ordem de dezenas de ms, e **só** em loads warm repetidos durante uso ativo. O gargalo real do issue (`470ms–1.5s`) era **cold start de dev**, não warm prod.

Resultado líquido: o `cookieCache`, como configurado, carrega a **liability de staleness P0** do ADR-0020 sem entregar o benefício de latência correspondente.

## Decisão

**Remover** `session.cookieCache` do Better Auth do dashboard. A sessão volta a ser lida do Postgres em todo request (comportamento pré-ADR-0020).

## Opções consideradas

- **A (escolhida)** — remover o `cookieCache`. Torna o código honesto (não entregava no SSR), elimina a janela de staleness do gate e devolve o invariante P0 a leitura sempre fresca. O DB read warm já é barato.
- **B (rejeitada)** — adicionar middleware (runtime Node) que chama `getSession` e forwarda o cookie refrescado para o request do RSC, fazendo o cache entregar de fato. Rejeitada: o padrão de forwarding pro RSC do mesmo request **não é documentado** pelo Better Auth (código custom no caminho auth P0); a versão ingênua (sem forwarding) **regride** o cold load para 2× DB read; e nenhuma versão conserta o cold-open (o 1º load valida a sessão no DB de qualquer forma). Custo/risco desproporcional ao ganho (~dezenas de ms, só uso ativo).
- **C (rejeitada)** — deixar o `cookieCache` inerte. Rejeitada por incoerência: mantém a liability de staleness P0 documentada sem benefício.

## Consequências

- **Invariante P0 restaurado:** o gate de `status`/`role` volta a ler dado sempre fresco — um usuário recém-`suspended` ou rebaixado perde acesso no próximo request, sem janela de até 60s. Ganho de segurança.
- Hard load do dashboard paga o round-trip de sessão ao Postgres em todo request — em prod warm é barato (~178ms, dominado por rede BR→`iad1`); o custo alto restante é **cold start** (spin-up da função de baixo tráfego), inerente a serverless e não endereçado pelo `cookieCache`.
- As demais otimizações da Fase A do #223 permanecem: streaming dos badges (`use()`/`<Suspense>`), `pendingUsers` fundido na query única de counts e o índice parcial `stock_level_pending_idx`.
- O cookie `session_data` ainda presente em browsers de usuários (do deploy anterior) passa a ser ignorado pelo Better Auth — sem breakage.
