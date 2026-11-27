#!/bin/sh
# Runs every spike script in order. Needs network and a live channel (default: rubius). ~4 min.
cd "$(dirname "$0")" || exit 1
for f in q1 q2 q2b q3 q5 q5b q6 q6b q7; do echo "=== $f"; ( time bun $f.ts ) 2>&1 | grep -vE "GraphQL|^console: Error"; done
