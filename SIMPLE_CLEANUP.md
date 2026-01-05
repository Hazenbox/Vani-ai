# 🎯 Simple Cleanup: Keep Latest Commit, Clean the Rest

Since you want to keep the latest commit (script highlighting sync fix), here's the simplest approach:

## Option 1: Interactive Rebase (Recommended)

This keeps your latest commit and cleans up everything before it.

### Step 1: Start Interactive Rebase
```bash
git rebase -i HEAD~15
```

### Step 2: In the editor, organize like this:

**Keep the latest commit as-is:**
```
pick 76e2b8e Fix script highlighting sync: Improve timing accuracy and remove delay threshold
```

**Squash everything else into logical groups:**

```
pick bce36b9 Initial commit: Vani AI - Hinglish Podcast Generator

pick 90b442b refactor: move all app code into vani-ai-app folder
squash 8f7f6a5 fix: move vercel.json to vani-ai-app...
squash 9353547 fix: add installCommand to vercel.json...

pick 369fc31 feat: Pipeline parity - 90-second scripts with audio mastering
squash e14e8d9 feat: TTS prosody enhancements...

pick 8f11bfa Fix Vercel deployment: Add environment variable setup guide
squash 83f35f1 Fix 401 error: Add enhanced debugging...

pick f858a14 docs: comprehensive README improvements
squash d5e66e2 fix: improve README...
squash 11c1251 fix: restore normal table sizes...
squash c3e5d31 docs: rename 'What Makes It Special'...
squash 952126e docs: embed YouTube demo video...
squash fed2cdd docs: add Vercel live demo badge...
squash 2f64732 feat: add favicon and update banner...
squash 33b0f0f feat: add banner image to README...

pick 76e2b8e Fix script highlighting sync: Improve timing accuracy and remove delay threshold
```

### Step 3: When prompted, write clean messages:

**For structure:**
```
refactor: Organize project structure and deployment configuration
```

**For features:**
```
feat: Complete podcast generation pipeline with TTS and audio mastering
```

**For deployment:**
```
fix: Deployment configuration and API key authentication
```

**For docs:**
```
docs: Comprehensive project documentation and README
```

**Keep latest as-is:**
```
Fix script highlighting sync: Improve timing accuracy and remove delay threshold
```

## Option 2: Soft Reset (Faster but rewrites history)

⚠️ Only if you're okay rewriting history

```bash
# 1. Soft reset to initial commit (keeps all changes)
git reset --soft bce36b9

# 2. Commit in logical groups
git add .
git commit -m "feat: Complete Vani AI - Hinglish Podcast Generator

- Multi-speaker TTS with ElevenLabs
- Script generation with Gemini/Groq  
- Audio mastering and synchronization
- Project structure and deployment configuration
- Comprehensive documentation"

# 3. Add your latest fix as separate commit
# (The changes are already staged, so create a new commit)
git commit --allow-empty -m "fix: Improve script highlighting synchronization

- Remove delay threshold for immediate highlighting
- Improve timing calculation accuracy
- Better scaling for audio mastering duration differences"

# 4. Force push (only if it's your repo)
git push --force origin main
```

## Option 3: Create Clean Branch (Safest)

Keep main as-is, create a clean branch for submission:

```bash
# 1. Create clean branch from initial commit
git checkout -b hackathon-submission bce36b9

# 2. Add all current changes as one commit
git checkout main -- .
git add .
git commit -m "feat: Complete Vani AI - Hinglish Podcast Generator

- Multi-speaker TTS with ElevenLabs
- Script generation with Gemini/Groq
- Audio mastering and synchronization  
- Deployment configuration
- Script highlighting sync improvements
- Comprehensive documentation"

# 3. Push clean branch
git push origin hackathon-submission

# 4. Switch back to main
git checkout main
```

## Recommended: Option 3 (Clean Branch)

This is safest because:
- ✅ Keeps your original main branch intact
- ✅ Creates clean history for submission
- ✅ Easy to switch between branches
- ✅ No force push needed

## Final Result

You'll have a clean branch with:
1. Initial commit
2. One comprehensive commit with all features
3. (Optional) Latest fix as separate commit

Then you can submit the clean branch or make it your main branch later.

## Quick Command

```bash
# Create clean branch
git checkout -b hackathon-submission bce36b9
git checkout main -- .
git add .
git commit -m "feat: Complete Vani AI - Hinglish Podcast Generator

- Multi-speaker TTS with ElevenLabs
- Script generation with Gemini/Groq
- Audio mastering and synchronization
- Deployment configuration and fixes
- Script highlighting sync improvements
- Comprehensive documentation"

git push origin hackathon-submission
git checkout main
```

Would you like me to execute Option 3 for you?
