# ⚡ Quick Clean Commits for Hackathon

## Simplest Approach: Interactive Rebase

### Step 1: Start Interactive Rebase
```bash
git rebase -i HEAD~15
```

### Step 2: In the editor, organize commits like this:

**Keep these as-is (good commits):**
```
pick bce36b9 Initial commit: Vani AI - Hinglish Podcast Generator
pick 90b442b refactor: move all app code into vani-ai-app folder
pick 369fc31 feat: Pipeline parity - 90-second scripts with audio mastering
pick 8f11bfa Fix Vercel deployment: Add environment variable setup guide
```

**Squash these into previous commits:**
```
squash 8f7f6a5 fix: move vercel.json to vani-ai-app...
squash 9353547 fix: add installCommand to vercel.json...
squash e14e8d9 feat: TTS prosody enhancements...
squash 83f35f1 Fix 401 error: Add enhanced debugging...
squash 76e2b8e Fix script highlighting sync...
squash f858a14 docs: comprehensive README improvements
squash d5e66e2 fix: improve README...
squash 11c1251 fix: restore normal table sizes...
squash c3e5d31 docs: rename 'What Makes It Special'...
squash 952126e docs: embed YouTube demo video...
squash fed2cdd docs: add Vercel live demo badge...
squash 2f64732 feat: add favicon and update banner...
squash 33b0f0f feat: add banner image to README...
```

### Step 3: When prompted, write clean commit messages:

**For structure commits:**
```
refactor: Organize project structure and deployment

- Move all app code into vani-ai-app folder
- Configure Vercel deployment settings
- Set up proper build configuration
```

**For feature commits:**
```
feat: Complete podcast generation pipeline

- Multi-speaker TTS with ElevenLabs
- Script generation with Gemini/Groq
- Audio mastering and synchronization
- TTS prosody enhancements
- Script highlighting sync improvements
```

**For deployment commits:**
```
fix: Deployment configuration and error handling

- Add Vercel environment variable setup guide
- Fix ElevenLabs API key authentication
- Improve error diagnostics and logging
```

**For documentation commits:**
```
docs: Comprehensive project documentation

- Complete README with demo videos
- Add setup and troubleshooting guides
- Improve documentation structure
```

### Step 4: Force push (if needed)
```bash
git push --force origin main
```

## Alternative: Just Update Commit Messages

If you don't want to squash, just improve messages:

```bash
git rebase -i HEAD~15
# Change 'pick' to 'reword' for commits you want to rename
```

## Final Result

You'll have ~4-6 clean commits:
1. Initial commit
2. Project structure
3. Core features
4. Deployment fixes
5. Documentation

## ⚠️ Before You Start

1. ✅ Backup created: `backup-before-cleanup` branch
2. ✅ Make sure everything is committed
3. ✅ Test your app works
4. ⚠️ Force push will rewrite history (only do if it's your repo)

## Need Help?

Run this to see what commits will be affected:
```bash
git log --oneline -15
```
