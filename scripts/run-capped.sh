#!/usr/bin/env bash
# Roda um comando pesado (next dev, bun install, script Python) num scope do
# systemd com teto de memória, para o systemd-oomd não derrubar o terminal.
#
#   scripts/run-capped.sh bun install
#   MEM_HIGH=16G MEM_MAX=20G scripts/run-capped.sh uv run scripts/remove-tool-image-bg.py
#
# O `dev` de apps/web e o scripts/remove-tool-image-bg.py já chamam este script
# sozinhos. Defaults: MEM_HIGH=4G, MEM_MAX=6G.
# O --scope roda o comando no processo atual, então env (PORT etc.), cwd e stdio
# do chamador chegam ao comando. O filho recebe RUN_CAPPED=1; com ele já setado
# o comando roda direto, sem um segundo scope. Sem systemd de usuário (CI,
# container, ssh sem linger) o comando roda sem teto, com aviso no stderr.
set -euo pipefail

if [ "$#" -eq 0 ]; then
	echo "uso: scripts/run-capped.sh <comando> [args...]" >&2
	exit 64
fi

if [ -n "${RUN_CAPPED:-}" ]; then
	exec "$@"
fi

if ! systemd-run --user --scope --quiet true > /dev/null 2>&1; then
	echo "run-capped: systemd-run --user indisponível; rodando sem teto de memória" >&2
	exec "$@"
fi

export RUN_CAPPED=1
exec systemd-run --user --scope --quiet --collect \
	-p MemoryHigh="${MEM_HIGH:-4G}" -p MemoryMax="${MEM_MAX:-6G}" \
	-- "$@"
