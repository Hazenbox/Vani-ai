#!/bin/bash

# Script to create clean commits for hackathon submission
# This creates a new branch without rewriting main branch history

set -e

echo "🧹 Creating clean commit history for hackathon submission..."
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Warning: You're not on main branch. Current branch: $CURRENT_BRANCH"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create backup if it doesn't exist
if ! git show-ref --verify --quiet refs/heads/backup-before-cleanup; then
    git branch backup-before-cleanup
    echo "✅ Created backup branch: backup-before-cleanup"
fi

# Create new clean branch from initial commit
CLEAN_BRANCH="hackathon-submission"
INITIAL_COMMIT="bce36b9"  # Initial commit

echo "📦 Creating clean branch: $CLEAN_BRANCH"
if git show-ref --verify --quiet refs/heads/$CLEAN_BRANCH; then
    echo "⚠️  Branch $CLEAN_BRANCH already exists. Deleting..."
    git branch -D $CLEAN_BRANCH
fi

git checkout -b $CLEAN_BRANCH $INITIAL_COMMIT
echo "✅ Created branch from initial commit"
echo ""

# Now we'll cherry-pick commits in logical groups
echo "📝 Organizing commits into logical groups..."
echo ""

# Group 1: Project Structure
echo "1️⃣  Project Structure..."
git cherry-pick 90b442b 2>/dev/null || echo "   (already included)"
git cherry-pick 8f7f6a5 2>/dev/null || echo "   (already included)"
git cherry-pick 9353547 2>/dev/null || echo "   (already included)"
git commit --amend -m "refactor: Organize project structure

- Move all app code into vani-ai-app folder
- Configure Vercel deployment settings
- Set up proper build configuration" 2>/dev/null || true
echo "   ✅ Project structure"

# Group 2: Core Features
echo ""
echo "2️⃣  Core Features..."
git cherry-pick 369fc31 2>/dev/null || echo "   (already included)"
git cherry-pick e14e8d9 2>/dev/null || echo "   (already included)"
git commit --amend -m "feat: Core podcast generation pipeline

- Multi-speaker TTS with ElevenLabs
- Script generation with Gemini/Groq
- Audio mastering and synchronization
- TTS prosody enhancements for natural speech" 2>/dev/null || true
echo "   ✅ Core features"

# Group 3: Deployment & Fixes
echo ""
echo "3️⃣  Deployment & Bug Fixes..."
git cherry-pick 8f11bfa 2>/dev/null || echo "   (already included)"
git cherry-pick 83f35f1 2>/dev/null || echo "   (already included)"
git cherry-pick 76e2b8e 2>/dev/null || echo "   (already included)"
git commit --amend -m "fix: Deployment configuration and bug fixes

- Add Vercel environment variable setup guide
- Fix ElevenLabs API key authentication issues
- Improve script highlighting synchronization
- Add comprehensive error handling and diagnostics" 2>/dev/null || true
echo "   ✅ Deployment & fixes"

# Group 4: Documentation
echo ""
echo "4️⃣  Documentation..."
git cherry-pick f858a14 2>/dev/null || echo "   (already included)"
git cherry-pick d5e66e2 2>/dev/null || echo "   (already included)"
git cherry-pick 11c1251 2>/dev/null || echo "   (already included)"
git cherry-pick c3e5d31 2>/dev/null || echo "   (already included)"
git cherry-pick 952126e 2>/dev/null || echo "   (already included)"
git cherry-pick fed2cdd 2>/dev/null || echo "   (already included)"
git cherry-pick 2f64732 2>/dev/null || echo "   (already included)"
git cherry-pick 33b0f0f 2>/dev/null || echo "   (already included)"
git commit --amend -m "docs: Comprehensive documentation and README

- Complete project documentation
- Add demo videos and badges
- Improve README layout and formatting
- Add setup guides and troubleshooting" 2>/dev/null || true
echo "   ✅ Documentation"

echo ""
echo "✅ Clean commit history created!"
echo ""
echo "📋 Next steps:"
echo "   1. Review the commits: git log --oneline"
echo "   2. Test the application: npm run dev"
echo "   3. Push the clean branch: git push origin hackathon-submission"
echo "   4. If satisfied, you can make this the main branch or submit this branch"
echo ""
echo "💡 To switch back to original: git checkout main"
echo "💡 To view backup: git checkout backup-before-cleanup"
