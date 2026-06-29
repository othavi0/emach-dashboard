# ADR 0023 — `staleTimes` no Router Cache para reaproveitar navegação

**Data:** 2026-06-29
**Status:** Aceito
**Relaciona:** ADR-0021 (remoção do `cookieCache` — sessão lida do DB por request), ADR-0022 (freeze de navegação do #222, sem `loading.tsx`, PPR declinado), ADR-0016 (gate de `status`/`role`). Issue #223 (perf de navegação).

## Contexto

Queixa de uso diário: **toda troca de tab** (no detalhe de entidade, via `?tab=`), **toda navegação na sidebar**, e até **voltar a uma rota/tab já visitada sem alteração**, paga um carregamento perceptível. Medição empírica (DevTools Network + Resource Timing): cada uma dessas navegações dispara um fetch RSC novo ao servidor — **inclusive a revisita**.

Causa-raiz: o Router Cache client-side do Next 16 usa o default `experimental.staleTimes.dynamic = 0`, que trata toda entrada de rota **dinâmica** como imediatamente obsoleta — nunca reaproveitada. E **toda** rota `/dashboard/*` é dinâmica, porque a resolução de sessão (`getCurrentSession` → `headers()` em `src/lib/session.ts`) é uma dynamic API. Resultado: nenhuma navegação client-side reusa cache; cada uma re-renderiza o Server Component do zero (sessão + 7–12 queries + RTT).

Isto é **ortogonal ao #223 / ADR-0021**, que otimizaram o *tempo de resposta do servidor* (a leitura de sessão warm é ~178ms ≈ RTT BR→`iad1`). Esse trabalho nunca deixou o *cliente* reaproveitar a resposta — então o custo do servidor é pago de novo a cada navegação, inclusive em revisitas idênticas. Por isso o gargalo de navegação sobreviveu ao #223.

O cache key do Router Cache do Next **inclui os search params** quando o segmento os acessa no servidor (fonte: `segment-cache/cache-key.ts`), então `?tab=estoque` e `?tab=variantes` são entradas distintas e cacheáveis — `staleTimes` cobre a navegação por tab, não só a troca de pathname.

## Decisão

Definir `experimental.staleTimes = { dynamic: 30, static: 180 }` em `apps/web/next.config.ts`. Uma rota dinâmica visitada é reaproveitada do Router Cache por 30s; revisita dentro da janela é servida do cliente, **sem round-trip**. Mutações invalidam (via `router.refresh()` / `revalidatePath` já presentes); hard load / F5 / rota nova continuam sempre frescos.

**Trade-off P0 aceito conscientemente:** o gate de `status`/`role` (ADR-0016) fica stale por ≤30s **apenas em revisita soft a uma rota já renderizada** — um usuário recém-`suspended`/rebaixado veria conteúdo cacheado por até 30s ao voltar a uma tela já vista. É uma versão **mais branda** da janela que o ADR-0020 já aceitava (60s, no caminho de hard load): suspender já apaga as sessões no DB, e qualquer hard load / rota nova / fim da janela revalida e redireciona. Distinto do `cookieCache` do ADR-0021, que cacheava a própria sessão (assinada, não-invalidável remotamente).

## Opções consideradas

- **A (escolhida)** — `staleTimes.dynamic: 30`. Elimina o round-trip em revisitas (a dor diária dominante) por uma linha de config. Custo: janela de staleness de gate ≤30s só em revisita soft. Verificado green.
- **B (rejeitada)** — reabrir `cookieCache` + middleware para baratear a leitura de sessão. Já rejeitado pelo ADR-0021 com medição de prod (ganho de dezenas de ms, reintroduz staleness P0, código custom no caminho auth). `staleTimes` torna o ganho irrelevante: em revisita não há request, logo não há leitura de sessão a baratear.
- **C (rejeitada)** — `cacheComponents`/PPR para servir casca estática. Já rejeitado pelo ADR-0022 (incompatível com o freeze do #222).
- **Janela de 60s ou 15s** — 60s = mais ganho, mais exposição do gate; 15s = mais conservador, corta menos revisitas. 30s é o ponto inicial (metade da janela que o ADR-0020 aceitava), ajustável.

## Consequências

- **Revisita de tab/rota dentro de 30s = instantânea**, servida do Router Cache (0 requests — verificado via Resource Timing em `next build && next start`: 1ª visita à tab = 1 RSC 200, revisita <30s = 0 requests, revisita >30s = refetch).
- **Invariante P0 ajustado:** gate de `status`/`role` com staleness ≤30s só em revisita soft a rota já renderizada. Aceitável para painel admin convite-only (ADR-0013) onde suspensão é evento raro e não-adversarial-urgente.
- **A 1ª visita a cada tab/rota continua pagando o server cost** (10–12 queries) — em prod warm é ~178ms (rede). Baratear isso é trabalho futuro à parte (ex: `unstable_cache`/`cacheTag` nas reads de detalhe — cacheia *dados*, não sessão; não tem o trade-off P0 daqui).
- **Verificação de prod local exige cuidado:** `staleTimes` só vale em `next build && next start` (o `next dev` não prerenderiza — ADR-0022). E rodar `next start` numa porta ≠ `BETTER_AUTH_URL` ativa o `baseURL` fixo de prod (`packages/auth/src/dashboard.ts`) e faz todo RSC autenticado dar 503 (`getCurrentSession` propaga o erro). Para testar prod local numa porta X: alinhar `BETTER_AUTH_URL`/`CORS_ORIGIN` para X. Dev mode não sofre (`allowedHosts: ["localhost:*"]`).
- Reduzir/aumentar `dynamic` aperta/afrouxa a janela. 30s é o ponto inicial.
