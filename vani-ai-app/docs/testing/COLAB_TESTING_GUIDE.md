# 🧪 Quick Reference: Colab Testing

## 30-Second Checklist

### Before You Start
- [ ] Have API keys ready (Gemini, ElevenLabs, Groq)
- [ ] Open incognito window
- [ ] Go to https://colab.research.google.com

### Testing Steps (15 minutes total)
1. **Upload notebook** → File → Upload notebook
2. **Run all cells** → Runtime → Run all
3. **Enter API keys** when prompted (copy-paste ready)
4. **Wait 2-5 minutes** for generation
5. **Verify output**:
   - Audio plays
   - MP3 downloads
   - Sounds conversational

### After Testing
- [ ] Save to Drive → File → Save a copy in Drive
- [ ] Make public → Drive → Right-click → Share → Anyone with link
- [ ] Get Colab link → Open in Colab → Share button
- [ ] Update README with link

---

## Common Issues (Quick Fixes)

| Problem | Quick Fix |
|---------|-----------|
| **Module not found** | Re-run Cell 2, then Runtime → Restart |
| **Invalid API key** | Check for spaces, re-run Cell 6 |
| **Rate limit** | Wait 1 min, or use Groq fallback (automatic) |
| **No audio** | Check ElevenLabs quota, re-run Cell 27 |
| **Wikipedia not found** | Check URL format (en.wikipedia.org/wiki/...) |

---

## Expected Timeline

| Step | Time | What's Happening |
|------|------|------------------|
| **Cell 2** | 30-60s | Installing Python packages + ffmpeg |
| **Cell 4** | 5s | Importing libraries |
| **Cell 6** | Manual | You paste API keys (3 prompts) |
| **Cell 8** | 5s | Initializing API clients |
| **Cell 27** | 2-5m | **Full pipeline** (fetch → generate → synthesize → merge) |

**Total: ~4-7 minutes** from start to MP3 download

---

## What Success Looks Like

### Console Output (Cell 27)
```
============================================================
🎙️ VANI AI - HINGLISH PODCAST GENERATOR
============================================================
📌 Source: https://en.wikipedia.org/wiki/...
🤖 LLM Provider: gemini

✅ Fetched: [Article Title] (542 words)
✅ Generated: [Podcast Title] (12 exchanges)
✅ Generated 12 audio segments!
✅ Audio merged successfully!
   📁 Output: test_podcast.mp3
   ⏱️ Duration: 94.3 seconds

🎉 PIPELINE COMPLETE!
```

### Audio Player
- ▶️ Play button visible
- Waveform (if displayed)
- Download button below

### Downloaded File
- Filename: `test_podcast.mp3`
- Size: 1-3 MB
- Duration: 1.5-2.5 minutes
- Plays in any audio player

---

## API Key Checklist

### Gemini
- **Get it:** https://aistudio.google.com/app/apikey
- **Format:** `AIzaSy...` (39 characters)
- **Free tier:** 60 requests/minute

### ElevenLabs
- **Get it:** https://elevenlabs.io/ → Profile → API Key
- **Format:** Long alphanumeric string
- **Free tier:** 10,000 characters/month (~5-6 podcasts)

### Groq (Optional but Recommended)
- **Get it:** https://console.groq.com/keys
- **Format:** `gsk_...`
- **Free tier:** 14,400 requests/day
- **Why:** Automatic fallback if Gemini rate-limited

---

## Testing Variations

### Minimal Test (2-3 minutes)
Use a short Wikipedia article:
```python
WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/T20_cricket"
```

### Full Test (5-10 minutes)
Use a longer article (like Mumbai Indians):
```python
WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/Mumbai_Indians"
```

### Edge Case Test
Test fallback system (artificially trigger Gemini failure):
```python
# Comment out Gemini API key in Cell 6 (add # at start)
# GEMINI_API_KEY = ""
# Should automatically use Groq fallback
```

---

## Making It Public (After Testing)

### Step 1: Save to Drive
```
File → Save a copy in Drive
```

### Step 2: Share from Drive
```
Google Drive → Colab Notebooks → vani_ai_pipeline.ipynb
Right-click → Share → Anyone with the link (Viewer)
```

### Step 3: Get Colab Link
```
Open file in Colab → Share button (top-right)
Copy the Colab link (not the Drive link)
```

### Step 4: Update README
```markdown
[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](YOUR_LINK_HERE)
```

---

## Pre-Submission Verification

Run through this list 24 hours before deadline:

### Functional Tests
- [ ] Fresh incognito window test (clean state)
- [ ] All cells run without errors
- [ ] Audio plays in browser
- [ ] MP3 downloads automatically
- [ ] Audio sounds natural (not robotic)
- [ ] Duration is 1.5-2.5 minutes

### Link Tests
- [ ] Colab badge in README works
- [ ] Opens in new browser tab
- [ ] Anyone can view (not "request access")
- [ ] File loads in <5 seconds

### Quality Tests
- [ ] Two distinct voices audible
- [ ] Hinglish mix present ("yaar", "achcha", etc.)
- [ ] Conversational flow (not reading Wikipedia)
- [ ] Emotional reactions present
- [ ] No long awkward pauses

---

## Demo Video Script (Use This)

**Opening (10 seconds)**
> "Hi, I'm [name]. For the hackathon, I built Vani AI—a Python pipeline that turns Wikipedia articles into natural Hinglish podcasts. Let me show you."

**Demo (2 minutes)**
1. **Show Colab notebook** (10s)
   > "Here's the Colab notebook. I click 'Run all cells'..."

2. **Enter API keys** (15s)
   > "It prompts for API keys—Gemini for script generation, ElevenLabs for text-to-speech. I paste them..."

3. **Show generation** (30s)
   > "Now it fetches the Wikipedia article... generates a Hinglish script using emotional beat rules... and synthesizes audio. This takes about 2 minutes."
   
   [Fast-forward to completion]

4. **Play sample** (30s)
   > "Here's the result—notice the natural conversation, genuine curiosity in the opening, emotional reactions after surprising facts. It's not robotic."

5. **Show download** (10s)
   > "The MP3 downloads automatically. The whole process is one-click reproducible."

6. **Technical highlight** (25s)
   > "Key features: automatic fallback from Gemini to Groq if rate-limited, professional audio mastering with LUFS normalization, and dynamic voice settings based on emotional content. Plus 74 unit tests for reliability."

**Closing (10s)**
> "All code is on GitHub with complete documentation. Thanks for watching!"

---

## Emergency Contacts (If Stuck)

### Colab Issues
- **Docs:** https://colab.research.google.com/notebooks/intro.ipynb
- **Forum:** https://stackoverflow.com/questions/tagged/google-colaboratory

### API Issues
- **Gemini:** https://ai.google.dev/docs
- **ElevenLabs:** https://help.elevenlabs.io/
- **Groq:** https://console.groq.com/docs

### Audio Issues
- If MP3 won't play: Try different browser (Chrome works best)
- If audio corrupted: Clear Colab outputs, re-run Cell 27
- If no voices: Check ElevenLabs voice IDs in Cell 17

---

## Final Checklist (Deadline Day)

Morning of January 5th:

- [ ] **6:00 AM:** Fresh Colab test (incognito)
- [ ] **7:00 AM:** Verify all links work
- [ ] **8:00 AM:** Final README check
- [ ] **9:00 AM:** Submit via platform
- [ ] **Backup:** Download notebook locally (just in case)

**You've got this! 🚀**
