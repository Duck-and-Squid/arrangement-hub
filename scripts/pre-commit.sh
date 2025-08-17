#!/bin/bash

set -euo pipefail

# Format the code
# see: https://prettier.io/docs/precommit#option-5-shell-script
FILES=$(git diff --cached --name-only --diff-filter=ACMR | sed 's| |\\ |g')
if [ -n "$FILES" ]; then
  echo "$FILES" | xargs ./node_modules/.bin/prettier --ignore-unknown --write
  echo "$FILES" | xargs git add
fi
