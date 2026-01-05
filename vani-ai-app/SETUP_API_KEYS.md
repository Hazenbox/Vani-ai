# 🔑 API Keys Setup Guide

To run Vani AI locally, you need to set up three API keys:

## Step 1: Create your `.env` file

```bash
cp .env.example .env
```

## Step 2: Get your API keys

### 1. **Gemini API Key** (Primary LLM - Required)
- Visit: https://aistudio.google.com/apikey
- Sign in with your Google account
- Click "Create API Key"
- Copy the key and paste it in your `.env` file

### 2. **Groq API Key** (Fallback LLM - Required)
- Visit: https://console.groq.com/keys
- Sign up for a free account
- Click "Create API Key"
- Copy the key and paste it in your `.env` file

### 3. **ElevenLabs API Key** (Text-to-Speech - Required)
- Visit: https://elevenlabs.io/app/settings/api-keys
- Sign up for a free account
- Copy your API key from the settings page
- Paste it in your `.env` file

## Step 3: Update your `.env` file

Your `.env` file should look like this:

```
VITE_GEMINI_API_KEY=AIzaSy...your_actual_key
VITE_GROQ_API_KEY=gsk_...your_actual_key
VITE_ELEVENLABS_API_KEY=sk_...your_actual_key
```

## Step 4: Restart the development server

After adding the keys, restart the Vite server:

```bash
npm run dev -- --host 127.0.0.1
```

## 💡 Tips

- All three services offer free tiers for testing
- Keep your `.env` file secret - it's already in `.gitignore`
- If you see errors, double-check that your keys are correctly copied (no extra spaces)

## 🆓 Free Tier Limits

- **Gemini**: 1500 requests/day (free)
- **Groq**: 14,400 requests/day (free)
- **ElevenLabs**: 10,000 characters/month (free tier)
