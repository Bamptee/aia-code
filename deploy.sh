#!/usr/bin/env bash
# deploy.sh — bump version, push, and publish to npm with public access.
#
# Usage:
#   ./deploy.sh                # patch bump (2.3.2 -> 2.3.3)
#   ./deploy.sh patch          # idem
#   ./deploy.sh minor          # 2.3.2 -> 2.4.0
#   ./deploy.sh major          # 2.3.2 -> 3.0.0
#   ./deploy.sh 2.5.0          # explicit version
#   ./deploy.sh --dry-run      # bump + publish dry-run, no git push
#
# Flags:
#   --dry-run        Skip git push and run `npm publish --dry-run`
#   --skip-tests     Don't run `npm test` before publish
#   --no-git-check   Don't refuse on dirty working tree / non-main branch
#   -h, --help       Show this help

set -euo pipefail

# ---- colors ----
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLU=$'\033[34m'; DIM=$'\033[2m'; RST=$'\033[0m'
info()  { printf '%s▸%s %s\n' "$BLU" "$RST" "$*"; }
ok()    { printf '%s✓%s %s\n' "$GRN" "$RST" "$*"; }
warn()  { printf '%s!%s %s\n' "$YLW" "$RST" "$*"; }
fail()  { printf '%s✗%s %s\n' "$RED" "$RST" "$*" >&2; exit 1; }

# ---- args ----
BUMP="patch"
DRY_RUN=false
SKIP_TESTS=false
NO_GIT_CHECK=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      awk 'NR==1{next} /^[^#]/{exit} {sub(/^# ?/,""); print}' "$0"
      exit 0
      ;;
    --dry-run)     DRY_RUN=true; shift ;;
    --skip-tests)  SKIP_TESTS=true; shift ;;
    --no-git-check) NO_GIT_CHECK=true; shift ;;
    patch|minor|major) BUMP="$1"; shift ;;
    [0-9]*.[0-9]*.[0-9]*) BUMP="$1"; shift ;;
    *) fail "Unknown argument: $1 (use -h for usage)" ;;
  esac
done

# ---- pre-flight ----
cd "$(dirname "$0")"

[[ -f package.json ]] || fail "package.json not found in $(pwd)"
command -v npm >/dev/null || fail "npm not found in PATH"
command -v git >/dev/null || fail "git not found in PATH"

CURRENT=$(node -p "require('./package.json').version")
PKG_NAME=$(node -p "require('./package.json').name")
info "Package : ${PKG_NAME}"
info "Current : v${CURRENT}"
info "Bump    : ${BUMP}"

if ! $NO_GIT_CHECK; then
  if [[ -n "$(git status --porcelain)" ]]; then
    fail "Working tree is dirty. Commit or stash first (or use --no-git-check)."
  fi
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$BRANCH" != "main" ]]; then
    warn "You are on branch '$BRANCH', not 'main'."
    read -r -p "Continue anyway? [y/N] " ans
    [[ "$ans" =~ ^[yY]$ ]] || fail "Aborted."
  fi
fi

# ---- tests ----
if ! $SKIP_TESTS; then
  info "Running tests..."
  if ! npm test --silent; then
    fail "Tests failed. Fix them or pass --skip-tests."
  fi
  ok "Tests passed"
fi

# ---- bump ----
# `npm version` writes package.json + creates a commit + tag (vX.Y.Z).
# Pass --force when --no-git-check is set so a dirty tree doesn't block us.
info "Bumping version..."
NPM_VERSION_FLAGS=(-m "v%s")
$NO_GIT_CHECK && NPM_VERSION_FLAGS+=(--force)
NEW_VERSION=$(npm version "$BUMP" "${NPM_VERSION_FLAGS[@]}")
NEW_VERSION="${NEW_VERSION#v}"  # strip leading v if present
ok "Bumped to v${NEW_VERSION}"

# ---- push ----
if $DRY_RUN; then
  warn "Dry-run: skipping git push"
else
  info "Pushing commit + tags to origin..."
  git push --follow-tags
  ok "Pushed"
fi

# ---- publish ----
if $DRY_RUN; then
  info "npm publish --dry-run --access public"
  npm publish --dry-run --access public
  ok "Dry-run publish complete"
else
  info "Publishing to npm (public)..."
  npm publish --access public
  ok "Published ${PKG_NAME}@${NEW_VERSION}"
fi

printf '\n%s🚀 Done.%s %s%s%s\n' "$GRN" "$RST" "$DIM" "${PKG_NAME}@${NEW_VERSION}" "$RST"
