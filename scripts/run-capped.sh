#!/usr/bin/env bash
#   scripts/run-capped.sh bun install
#   MEM_HIGH=16G MEM_MAX=20G scripts/run-capped.sh uv run scripts/remove-tool-image-bg.py
#
# O --scope roda o comando no processo atual, então env (PORT etc.), cwd e stdio
# do chamador chegam ao comando.
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
