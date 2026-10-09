#!/bin/bash
# Runs the headless (Node-only) test suite in parallel; logs to tests/out/
cd "$(dirname "$0")/.." && mkdir -p tests/out
node tests/scenario_noaction.mjs > tests/out/noaction.log 2>&1 & a=$!
node tests/scenario_action.mjs > tests/out/action.log 2>&1 & b=$!
node tests/soak.mjs ${1:-3} > tests/out/soak.log 2>&1 & c=$!
wait $a; ra=$?; wait $b; rb=$?; wait $c; rc=$?
for f in noaction action soak; do echo "== $f"; tail -n 4 tests/out/$f.log; done
echo "exit codes: noaction=$ra action=$rb soak=$rc"; exit $((ra|rb|rc))
