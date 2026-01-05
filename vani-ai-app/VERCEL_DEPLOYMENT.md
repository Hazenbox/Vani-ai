# 🚀 Vercel Deployment Guide

## Setting Up Environment Variables in Vercel

For your Vite app to work on Vercel, you need to configure environment variables in Vercel's dashboard. The ElevenLabs API key (and other API keys) must be set there.

### Step 1: Access Vercel Project Settings

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Click on **Settings** → **Environment Variables**

### Step 2: Add Environment Variables

Add these three environment variables with **exact** names:

| Variable Name | Description |
|---------------|-------------|
| `VITE_GEMINI_API_KEY` | Your Google Gemini API key |
| `VITE_GROQ_API_KEY` | Your Groq API key |
| `VITE_ELEVENLABS_API_KEY` | Your ElevenLabs API key |

**Important Notes:**
- ✅ Variable names must match **exactly** (case-sensitive)
- ✅ All three variables should be set for **Production**, **Preview**, and **Development** environments
- ✅ After adding variables, you **must redeploy** for changes to take effect

### Step 3: Set Environment Variables

For each variable:

1. Click **Add New**
2. Enter the variable name (e.g., `VITE_ELEVENLABS_API_KEY`)
3. Enter the variable value (your actual API key)
4. Select environments: **Production**, **Preview**, **Development**
5. Click **Save**

### Step 4: Redeploy Your Application

After adding environment variables:

1. Go to **Deployments** tab
2. Click the **⋯** (three dots) on the latest deployment
3. Click **Redeploy**
4. Or push a new commit to trigger automatic deployment

### Step 5: Verify Environment Variables

After redeployment, check the build logs:

1. Go to **Deployments** → Select your deployment
2. Click **Build Logs**
3. Look for any errors related to missing environment variables

## Troubleshooting

### Issue: API Key Not Working in Vercel

**Common Causes:**

1. **Variable name mismatch**
   - ❌ Wrong: `ELEVENLABS_API_KEY` (missing `VITE_` prefix)
   - ✅ Correct: `VITE_ELEVENLABS_API_KEY`

2. **Not redeployed after adding variables**
   - Environment variables are injected at **build time**
   - You must redeploy after adding/changing variables

3. **Wrong environment selected**
   - Make sure variables are set for **Production** environment
   - Check if you're viewing the production deployment

4. **Extra spaces or characters**
   - Copy the API key carefully
   - Don't include quotes around the value
   - No trailing spaces

### Verification Steps

1. **Check Vercel Dashboard:**
   - Settings → Environment Variables
   - Verify all three variables exist
   - Verify they're enabled for Production

2. **Check Build Logs:**
   - Deployments → Latest deployment → Build Logs
   - Look for any environment variable warnings

3. **Test in Browser:**
   - Open browser console (F12)
   - Check for API key errors
   - The app should show an error if the key is missing

## Security Note

⚠️ **Important:** Variables prefixed with `VITE_` are exposed to the client-side bundle. This means:
- They are visible in the browser's JavaScript bundle
- Anyone can inspect them using browser dev tools
- Consider using serverless functions for sensitive API keys in production

For better security, consider:
- Moving API calls to Vercel serverless functions
- Using server-side API routes to proxy requests
- Implementing rate limiting and authentication

## Quick Checklist

- [ ] All three environment variables added in Vercel
- [ ] Variable names match exactly (with `VITE_` prefix)
- [ ] Variables enabled for Production environment
- [ ] Application redeployed after adding variables
- [ ] Build logs show no environment variable errors
- [ ] Application works correctly in production

## Need Help?

If the issue persists:
1. Check Vercel's [Environment Variables documentation](https://vercel.com/docs/concepts/projects/environment-variables)
2. Verify your API keys work locally (test with `npm run dev`)
3. Check Vercel build logs for specific error messages
