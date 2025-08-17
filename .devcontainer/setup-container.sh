#!/bin/bash

set -euo pipefail

# Install node_modules
npm ci

# Install hooks
cp scripts/pre-commit.sh .git/hooks/pre-commit
cp scripts/post-commit.sh .git/hooks/post-commit
chmod u+x .git/hooks/*
