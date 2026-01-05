#!/bin/bash

# Clean up commits while keeping the latest one
# This creates a clean history for hackathon submission

set -e

echo "🧹 Cleaning commits for hackathon submission..."
echo ""

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Find the initial commit
INITIAL_COMMIT=$(git log --reverse --oneline | head -1 | cut -d' ' -f1)
echo "Initial commit: $INITIAL_COMMIT"
echo ""

# Create a clean branch name
CLEAN_BRANCH="main-clean"

# Check if clean branch exists
if git show-ref --verify --quiet refs/heads/$CLEAN_BRANCH; then
    echo "⚠️  Clean branch exists. Deleting..."
    git branch -D $CLEAN_BRANCH
fi

echo "📦 Creating clean branch from initial commit..."
git checkout -b $CLEAN_BRANCH $INITIAL_COMMIT

echo ""
echo "✅ Clean branch created!"
echo ""
echo "Now you can:"
echo "1. Use interactive rebase to organize commits"
echo "2. Or manually cherry-pick important commits"
echo ""
echo "The latest commit (script highlighting sync) will be kept."
echo ""
echo "To start interactive rebase:"
echo "  git rebase -i HEAD~15"
echo ""
echo "Or switch back to main:"
echo "  git checkout main"
