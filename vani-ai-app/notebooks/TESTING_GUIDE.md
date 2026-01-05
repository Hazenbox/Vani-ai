# 🧪 Notebook Testing Guide for Hackathon Submission

## Pre-Submission Testing Checklist

Before submitting to judges, verify that the notebook works end-to-end in a fresh Colab environment.

---

## 🔄 Cold Start Test (CRITICAL)

This test ensures judges can run your notebook without any prior setup.

### Steps:

1. **Open Fresh Colab Instance**
   - Go to https://colab.research.google.com/
   - File → Upload notebook → Select `vani_ai_pipeline.ipynb`
   - OR use: File → Open from GitHub → Enter your repo URL

2. **Run All Cells in Sequence**
   - Runtime → Run all
   - OR: Shift + Enter through each cell manually

3. **Expected Flow**
   ```
   Cell 1: Markdown header
   Cell 2: Package installation (takes 2-3 minutes)
   Cell 3: Requirements verification (should show ✅)
   Cell 4: Import libraries
   Cell 5: API key prompts
        - Enter Gemini API key
        - Enter ElevenLabs API key  
        - Groq key optional (press Enter to skip)
        - OpenAI key optional (press Enter to skip)
   Cell 6-31: Function definitions (should all show ✅)
   Cell 32: Quickstart example
        - Automatically generates podcast
        - Shows audio player when done
        - Duration: ~3-5 minutes total
   ```

4. **Verify Success Indicators**
   - ✅ "All required packages are installed!" in Cell 3
   - ✅ "API clients initialized!" in Cell 8
   - ✅ Each function definition cell shows "✅ ... defined!"
   - ✅ "🧹 Applying TTS cleanup to generated script..." in pipeline
   - ✅ "🎉 PIPELINE COMPLETE!" after Cell 32
   - ✅ Audio player appears with playback controls
   - ✅ Download button works

---

## 🎧 Audio Quality Verification

### Listen for These Issues (should be ABSENT):

❌ **Comma Artifacts** - Robotic micro-pauses
   - Example: "Yaar,, Anjali" should sound like "Yaar Anjali" (smooth)
   - If you hear stuttering, TTS cleanup didn't work

❌ **Ellipsis Overuse** - Long awkward pauses
   - Example: "2013 mein ... toh" should be "2013 mein toh" (no pause)
   - If you hear weird gaps, cleanup failed

❌ **Hindi Phrase Breaks** - Unnatural pauses in Hindi
   - Example: "Kya, baat hai?" should sound smooth, not choppy
   - If Hindi sounds broken, patterns weren't cleaned

### Expected Audio Quality:

✅ Natural conversation flow (no robotic pauses)
✅ Clean Hinglish transitions
✅ Proper pronunciation of Hindi words
✅ ~2 minute duration (1:45-2:00 range)
✅ Professional podcast quality

---

## 🔑 API Key Test

### Valid Keys Test:
1. Use your actual API keys
2. Verify script generates successfully
3. Verify audio synthesizes without errors

### Missing Key Test:
1. Skip Groq key (press Enter)
2. Should fall back to Gemini only (✓ expected)
3. Pipeline should still work

### Invalid Key Test:
1. Enter wrong Gemini key
2. Should show error: "❌ Gemini API Key is required!"
3. Cell should stop execution (✓ expected)

---

## 📊 Output Verification

### Check These Files Are Created:

1. **script.json** - Generated script in JSON format
   - Should contain 12-15 dialogue exchanges
   - Each line has "speaker" and "text" fields
   - No comma artifacts in text (verify manually)

2. **vani_podcast.mp3** (or custom filename)
   - File size: ~1-3 MB
   - Duration: ~2 minutes
   - Playable in audio player

### Verify Script Cleanup Applied:

Open `script.json` and search for these patterns (should NOT exist):
- `"Yaar,, Anjali"` ❌
- `"Kya, baat hai"` ❌  
- `"Wait, 2013 mein"` ❌
- `"... toh"` (structural ellipsis) ❌
- `"True, that."` ❌

If any appear, TTS cleanup function is not being called.

---

## ⚠️ Common Issues & Solutions

### Issue 1: Package Installation Fails
**Symptom:** Cell 2 shows errors, packages missing
**Solution:** 
```python
# Run this in a new cell:
!pip install --upgrade pip
!apt-get update
!apt-get install -y ffmpeg
# Then re-run Cell 2
```

