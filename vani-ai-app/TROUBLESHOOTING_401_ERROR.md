# 🔧 Troubleshooting 401 Unauthorized Error (ElevenLabs)

## Problem

You're seeing a `401 Unauthorized` error when trying to use ElevenLabs TTS in production (Vercel), even though the same API key works locally.

**Error Message:**
```
POST https://api.elevenlabs.io/v1/text-to-speech/... 401 (Unauthorized)
```

## Root Causes

The 401 error means the API key isn't being sent correctly to ElevenLabs. Common causes:

### 1. **Environment Variable Not Set in Vercel** (Most Common)

The `VITE_ELEVENLABS_API_KEY` environment variable is not configured in Vercel's dashboard.

**Solution:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project → **Settings** → **Environment Variables**
3. Add `VITE_ELEVENLABS_API_KEY` with your API key value
4. Enable for **Production**, **Preview**, and **Development**
5. **Redeploy** your application (critical!)

### 2. **Not Redeployed After Adding Variable**

Vite environment variables are injected at **build time**, not runtime. You must redeploy after adding/changing variables.

**Solution:**
1. Go to **Deployments** tab in Vercel
2. Click **⋯** (three dots) on latest deployment
3. Click **Redeploy**
4. Wait for deployment to complete

### 3. **Wrong Variable Name**

The variable name must be **exactly** `VITE_ELEVENLABS_API_KEY` (case-sensitive, with `VITE_` prefix).

**Common Mistakes:**
- ❌ `ELEVENLABS_API_KEY` (missing `VITE_` prefix)
- ❌ `VITE_ELEVEN_LABS_API_KEY` (wrong format)
- ❌ `elevenlabs_api_key` (wrong case)

**Solution:** Use exactly: `VITE_ELEVENLABS_API_KEY`

### 4. **API Key Format Issues**

The API key value might have:
- Extra spaces (leading/trailing)
- Quotes around the value
- Wrong value copied

**Solution:**
1. Copy the API key carefully from ElevenLabs dashboard
2. Paste directly into Vercel (no quotes, no spaces)
3. Verify it starts with `sk_` or `xi-`

### 5. **Wrong Environment Selected**

The variable might be set for the wrong environment (e.g., only Development, but you're viewing Production).

**Solution:**
1. In Vercel Environment Variables, check all three boxes:
   - ✅ Production
   - ✅ Preview  
   - ✅ Development

## Diagnostic Steps

### Step 1: Check Browser Console

Open your production site and check the browser console (F12). You should see diagnostic logs:

```
🔍 ElevenLabs API Key Check: {
  hasKey: true/false,
  keyLength: 0 or actual length,
  keyPrefix: "sk_..." or "N/A",
  ...
}
```

**If `hasKey: false`**: The environment variable isn't set or wasn't available at build time.

### Step 2: Use Diagnostic Function

In the browser console, run:

```javascript
// This function is exported from podcastService
diagnoseElevenLabsConfig()
```

This will show detailed diagnostics about your API key configuration.

### Step 3: Verify in Vercel Dashboard

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Verify `VITE_ELEVENLABS_API_KEY` exists
3. Verify it's enabled for **Production**
4. Check the value (first 8 and last 8 characters should match your actual key)

### Step 4: Check Build Logs

1. Go to **Deployments** → Latest deployment → **Build Logs**
2. Look for any warnings about environment variables
3. Verify the build completed successfully

## Step-by-Step Fix

### Complete Fix Process:

1. **Get Your API Key**
   - Go to https://elevenlabs.io/app/settings/api-keys
   - Copy your API key (should start with `sk_`)

2. **Set in Vercel**
   - Vercel Dashboard → Project → Settings → Environment Variables
   - Click **Add New**
   - Name: `VITE_ELEVENLABS_API_KEY`
   - Value: Paste your API key (no quotes, no spaces)
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **Save**

3. **Redeploy**
   - Go to **Deployments** tab
   - Click **⋯** on latest deployment
   - Click **Redeploy**
   - Wait for deployment to complete (~2-3 minutes)

4. **Test**
   - Open your production site
   - Try generating audio
   - Check browser console for errors
   - If still failing, run `diagnoseElevenLabsConfig()` in console

## Verification Checklist

- [ ] `VITE_ELEVENLABS_API_KEY` exists in Vercel Environment Variables
- [ ] Variable name is exactly `VITE_ELEVENLABS_API_KEY` (case-sensitive)
- [ ] Variable is enabled for **Production** environment
- [ ] API key value starts with `sk_` or `xi-`
- [ ] No extra spaces or quotes around the value
- [ ] Application was **redeployed** after adding/changing the variable
- [ ] Build logs show no environment variable errors
- [ ] Browser console shows `hasKey: true` in diagnostic logs

## Still Not Working?

If you've verified all the above and still getting 401:

1. **Double-check API key value:**
   - Copy from ElevenLabs dashboard again
   - Verify it works locally (test with `npm run dev`)
   - Make sure it's the exact same value in Vercel

2. **Try creating a new API key:**
   - Sometimes API keys can be revoked or have restrictions
   - Create a new key in ElevenLabs dashboard
   - Update it in Vercel and redeploy

3. **Check ElevenLabs account:**
   - Verify your ElevenLabs account is active
   - Check if you've hit rate limits
   - Verify the API key hasn't been revoked

4. **Contact Support:**
   - Check Vercel's [Environment Variables docs](https://vercel.com/docs/concepts/projects/environment-variables)
   - Check ElevenLabs [API documentation](https://elevenlabs.io/docs/api-reference/authentication)

## Quick Test

To quickly test if the API key is accessible:

1. Open your production site
2. Open browser console (F12)
3. Run: `console.log(import.meta.env.VITE_ELEVENLABS_API_KEY)`

**Expected:** Should show your API key (starts with `sk_` or `xi-`)
**If undefined:** Environment variable isn't set or wasn't available at build time
