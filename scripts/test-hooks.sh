#!/usr/bin/env bash
# Tabela de casos dos hooks do harness e do scripts/run-capped.sh:
# entrada -> exit esperado (e trecho esperado na saída). Roda no CI.
#
#   scripts/test-hooks.sh
set -uo pipefail

root=$(git rev-parse --show-toplevel)
cd "$root"
hook="$root/.claude/hooks/post-edit-lint.sh"
capped="$root/scripts/run-capped.sh"
src="$root/apps/web/src"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp" "$src"/hook-test-*.ts' EXIT

pass=0
fail=0

# check <nome> <exit esperado> <trecho esperado na saída ou ""> <stdin> -- <comando...>
check() {
	local name=$1 want_rc=$2 want_out=$3 input=$4
	shift 5
	local out rc
	out=$(printf '%s' "$input" | "$@" 2>&1)
	rc=$?
	if [ "$rc" -eq "$want_rc" ] && { [ -z "$want_out" ] || grep -qF -- "$want_out" <<< "$out"; }; then
		pass=$((pass + 1))
		echo "ok   $name"
	else
		fail=$((fail + 1))
		echo "FAIL $name: exit $rc (esperado $want_rc), trecho esperado: '$want_out'"
		printf '%s\n' "$out" | sed 's/^/     | /' | head -n 8
	fi
}

fixture() {
	local f="$src/hook-test-$1.ts"
	printf '%b' "$2" > "$f"
	printf '{"tool_input":{"file_path":"%s"}}' "$f"
}

console=$(fixture console 'export function a(): number {\n  console.log(1);\n  return 1;\n}\n')
unused=$(fixture unused 'function helper(x: number): number {\n  return x + 1;\n}\nexport const b = 2;\n')
memo=$(fixture memo 'import { useMemo } from "react";\nexport function useX(): number {\n  return useMemo(() => 1, []);\n}\n')
expect=$(fixture expect '// @ts-expect-error teste\nexport const c: number = 1;\n')
clean=$(fixture clean 'export const d = 1;\n')

echo "post-edit-lint.sh"
check "erro do biome volta com exit 2" 2 "noConsole" "$console" -- bash "$hook"
check "helper ainda sem uso passa" 0 "" "$unused" -- bash "$hook"
check "useMemo volta pelo ast-grep" 2 "no-manual-memo" "$memo" -- bash "$hook"
check "@ts-expect-error volta pelo ast-grep" 2 "no-ts-expect-error" "$expect" -- bash "$hook"
check "arquivo limpo passa" 0 "" "$clean" -- bash "$hook"
check "mensagem fala do arquivo, não da edição" 2 "Erros de lint no arquivo" "$console" -- bash "$hook"
check "CLAUDE_PROJECT_DIR de outro checkout não cala o lint" 2 "noConsole" "$console" -- env CLAUDE_PROJECT_DIR="$tmp" bash "$hook"
check "sem file_path sai 0" 0 "" '{"tool_input":{}}' -- bash "$hook"
check "arquivo inexistente sai 0" 0 "" '{"tool_input":{"file_path":"/nao/existe.ts"}}' -- bash "$hook"
other="$tmp/outro-repo"
git init -q "$other"
printf 'console.log(1);\n' > "$other/x.ts"
check "arquivo de outro repo git sai 0" 0 "" "{\"tool_input\":{\"file_path\":\"$other/x.ts\"}}" -- bash "$hook"
check "sem jq avisa e sai 1" 1 "jq ausente" "$clean" -- env PATH=/nonexistent "$(command -v bash)" "$hook"

echo "run-capped.sh"
check "sem comando sai 64" 64 "uso:" "" -- "$capped"
check "exit do comando é propagado" 7 "" "" -- "$capped" sh -c 'exit 7'
check "env do chamador chega ao comando" 0 "" "" -- env FOO=bar "$capped" sh -c 'test "$FOO" = bar'
check "stdin chega ao comando" 0 "" "entrada" -- "$capped" grep -qx entrada
check "sem bus de usuário roda sem teto e avisa" 3 "sem teto" "" -- \
	env -u DBUS_SESSION_BUS_ADDRESS -u XDG_RUNTIME_DIR "$capped" sh -c 'exit 3'
check "RUN_CAPPED já setado roda direto, sem aviso" 0 "" "" -- \
	bash -c 'out=$(env -u DBUS_SESSION_BUS_ADDRESS -u XDG_RUNTIME_DIR RUN_CAPPED=1 "$1" true 2>&1) && [ -z "$out" ]' _ "$capped"

# O CI não tem systemd de usuário: lá o caminho com teto vira o de fallback, e
# o teste diz qual dos dois exercitou.
if systemd-run --user --scope --quiet true > /dev/null 2>&1; then
	echo "caminho: com teto (systemd de usuário presente)"
	check "comando roda num scope com MemoryMax e RUN_CAPPED=1" 0 "" "" -- env MEM_MAX=3G "$capped" sh -c '
		test "$RUN_CAPPED" = 1 &&
		cg=$(cut -d: -f3 /proc/self/cgroup) &&
		case "$cg" in *.scope) ;; *) exit 1 ;; esac &&
		test "$(cat "/sys/fs/cgroup$cg/memory.max")" = 3221225472'
else
	echo "caminho: fallback (sem systemd de usuário, ex: CI)"
	check "comando roda sem teto, com aviso e sem RUN_CAPPED" 0 "sem teto" "" -- \
		env -u RUN_CAPPED "$capped" sh -c 'test -z "${RUN_CAPPED:-}"'
fi

echo "$pass ok, $fail falha(s)"
[ "$fail" -eq 0 ]
