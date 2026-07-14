#!/usr/bin/env bash
# Sync the company fork (emach-ferramentas/emach-dashboard) with the origin
# (othavi0/emach-dashboard) via force-push.
#
# Why force-push? The two repos have unrelated histories (no common ancestor),
# so a regular merge/PR produces an unreviewable diff. Force-push is the
# pragmatic path while the divergence persists.
#
# Usage:
#   ./scripts/sync-fork.sh              # interactive (asks confirmation)
#   ./scripts/sync-fork.sh -y           # skip confirmation
#   ./scripts/sync-fork.sh --dry-run    # preview only (no push)
#   ./scripts/sync-fork.sh --branch X   # sync branch X instead of main
#   ./scripts/sync-fork.sh -h           # this help
#
# Requirements:
#   - gh CLI logged in with TWO accounts:
#       * othavi0  (origin owner)
#       * emach-ferramentas  (fork owner, needs WRITE/ADMIN on the fork)
#     If `emach-ferramentas` is missing, run:  gh auth login
#   - gh credential helper configured:  gh auth setup-git
#
# Safety:
#   - Uses --force-with-lease (aborts if someone pushed to the fork after our
#     last fetch).
#   - Switches to emach-ferramentas only for the push, restores original
#     active account on exit (even on error).
#   - Adds the fork remote under a temporary name; removes it on exit.
#   - Never touches the local working tree.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# --- config ---------------------------------------------------------------
ORIGIN_OWNER="othavi0"
FORK_OWNER="emach-ferramentas"
REPO_NAME="emach-dashboard"
FORK_REMOTE_NAME="company-sync-tmp"
FORK_URL="https://github.com/${FORK_OWNER}/${REPO_NAME}.git"

# --- flags ----------------------------------------------------------------
YES=0
DRY_RUN=0
BRANCH="main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --branch)
      [[ $# -lt 2 ]] && { echo "--branch requires an argument" >&2; exit 1; }
      BRANCH="$2"; shift 2 ;;
    -h|--help)
      # Print only the leading header block (skip shebang, stop at first
      # non-comment line — keeps section separators like `# --- foo ---` out).
      awk 'NR==1 && /^#!/ { next }
           /^#( |$)/      { sub(/^# ?/, ""); print; next }
                          { exit }' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

# --- colors ---------------------------------------------------------------
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

say()  { printf '%s\n' "$*"; }
info() { printf '%s%s%s\n' "${C_CYAN}" "$*" "${C_RESET}"; }
ok()   { printf '%s%s%s\n' "${C_GREEN}" "$*" "${C_RESET}"; }
warn() { printf '%s%s%s\n' "${C_YELLOW}" "$*" "${C_RESET}" >&2; }
err()  { printf '%s%s%s\n' "${C_RED}" "$*" "${C_RESET}" >&2; }

# --- preflight ------------------------------------------------------------
command -v gh  >/dev/null || { err "gh CLI not found in PATH."; exit 1; }
command -v git >/dev/null || { err "git not found in PATH."; exit 1; }

# Both accounts must be authenticated.
if ! gh auth status 2>&1 | grep -q "account ${FORK_OWNER}"; then
  err "Account '${FORK_OWNER}' is not authenticated in gh."
  say  "Run:  ${C_BOLD}gh auth login --git-protocol ssh --hostname github.com${C_RESET}"
  say  "Then log in with the ${FORK_OWNER} account and retry."
  exit 1
fi

# Remember the currently active account so we can restore it on exit.
# gh's `auth status` interleaves "Logged in to ... account NAME (keyring)" and
# "Active account: true" lines per account. We want the NAME of the active one.
ORIGINAL_ACTIVE="$(
  gh auth status 2>&1 | awk '
    /Logged in to github.com account/ { acct=$(NF-1) }
    /Active account: true/            { print acct; exit }
  '
)"
if [[ -z "${ORIGINAL_ACTIVE:-}" ]]; then
  # Fallback: query the API for the currently-active token's login.
  ORIGINAL_ACTIVE="$(gh api user --jq .login 2>/dev/null || echo "${ORIGIN_OWNER}")"
fi

# gh credential helper must be wired so HTTPS push uses the gh token, not SSH.
if ! git config --global --get-all credential."https://github.com".helper 2>/dev/null \
   | grep -q "gh auth git-credential"; then
  warn "git credential helper for github.com is not configured for gh."
  say  "Running: ${C_BOLD}gh auth setup-git${C_RESET}"
  gh auth setup-git
fi

# --- inspect remote state -------------------------------------------------
info "${C_BOLD}sync-fork${C_RESET} ${C_DIM}— branch '${BRANCH}'${C_RESET}"
say  "  source : ${ORIGIN_OWNER}/${REPO_NAME}  (local HEAD of '${BRANCH}')"
say  "  target : ${FORK_OWNER}/${REPO_NAME}    (force-push)"

LOCAL_SHA="$(git rev-parse --verify --quiet "refs/heads/${BRANCH}" 2>/dev/null || true)"
if [[ -z "${LOCAL_SHA}" ]]; then
  err "Local branch '${BRANCH}' not found."
  say "  Existing local branches:"
  git for-each-ref --format='    %(refname:short)' refs/heads/ | head -20 >&2
  exit 1
