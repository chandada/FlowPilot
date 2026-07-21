#!/bin/bash
# GitHub Push Helper Script
# Usage: ./push.sh [repo] [branch] [token]
# Example: ./push.sh chandada/FlowPilot master

set -e

REPO="${1:-chandada/FlowPilot}"
BRANCH="${2:-master}"
TOKEN="${3:-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}"

# Validate token
if [ -z "$TOKEN" ]; then
    echo "Error: Token not provided"
    exit 1
fi

# Get current directory
REPO_DIR=$(pwd)

# Set remote URL with token
echo "Setting remote to $REPO..."
git remote set-url origin "https://$TOKEN@github.com/$REPO.git"

# Check if there are changes to commit
if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to commit."
    exit 0
fi

# Add all changes
git add -A

# Commit with message
COMMIT_MSG="${4:-feat: auto-push from github-push skill}"
git commit -m "$COMMIT_MSG" 2>/dev/null || true

# Push
echo "Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo "✅ Pushed to https://github.com/$REPO"
