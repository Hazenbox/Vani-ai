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

---

## 🚀 Deploying to Vercel

When deploying to Vercel, you need to set environment variables in Vercel's dashboard:

### Quick Steps:

1. **Go to Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

2. **Add these three variables:**
   - `VITE_GEMINI_API_KEY` = your Gemini API key
   - `VITE_GROQ_API_KEY` = your Groq API key
   - `VITE_ELEVENLABS_API_KEY` = your ElevenLabs API key

3. **Important:**
   - ✅ Variable names must match **exactly** (case-sensitive, including `VITE_` prefix)
   - ✅ Enable for **Production**, **Preview**, and **Development** environments
   - ✅ **Redeploy** your application after adding variables (they're injected at build time)

4. **After adding variables:**
   - Go to **Deployments** tab
   - Click **⋯** (three dots) on latest deployment
   - Click **Redeploy**

### Troubleshooting Vercel Deployment

**If API keys don't work in Vercel:**

- ❌ **Wrong variable name**: Make sure it's `VITE_ELEVENLABS_API_KEY` (not `ELEVENLABS_API_KEY`)
- ❌ **Not redeployed**: Environment variables are injected at build time - you must redeploy
- ❌ **Wrong environment**: Make sure variables are enabled for **Production** environment
- ❌ **Extra spaces**: Copy API keys carefully, no quotes or trailing spaces

For detailed Vercel deployment instructions, see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)
