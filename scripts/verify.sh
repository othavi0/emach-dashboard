#!/usr/bin/env bash
# Lista única de gates do repo. O `bun verify` e o job quality do ci.yml chamam
# este script, então gate novo entra aqui como mais uma linha `gate`, nunca no ci.yml.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# As variáveis exportadas vencem o apps/web/.env, então teste e build nunca
# conectam no banco único (dev = prod).
set -a
# shellcheck source=scripts/ci-dummy.env
. scripts/ci-dummy.env
set +a

gate() {
	echo "== $1"
	shift
	"$@"
}

# ast-grep test sai 0 com menos regras quando uma config some; sem comparar com o
# número de arquivos de regra, o gate ficaria verde sem enforcement.
ast_grep_self_test() {
	local rules out
	rules=$(find tooling/ast-grep/rules -name '*.yml' | wc -l)
	out="$(bun guard:forms:test 2>&1)"
	echo "$out"
	grep -qE "ok\. ${rules} passed; 0 failed" <<< "$out" || {
		echo "esperava ${rules} regras ast-grep testadas e verdes" >&2
		return 1
	}
}

gate check-types bun check-types
gate check bun check
gate check:docs bun run check:docs
gate ruff uvx ruff@0.16.10 check .
gate guard:forms bun guard:forms
gate "ast-grep self-test" ast_grep_self_test
gate test bun run test
# Os casos do run-capped.sh partem de um shell sem teto. Com RUN_CAPPED herdado de
# um chamador já cercado, o run-capped pula o systemd-run e dois casos falham.
gate test-hooks env -u RUN_CAPPED scripts/test-hooks.sh
gate build env MEM_HIGH=6G MEM_MAX=8G scripts/run-capped.sh bun run --filter=web build
