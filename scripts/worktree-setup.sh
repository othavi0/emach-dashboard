#!/usr/bin/env bash
# Prepara um worktree novo para subir o app: liga apps/web/.env ao do checkout
# principal e faz bun install real. Rodar de novo não muda nada.
#
#   scripts/worktree-setup.sh
set -euo pipefail

root=$(git rev-parse --show-toplevel)
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
cd "$root"

if [ "$root" != "$main" ] && [ ! -e apps/web/.env ] && [ ! -L apps/web/.env ]; then
	if [ ! -f "$main/apps/web/.env" ]; then
		echo "worktree-setup: $main/apps/web/.env não existe; crie a partir de apps/web/.env.example" >&2
		exit 1
	fi
	ln -s "$main/apps/web/.env" apps/web/.env
	echo "worktree-setup: apps/web/.env -> $main/apps/web/.env"
fi

# node_modules por symlink faz o bun resolver pacotes do workspace do principal.
if [ -L node_modules ] || [ ! -d node_modules ]; then
	[ -L node_modules ] && rm node_modules
	echo "worktree-setup: bun install"
	"$root/scripts/run-capped.sh" bun install
fi
