#!/bin/bash

set -euo pipefail

# Install node_modules
npm ci

# Install hooks
cp scripts/pre-commit.sh .git/hooks/pre-commit
cp scripts/post-commit.sh .git/hooks/post-commit
chmod +x .git/hooks/pre-commit .git/hooks/post-commit

# Ensure all scripts are executable
chmod +x scripts/*