### Issue 2: "clean_script_for_tts is not defined"
**Symptom:** Error when generating script
**Solution:** 
- Cell 18 (TTS cleanup function) didn't run
- Re-run cells 17-19 in order
- Verify Cell 18 shows: "✅ TTS cleanup function defined!"

### Issue 3: Audio Has Comma Artifacts
**Symptom:** Robotic pauses, stuttering in Hindi phrases
**Root Cause:** TTS cleanup not applied
**Check:** 
- Look for "🧹 Applying TTS cleanup..." in output
- If missing, `clean_script_for_tts()` call failed
- Verify Cell 18 ran successfully

### Issue 4: Wikipedia Content Not Found
**Symptom:** "Wikipedia article not found" error
**Solution:**
- Check URL is valid Wikipedia article
- Try different URL (use examples from Cell 35)
- Network might be temporarily unavailable

### Issue 5: ElevenLabs Rate Limit
**Symptom:** "Rate limit exceeded" error during audio generation
**Solution:**
- Wait 1 minute and re-run
- Use shorter script (fewer exchanges)
- Free tier has limits - upgrade if needed

---

## 📋 Final Submission Checklist

Before sharing with judges:

- [ ] Tested in fresh Colab instance (not your local copy)
- [ ] All cells run without errors from top to bottom
- [ ] Requirements check passes (Cell 3 shows ✅)
- [ ] API keys prompt works correctly
- [ ] Audio file generates successfully
- [ ] Audio sounds natural (no comma artifacts)
- [ ] Script cleanup is applied (check logs for "🧹")
- [ ] Quickstart cell (Cell 32) works independently
- [ ] Audio player appears with download option
- [ ] Prompting explanation present (Cell 33)
- [ ] Example URLs work (Cell 35)
- [ ] Total execution time < 5 minutes

---

## 🎯 Judge Experience Test

Simulate what judges will do:

1. **Open notebook in Colab** (2 minutes)
2. **Run Cell 2** (install packages) → Wait 2-3 min
3. **Run Cell 3** (verify packages) → Should show ✅
4. **Run Cells 4-8** (imports + API keys) → Enter keys
5. **Skip to Cell 32** (quickstart) → Run it
6. **Wait for completion** (~3-4 minutes)
7. **Listen to audio** → Should sound natural
8. **Download MP3** → Should work

**Total time: ~10 minutes** (acceptable for judges)

If anything fails in this flow, fix it before submission!

---

## ✅ Success Criteria

Your notebook is ready for submission when:

✅ **Runs start-to-finish** in fresh Colab without errors
✅ **API keys prompt** works correctly  
✅ **Audio generates** without issues
✅ **Audio sounds natural** (no TTS artifacts)
✅ **TTS cleanup applied** (visible in logs)
✅ **Documentation complete** (prompting explanation present)
✅ **Examples work** (Mumbai Indians URL tested)
✅ **Execution time** under 5 minutes

---

## 📝 Notes for Judges

Include this in your submission README:

```markdown
### Testing Instructions

1. Open `vani_ai_pipeline.ipynb` in Google Colab
2. Run Cell 2 to install dependencies (2-3 minutes)
3. Run Cell 3 to verify installation
4. Enter API keys when prompted (Cells 5-6):
   - Gemini API key (required)
   - ElevenLabs API key (required)
   - Groq/OpenAI keys (optional, press Enter to skip)
5. Run Cell 32 (Quickstart) to generate a test podcast
6. Listen to the generated audio in the player below
7. Total time: ~10 minutes

**Expected Output:** Natural-sounding 2-minute Hinglish podcast with no robotic artifacts.
```

---

## 🚨 Emergency Fixes

If judges report issues:

### Quick Fix 1: TTS Cleanup Not Working
```python
# Add this cell manually before Cell 32:
print("🔧 Manual cleanup verification...")
print(f"Function exists: {callable(clean_script_for_tts)}")
# Should print: Function exists: True
```

### Quick Fix 2: Packages Not Installing
```python
# Alternative installation (more robust):
!pip install -q --upgrade pip setuptools wheel
!pip install -q --no-cache-dir elevenlabs google-generativeai groq
!pip install -q --no-cache-dir requests beautifulsoup4 wikipedia-api pydub
!pip install -q --no-cache-dir pyloudnorm pedalboard
```

---

**Last Updated:** January 2026
**Status:** Ready for hackathon submission ✅
