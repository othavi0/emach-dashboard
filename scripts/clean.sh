#!/usr/bin/env bash
# Clean build artifacts, caches and node_modules across the monorepo.
#
# Usage:
#   ./scripts/clean.sh              # interactive (asks confirmation)
#   ./scripts/clean.sh -y           # skip confirmation
#   ./scripts/clean.sh --dry-run    # preview only (no deletion)
#   ./scripts/clean.sh --cache      # also clear bun pm cache
#   ./scripts/clean.sh -y --cache   # combine flags
#
# Safe by design: only removes well-known artifact directories/files.
# Never touches .git, source code, .claude/.codex/.agents configs or .env files.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

YES=0
DRY_RUN=0
CLEAR_BUN_CACHE=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes) YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --cache) CLEAR_BUN_CACHE=1 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""
fi

# Directories to scan recursively (cap depth so we don't traverse into removed dirs)
PRUNE_DIRS=(
  ".git"
  ".claude"
  ".codex"
  ".agents"
  ".superpowers"
)

# Directory names to remove (matched at any depth, but pruning above prevents config dirs)
DIR_TARGETS=(
  "node_modules"
  ".turbo"
  ".next"
  "dist"
  "build"
  ".cache"
  "coverage"
  ".nyc_output"
  ".fallow"
  ".playwright-mcp"
  ".parcel-cache"
  "tmp"
  "temp"
)

# File patterns to remove (matched at any depth, prune dirs respected)
FILE_TARGETS=(
  "*.tsbuildinfo"
  "*.log"
  ".eslintcache"
)

# Build a single find expression that:
#   - prunes config dirs (.git, .claude, etc.) so we never enter them,
#   - matches and prunes target directories (so we don't descend into them),
#   - matches target files at remaining locations.
build_find_args() {
  local args=()

  # Skip protected config dirs entirely.
  args+=("(")
  local first=1
  local d
  for d in "${PRUNE_DIRS[@]}"; do
    if [[ $first -eq 1 ]]; then
      args+=("-name" "$d")
      first=0
    else
      args+=("-o" "-name" "$d")
    fi
  done
  args+=(")" "-prune")

  # Match target directories: print, then prune (don't recurse inside).
  args+=("-o" "-type" "d" "(")
  first=1
  for d in "${DIR_TARGETS[@]}"; do
    if [[ $first -eq 1 ]]; then
      args+=("-name" "$d")
      first=0
    else
      args+=("-o" "-name" "$d")
    fi
  done
  args+=(")" "-prune" "-print0")

  # Match target files at any remaining location.
  args+=("-o" "-type" "f" "(")
  first=1
  local f
  for f in "${FILE_TARGETS[@]}"; do
    if [[ $first -eq 1 ]]; then
      args+=("-name" "$f")
      first=0
    else
      args+=("-o" "-name" "$f")
    fi
  done
  args+=(")" "-print0")

  printf '%s\0' "${args[@]}"
}

# Collect matching paths into a global array MATCHES.
MATCHES=()
collect_matches() {
  MATCHES=()
  local find_args=()
  while IFS= read -r -d '' a; do
    find_args+=("$a")
  done < <(build_find_args)

  while IFS= read -r -d '' p; do
    MATCHES+=("$p")
  done < <(find . "${find_args[@]}" 2>/dev/null)
}

human_size() {
  local path="$1"
  if [[ -e "$path" ]]; then
    du -sh "$path" 2>/dev/null | awk '{print $1}'
  else
    echo "0"
  fi
}

total_size() {
  if [[ ${#MATCHES[@]} -eq 0 ]]; then
    echo "0B"
    return
  fi
  du -sch "${MATCHES[@]}" 2>/dev/null | tail -n1 | awk '{print $1}'
}

echo "${C_BOLD}${C_CYAN}emach-dashboard cleanup${C_RESET}"
echo "${C_DIM}root: $ROOT_DIR${C_RESET}"
echo

echo "${C_BOLD}Scanning…${C_RESET}"
collect_matches

if [[ ${#MATCHES[@]} -eq 0 ]]; then
  echo "${C_GREEN}Nothing to clean. Workspace is already pristine.${C_RESET}"
  if [[ $CLEAR_BUN_CACHE -eq 1 && $DRY_RUN -eq 0 ]]; then
    echo
    echo "${C_BOLD}Clearing bun pm cache…${C_RESET}"
    bun pm cache rm || true
  fi
  exit 0
fi

echo "${C_BOLD}Found ${#MATCHES[@]} item(s):${C_RESET}"
for p in "${MATCHES[@]}"; do
  printf '  %s%-8s%s  %s\n' "$C_YELLOW" "$(human_size "$p")" "$C_RESET" "$p"
done

echo
echo "${C_BOLD}Total: ${C_YELLOW}$(total_size)${C_RESET}"

if [[ $CLEAR_BUN_CACHE -eq 1 ]]; then
  echo "${C_DIM}Will also clear bun pm cache.${C_RESET}"
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo
  echo "${C_CYAN}Dry-run: nothing was deleted.${C_RESET}"
  exit 0
fi

if [[ $YES -ne 1 ]]; then
  echo
  read -r -p "Proceed with deletion? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *)
      echo "${C_RED}Aborted.${C_RESET}"
      exit 1
      ;;
  esac
fi

echo
echo "${C_BOLD}Deleting…${C_RESET}"
for p in "${MATCHES[@]}"; do
  rm -rf "$p"
  echo "  ${C_GREEN}✓${C_RESET} $p"
done

if [[ $CLEAR_BUN_CACHE -eq 1 ]]; then
  echo
  echo "${C_BOLD}Clearing bun pm cache…${C_RESET}"
  bun pm cache rm || true
fi

echo
echo "${C_GREEN}${C_BOLD}Done.${C_RESET} Run ${C_BOLD}bun install${C_RESET} to restore dependencies."