fi

# Use the fork URL directly with ls-remote to avoid mutating remotes prematurely.
REMOTE_SHA="$(git ls-remote "${FORK_URL}" "refs/heads/${BRANCH}" 2>/dev/null | awk '{print $1}')"

say  ""
say  "  local  ${BRANCH}: ${C_BOLD}${LOCAL_SHA}${C_RESET}"
if [[ -n "${REMOTE_SHA}" ]]; then
  say  "  remote ${BRANCH}: ${C_BOLD}${REMOTE_SHA}${C_RESET}"
else
  warn "  remote ${BRANCH}: (does not exist — will be created)"
fi

if [[ -n "${REMOTE_SHA}" && "${LOCAL_SHA}" == "${REMOTE_SHA}" ]]; then
  ok "Already in sync. Nothing to do."
  exit 0
fi

# --- confirm --------------------------------------------------------------
if [[ ${DRY_RUN} -eq 1 ]]; then
  warn ""
  warn "DRY RUN — no push will be performed."
  say  ""
  say  "Would execute:"
  say  "  ${C_DIM}gh auth switch --user ${FORK_OWNER}${C_RESET}"
  say  "  ${C_DIM}git remote add ${FORK_REMOTE_NAME} ${FORK_URL}${C_RESET}"
  if [[ -n "${REMOTE_SHA}" ]]; then
    say  "  ${C_DIM}git push ${FORK_REMOTE_NAME} ${BRANCH}:${BRANCH} \\${C_RESET}"
    say  "  ${C_DIM}        --force-with-lease=${BRANCH}:${REMOTE_SHA}${C_RESET}"
  else
    say  "  ${C_DIM}git push ${FORK_REMOTE_NAME} ${BRANCH}:${BRANCH}${C_RESET}"
  fi
  say  "  ${C_DIM}git remote remove ${FORK_REMOTE_NAME}${C_RESET}"
  say  "  ${C_DIM}gh auth switch --user ${ORIGINAL_ACTIVE}${C_RESET}"
  exit 0
fi

if [[ ${YES} -ne 1 ]]; then
  warn ""
  warn "About to FORCE-PUSH '${BRANCH}' to ${FORK_OWNER}/${REPO_NAME}."
  warn "This rewrites the remote branch history. Anyone with a clone of the"
  warn "fork will need to reset --hard or re-clone."
  say  ""
  read -r -p "Proceed? [y/N] " reply
  case "${reply}" in
    [yY]|[yY][eE][sS]) ;;
    *) err "Aborted."; exit 1 ;;
  esac
fi

# --- cleanup trap (restore state even on error) ---------------------------
cleanup() {
  local exit_code=$?
  # Remove temporary remote if it exists.
  if git remote | grep -qx "${FORK_REMOTE_NAME}"; then
    git remote remove "${FORK_REMOTE_NAME}" 2>/dev/null || true
  fi
  # Restore the original active gh account.
  if [[ -n "${ORIGINAL_ACTIVE}" ]]; then
    local current
    current="$(gh api user --jq .login 2>/dev/null || true)"
    if [[ "${current}" != "${ORIGINAL_ACTIVE}" ]]; then
      gh auth switch --user "${ORIGINAL_ACTIVE}" >/dev/null 2>&1 || true
    fi
  fi
  exit "${exit_code}"
}
trap cleanup EXIT INT TERM

# --- execute --------------------------------------------------------------
info ""
info "→ switching gh auth to ${FORK_OWNER}"
gh auth switch --user "${FORK_OWNER}" >/dev/null

info "→ adding temporary remote ${FORK_REMOTE_NAME}"
# Defensive: if a previous run left it behind, remove first.
git remote remove "${FORK_REMOTE_NAME}" 2>/dev/null || true
git remote add "${FORK_REMOTE_NAME}" "${FORK_URL}"

info "→ pushing ${BRANCH} → ${FORK_OWNER}/${REPO_NAME}"
if [[ -n "${REMOTE_SHA}" ]]; then
  git push "${FORK_REMOTE_NAME}" "${BRANCH}:${BRANCH}" \
    --force-with-lease="${BRANCH}:${REMOTE_SHA}"
else
  git push "${FORK_REMOTE_NAME}" "${BRANCH}:${BRANCH}"
fi

# Verify the push landed.
NEW_REMOTE_SHA="$(git ls-remote "${FORK_URL}" "refs/heads/${BRANCH}" | awk '{print $1}')"
if [[ "${NEW_REMOTE_SHA}" != "${LOCAL_SHA}" ]]; then
  err "Push appeared to succeed but remote SHA does not match local."
  err "  expected: ${LOCAL_SHA}"
  err "  got     : ${NEW_REMOTE_SHA}"
  exit 1
fi

ok ""
ok "Synced ${FORK_OWNER}/${REPO_NAME}@${BRANCH} → ${LOCAL_SHA}"
say ""
say "${C_DIM}Tell anyone with a clone of the fork to run:${C_RESET}"
say "  ${C_BOLD}git fetch origin && git reset --hard origin/${BRANCH}${C_RESET}"
