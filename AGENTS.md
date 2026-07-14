# Emach Dashboard — instruções para agentes

**Fonte única: [CLAUDE.md](CLAUDE.md)** (raiz). Leia-o integralmente antes de
qualquer mudança — inclui o aviso P0 de **banco único dev=prod** (nunca
seed/truncate/reset destrutivo sem autorização explícita nesta sessão).

Logs por área: [apps/web/CLAUDE.md](apps/web/CLAUDE.md) ·
[packages/db/CLAUDE.md](packages/db/CLAUDE.md) · design em [DESIGN.md](DESIGN.md) ·
glossário em [CONTEXT.md](CONTEXT.md) · decisões em `docs/adr/`.

> Este arquivo é só um ponteiro para ferramentas que procuram `AGENTS.md`.
> **Não duplicar conteúdo aqui** — a cópia anterior divergiu do CLAUDE.md em
> pontos P0 (roles com `manager` fantasma, limite de upload errado, paths
> inexistentes) e foi removida em 2026-07-13.
