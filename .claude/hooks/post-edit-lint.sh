#!/usr/bin/env bash
# Em PostToolUse só o stderr com exit 2 chega ao modelo; com exit 0 a saída vai para o log de
# debug, e com exit 1 o erro aparece ao user sem bloquear a tool.
set -u

if ! command -v jq > /dev/null 2>&1; then
	echo "post-edit-lint: jq ausente; o lint do arquivo editado não rodou" >&2
	exit 1
fi

f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] && [ -f "$f" ] || exit 0

# O biome rodado de outro checkout trata o arquivo como fora do projeto e sai 0
# calado; por isso o toplevel do próprio arquivo vem antes do CLAUDE_PROJECT_DIR.
root=$(git -C "$(dirname "$f")" rev-parse --show-toplevel 2> /dev/null) || root=${CLAUDE_PROJECT_DIR:-}
[ -n "$root" ] && cd "$root" || exit 0
[ -f sgconfig.yml ] && [ -f .claude/hooks/post-edit-lint.sh ] || exit 0

max=20
problems=""

if ! out=$(bun run fix --skip=correctness/noUnusedImports --skip=correctness/noUnusedVariables \
	--skip=correctness/noUnusedFunctionParameters --reporter=github --max-diagnostics="$max" "$f" 2>&1); then
	errors=$(printf '%s\n' "$out" | sed -n 's/^::error title=\([^,]*\),file=\([^,]*\),line=\([0-9]*\),.*::\(.*\)$/\2:\3 \1: \4/p' | head -n "$max")
	if [ -n "$errors" ]; then
		problems=$errors
	else
		problems="bun run fix falhou sem diagnóstico:
$(printf '%s\n' "$out" | tail -n 5)"
	fi
fi

case "$f" in
*.ts | *.tsx)
	if ! out=$(node_modules/.bin/ast-grep scan --report-style short "$f" 2>&1); then
		found=$(printf '%s\n' "$out" | grep -F 'error[' | head -n "$max")
		problems="${problems:+$problems
}${found:-ast-grep scan falhou sem diagnóstico:
$(printf '%s\n' "$out" | tail -n 5)}"
	fi
	;;
esac

[ -n "$problems" ] || exit 0
{
	echo "Erros de lint no arquivo (podem ser anteriores a esta edição) que o fix não corrige:"
	printf '%s\n' "$problems"
} >&2
exit 2
