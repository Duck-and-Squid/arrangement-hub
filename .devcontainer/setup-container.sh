#!/bin/bash

set -euo pipefail

# Install node_modules
npm ci

# Install hooks
cp .devcontainer/pre-commit.sh .git/hooks/pre-commit
cp .devcontainer/post-commit.sh .git/hooks/post-commit
chmod +x .git/hooks/pre-commit .git/hooks/post-commit
