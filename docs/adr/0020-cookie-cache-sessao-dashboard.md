# ADR 0020 — `cookieCache` na sessão do dashboard (staleness de gate aceita)

**Data:** 2026-06-18
**Status:** Aceito
**Relaciona:** ADR-0016 (gates de 3 níveis — gate de `status`/`role`), ADR-0013 (convite-only). Issue #223 (perf: DashboardLayout bloqueia shell no hard load).

## Contexto

`DashboardLayout` lê a sessão atual (`requireCurrentSession` → `authDashboard.api.getSession`) no caminho crítico de render de **toda** rota privada. Sem `session.cookieCache`, cada request consulta o Postgres para resolver a sessão — medições de dev mostram `get-session` entre 470ms e 1.5s, o maior componente da latência percebida no hard load / F5 / URL direta.

`cookieCache` serve a sessão de um cookie **assinado** (à prova de adulteração) por até `maxAge`, eliminando o round-trip ao banco na maioria dos requests. O trade-off é que o gate de `status`/`role` do dashboard (defesa-em-profundidade dos invariantes P0 de auth — ver ADR-0016) passa a ler dado potencialmente **stale**.

Limitação confirmada na doc do Better Auth: **o cookie cache não é invalidável remotamente**. O cookie vive no browser do usuário-alvo; o servidor não tem como apagá-lo. Deletar/revogar as sessões no DB (que `suspendUser`/`updateUser`/`deleteUser` já fazem) só tem efeito quando o cookie cache do alvo expira ou quando é feita uma leitura forçada (`disableCookieCache: true`, que reintroduz o DB hit). Portanto a janela de staleness do gate é **sempre ≤ `maxAge`**, não eliminável por hook.

## Decisão

Habilitar `session.cookieCache` no Better Auth do dashboard com **`maxAge: 60` (segundos)** e **aceitar conscientemente** a janela de staleness de até 60s no gate de `status`/`role`.

- Um usuário recém-`suspended` ou com `role` rebaixado pode manter acesso ao dashboard por até 60s após a mutação, até o cookie cache expirar.
- A deleção de sessões no DB já existente (`suspendUser`/`updateUser` no role change/`deleteUser`) permanece — é o que efetiva o lockout assim que o cache expira.
- Sem hook de invalidação remota (infeasível) e **sem** `disableCookieCache` nas mutations nesta entrega (mantém a simplicidade; a janela ≤60s foi julgada aceitável para um painel admin convite-only onde suspensão é evento raro e não-adversarial-urgente).

## Opções consideradas

- **A (escolhida)** — `cookieCache` 60s, janela aceita. Maior ganho de latência, complexidade mínima. Risco: janela ≤60s de gate stale.
- **B (rejeitada agora)** — `cookieCache` 60s + leitura fresca (`disableCookieCache`) nas mutations sensíveis, protegendo writes do actor stale (alvo mantém só leitura do shell na janela). Mais robusto, mas reintroduz DB hit em toda mutation e adiciona complexidade. Reservado como follow-up se o threat model apertar.
- **C (rejeitada)** — deferir `cookieCache`, medir prod antes. O streaming de badges (issue #223) já remove counts/badges do caminho crítico; a latência residual de `get-session` pode ser artefato de cold-start/DB de dev. Rejeitada por opção explícita de priorizar o ganho agora; a validação em prod permanece como verificação pós-merge.

## Consequências

- Hard load do dashboard deixa de pagar o round-trip de sessão ao Postgres na maioria dos requests (dentro da janela de `maxAge`).
- **Invariante P0 ajustado:** o gate de `status`/`role` do dashboard tem staleness de até 60s. Operações verdadeiramente sensíveis a tempo (revogar acesso de um ator hostil **imediatamente**) não são garantidas pelo gate sozinho dentro da janela — se isso virar requisito, adotar a opção B.
- **Verificação pós-merge (gate da Fase B do #223):** medir TTFB / tempo até sidebar visível no hard load em produção (Vercel), antes/depois. Só investir em PPR/Cache Components se sobrar gargalo no frame estático.
- Reduzir `maxAge` aperta a janela ao custo de mais DB hits; aumentar faz o oposto. 60s é o ponto inicial.
