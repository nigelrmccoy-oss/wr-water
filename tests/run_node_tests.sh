#!/bin/bash
# Runs the headless (Node-only) test suite in parallel; logs to tests/out/
cd "$(dirname "$0")/.." && mkdir -p tests/out
node tests/scenario_noaction.mjs > tests/out/noaction.log 2>&1 & a=$!
node tests/scenario_action.mjs > tests/out/action.log 2>&1 & b=$!
node tests/soak.mjs ${1:-3} > tests/out/soak.log 2>&1 & c=$!
node tests/mass_balance.mjs > tests/out/balance.log 2>&1 & d=$!
node tests/scenario_exploits.mjs > tests/out/exploits.log 2>&1 & e=$!
node tests/save_resume.mjs > tests/out/save.log 2>&1 & f=$!
node tests/gen_warning.mjs > tests/out/genwarn.log 2>&1 & g=$!
node tests/mapcache.mjs > tests/out/mapcache.log 2>&1 & h=$!
wait $a; ra=$?; wait $b; rb=$?; wait $c; rc=$?; wait $d; rd=$?; wait $e; re=$?; wait $f; rf=$?; wait $g; rg=$?; wait $h; rh=$?
for f in noaction action soak balance exploits save genwarn mapcache; do echo "== $f"; tail -n 4 tests/out/$f.log; done
echo "exit codes: noaction=$ra action=$rb soak=$rc balance=$rd exploits=$re save=$rf genwarn=$rg mapcache=$rh"; exit $((ra|rb|rc|rd|re|rf|rg|rh))
