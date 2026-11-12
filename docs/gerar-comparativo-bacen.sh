#!/usr/bin/env bash
# Gera docs/comparativo-bacen.pdf a partir de docs/comparativo-bacen.md.
# Requisitos: pandoc e xelatex (Ubuntu: apt-get install pandoc texlive-xetex texlive-latex-extra texlive-lang-portuguese lmodern fonts-dejavu).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/comparativo-bacen.md"
OUT="$DIR/comparativo-bacen.pdf"

for bin in pandoc xelatex; do
  command -v "$bin" >/dev/null || { echo "Erro: '$bin' não encontrado no PATH." >&2; exit 1; }
done

pandoc "$SRC" \
  --from markdown \
  --pdf-engine=xelatex \
  --toc \
  -V geometry:margin=2cm \
  -V mainfont="DejaVu Sans" \
  -V monofont="DejaVu Sans Mono" \
  -V fontsize=10pt \
  -V colorlinks=true \
  -V linkcolor=blue \
  -V urlcolor=blue \
  -V toc-title="Sumário" \
  -o "$OUT"

echo "PDF gerado em: $OUT"
