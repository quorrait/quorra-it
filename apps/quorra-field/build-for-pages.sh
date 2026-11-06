#!/bin/sh
# Builds the demo into ../../field (served at quorrait.com/field/). Run from this folder.
set -e
VITE_BASE=/field/ VITE_HASH_ROUTER=1 npx vite build --outDir ../../field --emptyOutDir
touch ../../field/.nojekyll
