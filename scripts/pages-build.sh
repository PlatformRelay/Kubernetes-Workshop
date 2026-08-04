#!/usr/bin/env bash
# Build the GitHub Pages tree locally: MkDocs landing + Slidev decks under /deck/.
# Mirrors .github/workflows/pages.yml (BASE defaults to /Kubernetes-Workshop).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE="${PAGES_BASE:-/Kubernetes-Workshop}"
SITE="${PAGES_SITE_DIR:-site}"

if ! command -v mkdocs >/dev/null 2>&1; then
  echo "mkdocs not found. Install with: python3 -m pip install -r docs/requirements-docs.txt" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Enable with: corepack enable && corepack prepare pnpm@11.9.0 --activate" >&2
  exit 1
fi

rm -rf "$SITE"
mkdocs build --strict

build_deck() {
  local entry="$1"
  local rel="$2" # path under site/, e.g. deck/3day
  local out="${SITE}/${rel}"
  local base="${BASE}/${rel}/"
  echo "==> slidev build ${entry} → ${out} (base ${base}, hash router)"
  pnpm exec slidev build "$entry" --base "$base" --out "$out" --router-mode hash
}

build_deck slides.md "deck"
build_deck slides-3day.md "deck/3day"
build_deck slides-day-1.md "deck/day-1"
build_deck slides-day-2.md "deck/day-2"
build_deck slides-day-3.md "deck/day-3"
build_deck slides-templates.md "deck/templates"

# Legacy path redirects (pre-MkDocs Slidev roots).
mkdir -p "${SITE}/3day" "${SITE}/templates"
cat >"${SITE}/3day/index.html" <<'EOF'
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Redirecting…</title>
<meta http-equiv="refresh" content="0; url=../deck/3day/">
<script>
  location.replace("../deck/3day/" + location.search + location.hash);
</script>
<p><a href="../deck/3day/">Continue to the 3-day deck</a></p>
</html>
EOF
cat >"${SITE}/templates/index.html" <<'EOF'
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Redirecting…</title>
<meta http-equiv="refresh" content="0; url=../deck/templates/">
<script>
  location.replace("../deck/templates/" + location.search + location.hash);
</script>
<p><a href="../deck/templates/">Continue to the template gallery</a></p>
</html>
EOF

echo "Pages tree ready at ${SITE}/ (pnpm pages:preview serves it)"
