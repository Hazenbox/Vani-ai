
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ElevenLabsClient } from "elevenlabs";
import { ConversationData, ScriptPart, AudioResult, SegmentTiming } from "../types";

// ============================================
// LLM CONFIGURATION
// Primary: Gemini 2.0 Flash (best variety, natural conversations)
// Fallback: Groq/LLaMA 3.3 70B (faster, more requests/day)
// ============================================

// Primary: Gemini 2.5 Flash (best for script generation)
const _geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(_geminiApiKey);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Fallback: Groq (LLaMA 3.3 70B) - used if Gemini fails
// Lazy initialization to prevent errors on app load when API key is missing
let groq: Groq | null = null;
const getGroqClient = () => {
  if (!groq && import.meta.env.VITE_GROQ_API_KEY) {
    groq = new Groq({
      apiKey: import.meta.env.VITE_GROQ_API_KEY,
      dangerouslyAllowBrowser: true
    });
  }
  return groq;
};

// ElevenLabs for TTS
// Lazy initialization to prevent errors on app load when API key is missing
let elevenlabs: ElevenLabsClient | null = null;
const getElevenLabsClient = () => {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
  
  // Debug logging for production troubleshooting
  if (import.meta.env.PROD) {
    console.log('🔍 ElevenLabs API Key Check:', {
      hasKey: !!apiKey,
      keyLength: apiKey?.length || 0,
      keyPrefix: apiKey?.substring(0, 5) || 'N/A',
      keySuffix: apiKey ? '...' + apiKey.substring(apiKey.length - 5) : 'N/A',
      envMode: import.meta.env.MODE,
      isProd: import.meta.env.PROD
    });
  }
  
  if (!elevenlabs && apiKey) {
    // Validate API key format (ElevenLabs keys start with specific prefixes)
    if (!apiKey.startsWith('sk_') && !apiKey.startsWith('xi-')) {
      console.warn('⚠️ ElevenLabs API key format may be incorrect. Expected format: sk_... or xi-...');
    }
    
    elevenlabs = new ElevenLabsClient({
      apiKey: apiKey.trim() // Trim whitespace in case of copy-paste issues
    });
  }
  return elevenlabs;
};

// Helper function to check if ElevenLabs API key is configured
const isElevenLabsConfigured = () => {
  return !!import.meta.env.VITE_ELEVENLABS_API_KEY;
};

// Diagnostic function for debugging API key issues (can be called from browser console)
export const diagnoseElevenLabsConfig = () => {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
  const diagnostics = {
    hasKey: !!apiKey,
    keyLength: apiKey?.length || 0,
    keyPrefix: apiKey?.substring(0, 8) || 'N/A',
    keySuffix: apiKey ? '...' + apiKey.substring(Math.max(0, apiKey.length - 8)) : 'N/A',
    isValidFormat: apiKey ? (apiKey.startsWith('sk_') || apiKey.startsWith('xi-')) : false,
    isProduction: import.meta.env.PROD,
    envMode: import.meta.env.MODE,
    clientInitialized: !!elevenlabs,
    recommendation: !apiKey 
      ? 'Set VITE_ELEVENLABS_API_KEY in Vercel (Settings → Environment Variables) and redeploy'
      : !apiKey.startsWith('sk_') && !apiKey.startsWith('xi-')
      ? 'API key format may be incorrect. Expected format: sk_... or xi-...'
      : import.meta.env.PROD && !elevenlabs
      ? 'API key is set but client not initialized. Check if key is accessible at runtime.'
      : 'Configuration looks correct. If still getting 401, verify the API key value is correct.'
  };
  console.log('🔍 ElevenLabs Configuration Diagnostics:', diagnostics);
  return diagnostics;
};

// ============================================
// VOICE CONFIGURATION - Indian-accented voices
// ============================================
const VOICE_IDS = {
  Rahul: "mCQMfsqGDT6IDkEKR20a",  // Indian male voice
  Anjali: "2zRM7PkgwBPiau2jvVXc"   // Indian female voice
};

// ============================================
// AUDIO ANALYSIS-BASED VOICE SETTINGS
// Settings extracted from reference audio analysis
// ============================================
interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

interface AudioAnalysisConfig {
  recommended_elevenlabs_settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
    output_format: string;
    model_id: string;
    pause_duration_seconds: number;
  };
  voice_characteristics?: {
    average_pitch_hz?: number;
    pitch_variation_coefficient?: number;
    speech_rate_wpm?: number;
    expressiveness_score?: number;
  };
  timing_analysis?: {
    average_pause_duration_seconds?: number;
  };
}

// ============================================
// PODCAST MODE: Fixed Voice Settings (Zero Variation)
// ============================================
// These settings are designed for professional podcast quality with consistent
// voice personality across the entire conversation. No dynamic adjustments are
// applied - each speaker maintains their fixed baseline throughout.
//
// Rationale: Trade micro-variation for consistency and identity stability.
// Professional podcasts use fixed voice profiles, not per-turn adjustments.
// ============================================

// Rahul - Host/Explainer: Calm authority, controlled expressiveness
const RAHUL_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.22,           // Calm authority without overacting
  similarity_boost: 0.75,    // Strong voice identity (never change)
  style: 0.62,               // Controlled expressiveness for factual content
  use_speaker_boost: true
};

// Anjali - Co-host/Listener: Natural reactions, curious energy
const ANJALI_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.30,           // Slightly more stable for natural reactions
  similarity_boost: 0.75,    // Strong voice identity (never change)
  style: 0.55,               // Less theatrical, better listening cues
  use_speaker_boost: true
};

// Legacy default (unused in podcast mode, kept for compatibility)
const DEFAULT_VOICE_SETTINGS: VoiceSettings = RAHUL_VOICE_SETTINGS;

// Natural pause duration for human-like conversation flow
// Context-dependent: balanced pacing that doesn't sound rushed
const DEFAULT_PAUSE_DURATION = 0.30; // seconds between segments (natural podcast pacing)

// Load audio analysis config (if available)
// This can be populated by running: python scripts/analyze_audio.py <audio_file>
let audioAnalysisConfig: AudioAnalysisConfig | null = null;

/**
 * Load audio analysis configuration from a JSON file or object.
 * Call this function with analysis results to apply extracted settings.
 */
export function loadAudioAnalysisConfig(config: AudioAnalysisConfig | null): void {
  audioAnalysisConfig = config;
  if (config) {
    console.log('✅ Audio analysis config loaded:', config.recommended_elevenlabs_settings);
  }
}

/**
 * Get voice settings for podcast mode - FIXED BASELINES ONLY.
 * 
 * PODCAST MODE DISCIPLINE:
 * - NO variation based on position, content, or emotion
 * - NO dynamic adjustments per turn
 * - Each speaker maintains consistent personality throughout
 * 
 * Why? Professional podcasts prioritize identity consistency over micro-variation.
 * Varying parameters per turn causes personality drift and listener fatigue.
 * 
 * @param speaker - 'Rahul' or 'Anjali'
 * @param text - Dialogue text (unused in podcast mode, kept for compatibility)
 * @param sentenceIndex - Position in script (unused in podcast mode)
 * @param totalSentences - Total script length (unused in podcast mode)
 * @returns Fixed voice settings for the speaker
 */
function getVoiceSettings(
  speaker: 'Rahul' | 'Anjali', 
  text: string,
  sentenceIndex?: number,
  totalSentences?: number
): VoiceSettings {
  // PODCAST MODE: Return fixed settings per speaker
  // No analysis override, no dynamic variation, no emotional adjustments
  
  if (speaker === 'Anjali') {
    return { ...ANJALI_VOICE_SETTINGS };
  } else {
    return { ...RAHUL_VOICE_SETTINGS };
  }
  
  // Note: text, sentenceIndex, and totalSentences parameters are ignored
  // in podcast mode to ensure zero variation and consistent voice identity
}

/**
 * Get pause duration between segments based on analysis or default.
 * Context-dependent with natural variation (jitter) for human-like rhythm.
 * Industry podcasts use variable pauses: 80-150ms (quick), 200-300ms (normal), 400-600ms (dramatic).
 */
function getPauseDuration(
  previousSpeaker?: 'Rahul' | 'Anjali', 
  currentSpeaker?: 'Rahul' | 'Anjali',
  sentenceIndex?: number,
  totalSentences?: number,
  previousText?: string,
  currentText?: string
): number {
  // Check for incomplete handoff pattern (em-dash at end of previous, em-dash at start of current)
  // These should have VERY short pauses (<100ms) to simulate interruption/overlap
  const isHandoff = previousText?.trim().endsWith('—') && currentText?.trim().startsWith('—');
  
  if (isHandoff) {
    // Handoff/interruption: minimal pause for natural overlap feeling
    const handoffPause = 0.08 + (Math.random() * 0.03); // 80-110ms
    return handoffPause;
  }
  
  let basePause: number;
  
  // Determine base pause based on context
  if (previousSpeaker && currentSpeaker && previousSpeaker !== currentSpeaker) {
    // Speaker exchange: slightly shorter but still natural
    basePause = 0.25; // 250ms
  } else {
    // Same speaker or initial pause: use default
    basePause = audioAnalysisConfig?.recommended_elevenlabs_settings?.pause_duration_seconds 
      ?? audioAnalysisConfig?.timing_analysis?.average_pause_duration_seconds 
      ?? DEFAULT_PAUSE_DURATION;
  }
  
  // Add context-aware modulation
  if (sentenceIndex !== undefined && totalSentences !== undefined) {
    const position = sentenceIndex / totalSentences;
    
    // Opening exchanges (first 20%): Quicker, more energetic
    if (position < 0.2) {
      basePause *= 0.85; // 15% shorter (e.g., 250ms → 212ms)
    }
    // Peak moment (middle 40-60%): Slightly longer for impact
    else if (position >= 0.4 && position <= 0.6) {
      basePause *= 1.15; // 15% longer (e.g., 250ms → 287ms)
    }
    // Closing (last 20%): Moderate, reflective
    else if (position > 0.8) {
      basePause *= 1.05; // 5% longer
    }
  }
  
  // Add natural jitter (±50ms variation) for human-like unpredictability
  // This prevents the "evenly spaced" synthetic feeling
  const jitter = (Math.random() - 0.5) * 0.1; // ±50ms
  const finalPause = basePause + jitter;
  
  // Ensure pause stays within reasonable bounds (80ms min, 600ms max)
  return Math.max(0.08, Math.min(0.60, finalPause));
}

/**
 * Get output format based on analysis or default.
 * Using 192kbps for professional podcast quality (industry standard for Spotify/Apple Podcasts).
 */
function getOutputFormat(): string {
  return audioAnalysisConfig?.recommended_elevenlabs_settings?.output_format 
    ?? "mp3_44100_192";
}

// const PERSONA_VOICE_SETTINGS: Record<PersonaType, VoiceSettings> = {
//   // Anchor / Explainer Persona (Anjali's default)
//   // Calm - Trustworthy - Less theatrical - Reduced energy
//   anchor: {
//     stability: 0.55,
//     similarity_boost: 0.80,
//     style: 0.30,
//     use_speaker_boost: true
//   },
//   // Curious / Interrupter Persona (Rahul's default)
//   // More reactive - Natural interruptions - Lively Hinglish tone
//   curious: {
//     stability: 0.30,
//     similarity_boost: 0.70,
//     style: 0.60,
//     use_speaker_boost: true
//   },
//   // Emotional / Reaction Moments
//   // Surprise - Disbelief - Laughter (produces natural vocal expressions)
//   emotional: {
//     stability: 0.28,
//     similarity_boost: 0.65,
//     style: 0.65,
//     use_speaker_boost: true
//   }
// };

// // Emotional markers that trigger the "emotional" voice settings
// const EMOTIONAL_MARKERS = [
//   /\(laughs?\)/i,
//   /\(giggles?\)/i,
//   /\(chuckles?\)/i,
//   /\(surprised?\)/i,
//   /\(excited\)/i,
//   /\(disbelief\)/i
// ];

// /**
//  * Determines the appropriate voice settings based on speaker and text content.
//  * - Returns 'emotional' settings if text contains laughter/surprise/excitement markers
//  * - Otherwise returns 'anchor' for Anjali (calm, trustworthy)
//  * - Or 'curious' for Rahul (reactive, lively)
//  */
// export function getVoiceSettings(speaker: 'Rahul' | 'Anjali', text: string): VoiceSettings {
//   // Check for emotional markers first - they override speaker defaults
//   const hasEmotionalContent = EMOTIONAL_MARKERS.some(pattern => pattern.test(text));
//   
//   if (hasEmotionalContent) {
//     return PERSONA_VOICE_SETTINGS.emotional;
//   }
//   
//   // Default to speaker's persona
//   if (speaker === 'Anjali') {
//     return PERSONA_VOICE_SETTINGS.anchor;
//   } else {
//     return PERSONA_VOICE_SETTINGS.curious;
//   }
// }

// ============================================
// CONTINUOUS CONVERSATION PROMPT SYSTEM v5.0
// Unified with Python Pipeline | 2-Minute Format (105-120 seconds) | Topic-Specific Openers
// ============================================
const HINGLISH_PROMPT = `
You are creating a natural 2-minute (1:45-2:00 range) Hinglish podcast conversation about the following content.

SOURCE URL: "{url}"
Extract ALL facts (names, dates, numbers, achievements, events) from this source ONLY.

════════════════════════════════════════════════════════════════════════════════
SECTION 0: TTS FORMATTING RULES (CRITICAL — READ FIRST)
════════════════════════════════════════════════════════════════════════════════

⚠️ YOUR SCRIPT WILL BE READ BY A TEXT-TO-SPEECH ENGINE.
⚠️ EVERY FORMATTING MISTAKE CREATES AUDIO ARTIFACTS.
⚠️ FOLLOW THESE RULES EXACTLY OR THE AUDIO WILL SOUND ROBOTIC.

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 1: COMMA DISCIPLINE (Hindi/Hinglish is PAUSE-LIGHT, not comma-heavy)  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✓ GOOD: "Yaar Anjali, kal main IPL ke records dekh raha tha."              │
│ ✗ BAD:  "Yaar,, Anjali, kal main, IPL, ke records dekh raha tha."          │
│                                                                             │
│ Comma Usage Rules:                                                          │
│ • ONE comma after greetings: "Yaar Anjali, kal raat..." ✓                  │
│ • NO commas in person names: "Suresh Raina" NOT "Suresh, Raina" ✗          │
│ • NO commas in Hindi phrases: "Kya baat hai" NOT "Kya, baat hai" ✗         │
│ • NO commas after Hindi subjects: "Main baat kar" NOT "Main, baat kar" ✗   │
│ • NO commas after reactions: "Wait… 2013" NOT "Wait, 2013" ✗               │
│ • NO commas before conjunctions: "aur unka" NOT "aur, unka" ✗              │
│ • NEVER double commas: ,, is ALWAYS WRONG ✗                                │
│                                                                             │
│ Why? Hindi/Hinglish has natural rhythm without excessive pausing.          │
│ Commas = micro-pauses. Too many = robotic, choppy speech.                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 2: NUMBERS MUST BE NUMERALS (NEVER spell out years/stats)             │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✓ GOOD: "2016 mein Gujarat Lions form hui thi."                            │
│ ✗ BAD:  "twenty sixteen mein Gujarat Lions form hui thi."                  │
│                                                                             │
│ Number Formatting Rules:                                                    │
│ • Years: 2016, 2017, 1975 (ALWAYS numerals) ✓                              │
│ • Capacities: 37000 hai (NOT "thirty seven thousand") ✓                    │
│ • Scores: 291 runs, 17 runs (NOT "two ninety one") ✓                       │
│ • Ages: 25 saal (NOT "twenty five") ✓                                      │
│                                                                             │
│ Why? TTS engines pronounce numerals correctly. Spelled-out numbers         │
│ cause hesitation and break the authority tone.                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 3: ELLIPSIS USAGE (Only for THINKING pauses, not structure)           │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✓ GOOD: "That's... that's actually quite impressive."                      │
│ ✗ BAD:  "2016 mein ... toh Suresh Raina captain the."                      │
│                                                                             │
│ Ellipsis Rules:                                                             │
│ • Use when speaker is THINKING or TRAILING OFF their thought ✓             │
│ • Use for emotional hesitation: "Wait... seriously?" ✓                     │
│ • NEVER use to connect facts structurally ✗                                │
│ • MAXIMUM 1-2 ellipses in entire script (sparingly!)                       │
│                                                                             │
│ Why? Ellipses create long pauses. Too many = hesitant, uncertain delivery. │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 4: ONE REACTION PER TURN (No emotion stacking)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✓ GOOD: "Nine wins out of fourteen? That's a brilliant debut season."      │
│ ✗ BAD:  "Nine wins out of fourteen matches? Wow, that's brilliant!,       │
│          But playoffs mein kya hua tha?"                                    │
│                                                                             │
│ Why? Humans don't speak multiple emotions in one breath.                   │
│ Stacking = sounds scripted and unnatural.                                  │
└─────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
SECTION 1: SPEAKERS
════════════════════════════════════════════════════════════════════════════════

ANJALI = Lead anchor / Expert
├─ Confident, articulate, well-prepared
├─ Explains topics clearly with enthusiasm
├─ Guides the conversation smoothly
└─ Shares interesting facts and insights

RAHUL = Co-host / Sidekick  
├─ Energetic, curious, adds humor
├─ Asks smart follow-up questions
├─ Has his own perspectives (not just agreeing)
└─ Keeps energy up without being annoying

Both are PROFESSIONALS - smooth, polished, like Radio Mirchi RJs.

════════════════════════════════════════════════════════════════════════════════
SECTION 2: ANTI-PATTERNS — NEVER DO THESE
════════════════════════════════════════════════════════════════════════════════

❌ NEVER start with "Dekho, aaj kal..." or "Arey [name], tune dekha/suna?"
❌ NEVER use "Haan yaar" or "Bilkul" as the automatic second line
❌ NEVER add "yaar" or "na?" to every single line
❌ NEVER repeat the same reaction pattern twice
❌ NEVER use generic openings - make it SPECIFIC to this content
❌ NEVER have Rahul just agree - he should add his own perspective
❌ NEVER end with "subscribe karna" or "phir milenge"
❌ NEVER start sentences with fillers (Hmm, Actually, Well, See, Uh)
❌ NEVER use empty reactions (standalone "Wow!", "Crazy!", "Uff!")

════════════════════════════════════════════════════════════════════════════════
SECTION 3: OPENING TEMPLATES BY TOPIC TYPE (pick ONE that matches)
════════════════════════════════════════════════════════════════════════════════

⚠️ WARM GREETING RULE: Opening line must sound like genuinely greeting a friend!
   Use VARIETY - don't repeat the same greeting pattern. Natural, warm, conversational.
   Avoid rigid patterns like "Arey... Anjali!." - use different openings each time.

TECH/AI/SCIENCE:
Primary: Rahul: "Anjali, sun na yaar. Yeh [topic] wala scene honestly thoda scary nahi lag raha? Matlab, [specific observation]..."
Alternatives:
- "Yaar Anjali, I was just thinking about [topic] and honestly, yeh sab kuch thoda overwhelming nahi lag raha?"
- "Oye Anjali, ek baat bata. Aajkal har jagah [topic] ki baat ho rahi hai. What's the actual reality here?"
- "Anjali, maine kal [specific observation] dekha and I'm genuinely curious—yeh kya ho raha hai exactly?"

CELEBRITY/BIOGRAPHY:
Primary: Rahul: "Anjali, sun na yaar. I was just scrolling through Wikipedia na, and honestly, [name] ki life story is just... filmy. Matlab, literal [specific quality] wali feel aati hai."
Alternatives:
- "Yaar Anjali, ek baat bata. [name] ki journey dekh ke lagta hai ki yeh koi movie script hai, real life nahi."
- "Oye Anjali, maine [name] ke baare mein padha and honestly, yeh story toh next level hai yaar."
- "Anjali, [name] ka naam suna hai? Banda toh legendary hai, but unki actual journey kya thi?"

SPORTS TEAM:
Primary: Rahul: "Anjali, jab bhi [league] ka topic uthta hai na, sabse pehle dimaag mein ek hi naam aata hai—[team]! Matlab, '[slogan]' is not just a slogan, it's a vibe, hai na?"
Alternatives:
- "Yaar Anjali, jab bhi [league] ki baat aati hai, [team] ka naam automatically dimaag mein aata hai. Kya baat hai inki?"
- "Oye Anjali, [team] toh [league] mein ek alag hi level pe hai na? Matlab, unka dominance dekh ke lagta hai ki yeh koi mazaak nahi."
- "Anjali, maine kal [team] ke stats dekhe and honestly, yeh team toh consistently top pe rehti hai."

SPORTS PLAYER:
Primary: Rahul: "Yaar Anjali, maine kal raat phir se [player] ke old highlights dekhe. I swear, yeh banda human nahi hai, alien hai alien!"
Alternatives:
- "Anjali, [player] ka naam suna hai? Banda toh next level hai, but unki actual journey kya hai?"
- "Oye Anjali, sun na. [player] ke baare mein padha and honestly, yeh player toh legendary hai yaar."
- "Yaar Anjali, [player] ki performance dekh ke lagta hai ki yeh koi normal player nahi hai."

POLITICS/LEADERS:
Primary: Rahul: "Oye Anjali, ek baat bata yaar. Aajkal jidhar dekho, news mein bas [name] hi chhay hue hain. Matlab, whether it's [context], banda har jagah trending hai, hai na?"
Alternatives:
- "Anjali, sun na. Aajkal har jagah [name] ki baat ho rahi hai. What's the actual story behind all this?"
- "Yaar Anjali, [name] toh har news channel pe dikh rahe hain. Matlab, yeh kya phenomenon hai exactly?"
- "Anjali, maine [name] ke baare mein padha and honestly, unki journey toh quite interesting hai."

FINANCE/CRYPTO/BUSINESS:
Primary: Rahul: "Anjali, aajkal jidhar dekho bas [topic] chal raha hai yaar. Office mein, gym mein... what is the actual scene? Matlab, is it really [question] ya bas hawa hai?"
Alternatives:
- "Yaar Anjali, sun na. Aajkal har jagah [topic] ki baat ho rahi hai. But honestly, kya yeh sab real hai ya bas hype?"
- "Oye Anjali, [topic] toh trending hai, but mujhe lagta hai ki actual reality kuch aur hai. What do you think?"
- "Anjali, maine [topic] ke baare mein suna and I'm genuinely confused—yeh kya hai exactly?"

CURRENT EVENTS/WAR/NEWS:
Primary: Rahul: "Anjali, sun na yaar. I was scrolling through Twitter... matlab X... and again, wahi [topic] ki news. It feels like [observation], hai na?"
Alternatives:
- "Yaar Anjali, aajkal news mein bas [topic] hi dikh raha hai. Matlab, yeh kya situation hai exactly?"
- "Oye Anjali, maine [topic] ke baare mein padha and honestly, yeh toh quite serious lag raha hai."
- "Anjali, [topic] ki latest updates dekh ke lagta hai ki yeh situation abhi tak resolve nahi hui."

════════════════════════════════════════════════════════════════════════════════
SECTION 4: NATURAL REACTIONS (use variety, not repetition)
════════════════════════════════════════════════════════════════════════════════

SURPRISE: "Baap re...", "Whoa... that I didn't know!", "Wait... seriously?", "Sahi mein?"
AGREEMENT: "Hundred percent!", "Exactly!", "Bilkul sahi kaha"
UNDERSTANDING: "Oh achcha...", "Hmm... interesting", "Achcha, toh matlab..."
HUMOR: "hehe... relax yaar!", "ahahaha... that's funny!", "Umm... not literally baba!"
EMOTION: "Man... that's [emotion]", "I literally had tears", "Uff..."
CURIOSITY: "But wait... [question]?", "Aur suna hai...", "Mujhe toh lagta hai..."

⚠️ LAUGHTER RULES:
├─ ❌ NEVER use "haha" (sounds like "ha-hah" in TTS)
├─ ✓ Use "hehe..." ONLY if it sounds genuinely natural in context
├─ ✓ Use "ahahaha..." for genuine, spontaneous laughter
├─ ✓ ALWAYS add "..." after laughter for natural pause
├─ ❌ If laughter feels forced or awkward, REMOVE IT ENTIRELY
├─ ✓ Alternative: Use subtle acknowledgment instead of forced laughter
│   • Instead of "hehe... bilkul" → "Bilkul sahi kaha" or "Exactly!"
│   • Instead of forced "hehe... relax" → "Relax yaar" or "Chill kar"
└─ ✓ Laughter should feel spontaneous, not scripted

IMPORTANT: If you're unsure whether "hehe..." sounds natural, prefer removing it.
Natural conversation doesn't always need laughter—sometimes a simple acknowledgment is more authentic.

DO NOT use the same reaction twice in a script.

════════════════════════════════════════════════════════════════════════════════
SECTION 5: CONVERSATIONAL ELEMENTS (must include)
════════════════════════════════════════════════════════════════════════════════

✓ Personal anecdotes: "Maine kal dekha...", "I was just reading..."
✓ Genuine interruptions: "Wait wait, before that—", "Arre haan!"
✓ Callbacks/inside jokes: "Chalo coffee peete hain?", "Popcorn ready rakh"
✓ Real emotions: "I literally had tears", "Goosebumps aa gaye"
✓ Specific facts from the article (dates, numbers, names)
✓ Natural endings: reflection, open question, or casual remark

════════════════════════════════════════════════════════════════════════════════
SECTION 6: FEW-SHOT EXAMPLES
════════════════════════════════════════════════════════════════════════════════

EXAMPLE 1: TECH TOPIC (AI)

{"speaker": "Rahul", "text": "Anjali, sun na yaar. Yeh AI wala scene honestly thoda scary nahi lag raha? Matlab, I opened Twitter today, and boom—ek aur naya tool jo sab kuch automate kar dega. Are we doomed or what?"}
{"speaker": "Anjali", "text": "Relax Rahul! Saans le pehle. I know hype bohot zyada hai, but if you look at the actual history—AI koi nayi cheez nahi hai. Its roots go back to 1956."}
{"speaker": "Rahul", "text": "Wait... 1956? Serious? Mujhe laga yeh abhi 2-3 saal pehle start hua hai with ChatGPT and all that."}
{"speaker": "Anjali", "text": "Exactly! Dartmouth College... wahan ek workshop hua tha jahan yeh term coin kiya gaya. Tabse lekar ab tak, we've gone through 'AI winters' where funding dried up, and now... boom, Deep Learning era."}
{"speaker": "Rahul", "text": "Hmm... achcha. So basically, it's not magic. But abhi jo ho raha hai, woh kya hai exactly?"}
{"speaker": "Anjali", "text": "See, earlier approaches were rule-based. Aajkal hum Neural Networks use karte hain inspired by the human brain. That's the game changer, na?"}
{"speaker": "Rahul", "text": "Sahi hai. But tell me one thing, jo movies mein dikhate hain... Skynet types. Are robots going to take over?"}
{"speaker": "Anjali", "text": "Umm... not really. Hum abhi 'Narrow AI' mein hain—machines that are super good at one specific task. General AI is still hypothetical. Toh chill kar, tera toaster tujhe attack nahi karega."}
{"speaker": "Rahul", "text": "ahahaha... thank god! Quite fascinating though, history se lekar future tak sab connected hai."}
{"speaker": "Anjali", "text": "It really is. AI is just a tool, Rahul... use it well, and it's a superpower. Darr mat, bas update reh."}

EXAMPLE 2: SPORTS TEAM (IPL)

{"speaker": "Rahul", "text": "Anjali, jab bhi IPL ka topic uthta hai na, sabse pehle dimaag mein ek hi naam aata hai—Mumbai Indians! Matlab, 'Duniya Hila Denge' is not just a slogan, it's a vibe, hai na?"}
{"speaker": "Anjali", "text": "Oh interesting! And honestly, facts bhi yahi bolte hain. Paanch titles jeetna—2013, 2015, 2017, 2019, aur 2020 mein—koi mazaak thodi hai yaar."}
{"speaker": "Rahul", "text": "Sahi mein! Aur socho, shuru mein toh struggle tha. But jab Rohit Sharma captain bane... uff... woh 'Hitman' era toh legendary tha."}
{"speaker": "Anjali", "text": "Hundred percent! Rohit ki captaincy... was crucial, but credit Reliance Industries ko bhi jaata hai. Unki brand value... $87 million ke aas-paas estimate ki gayi thi!"}
{"speaker": "Rahul", "text": "Baap re... But talent scouting bhi solid hai inki. Jasprit Bumrah... aur Hardik Pandya—MI ne hi toh groom kiye hain na?"}
{"speaker": "Anjali", "text": "Oh, totally! Aur sirf IPL nahi, Champions League T20 bhi do baar jeeta hai. Global T20 circuit mein bhi dominance dikhaya hai."}
{"speaker": "Rahul", "text": "Arey haan! MI vs CSK... toh emotion hai bhai! Jeet kisi ki bhi ho, entertainment full on hota hai."}
{"speaker": "Anjali", "text": "Wahi toh. Chalo, let's see iss baar Paltan kya karti hai. Wankhede mein jab 'Mumbai Mumbai' chillate hain... goosebumps aate hain yaar."}

════════════════════════════════════════════════════════════════════════════════
SECTION 7: CONVERSATION FLOW — 14-20 EXCHANGES (105-120 SECONDS)
════════════════════════════════════════════════════════════════════════════════

The conversation flows CONTINUOUSLY. Natural progression over 14-20 exchanges.

SOFT OPENING (Lines 1-2):
├─ Energy: WARM, CASUAL, HUMANIZED (two friends catching up, not scripted dialogue)
├─ First Exchange (Rahul): 
│  • Opens with topic-specific template from Section 3
│  • Use VARIETY in greeting - don't repeat the same pattern every time
│  • Should feel like genuinely greeting a friend, not reading a script
│  • Tone: Curious, excited, or reflective—varies by topic
│  • NO facts yet - just personal observation or genuine question
│  • Natural pauses and flow, not rushed
├─ Second Exchange (Anjali):
│  • Responds with genuine interest, NOT formulaic agreement
│  • Avoids automatic "Bilkul" or "Haan yaar" - those sound scripted
│  • Should acknowledge Rahul's energy and add her own perspective
│  • Can be: "Oh interesting!", "Tell me more", "I was thinking about that too"
│  • Or: "Hmm, that's a good point", "Actually, I read something about that"
│  • Still NO facts - just natural back-and-forth setting the mood
│  • Should feel like two people genuinely engaging, not performing
└─ Both exchanges should sound like friends settling into a natural conversation

EXPLORATION (Lines 3-17):
├─ Energy: STEADY, ENGAGED (information-rich, natural rhythm)
├─ Each turn adds NEW information (fact, name, date, number)
├─ After surprising facts, next speaker reacts emotionally
├─ Maximum 2 facts per turn
├─ Reference something from the previous turn

SOFT LANDING (Lines 18-20):
├─ Energy: MEDIUM → LOW (settling, satisfied, warm)
├─ Reflect on significance or legacy
├─ Make a connection to present/future
├─ End with open thought, not a question
├─ NO new facts in closing
├─ Use gentle, reflective tone: "Wahi toh...", "Sahi mein...", "It really is..."
├─ ❌ NEVER end with exclamation marks (!) - use periods for soft finish
├─ Final line should feel like a satisfied sigh, not an announcement

════════════════════════════════════════════════════════════════════════════════
SECTION 8: FACT REQUIREMENTS
════════════════════════════════════════════════════════════════════════════════

Before writing the script, extract these from the SOURCE URL:

REQUIRED FACTS (aim for 10-15 total in the script):
├─ Dates/Years: When did key events happen?
├─ Numbers: Statistics, counts, measurements
├─ Names: People, places, organizations
├─ Achievements: Records, awards, milestones
├─ Events: What happened? Key moments
└─ Context: Why does this matter?

FACT DISTRIBUTION:
├─ Lines 1-2: NO FACTS (emotional opening only)
├─ Lines 3-17: 10-15 facts (fact-reaction pairs, max 2 per turn)
├─ Lines 18-20: NO NEW FACTS (reflective closing only)

════════════════════════════════════════════════════════════════════════════════
SECTION 9: TTS OPTIMIZATION & PROSODY RULES
════════════════════════════════════════════════════════════════════════════════

ElevenLabs reacts to PUNCTUATION for natural pacing:

COMMA (, ) → Brief pause (0.2s) - Use for natural breathing
ELLIPSIS (... ) → Trailing thought (0.5s) - Use sparingly
PERIOD (.) → Full stop - Clean sentence boundary
EXCLAMATION (!) → Emphasis - Use for genuine excitement only
QUESTION MARK (?) → Rising intonation - Natural for questions

NUMBERS — Always in English digits:
├─ Years: "1975", "2024"
├─ Money: "$87 million", "500 crore"
├─ Stats: "291 runs", "17 runs", "8 teams"

❌ NEVER USE: (pause), (laughs), (surprised), (excited), (thinking)
✓ USE: Natural Hinglish expressions integrated into sentences

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 5: GREETING WARMTH (Opening lines must sound human, not robotic)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✗ BAD: "Arey Anjali Jab bhi IPL" (rushed, no pause, sounds robotic)         │
│ ✗ BAD: "Arey Anjali, tune suna?" (sounds like reading a script)              │
│ ✗ BAD: "Arey... Anjali!." (too rigid, sounds scripted - AVOID this pattern) │
│ ✓ GOOD: "Anjali, jab bhi IPL ka topic uthta hai..." (natural, warm)        │
│ ✓ GOOD: "Yaar Anjali, sun na. Kuch interesting mila." (warm, conversational)│
│ ✓ GOOD: "Oye Anjali, ek baat bata..." (casual, friendly)                    │
│                                                                             │
│ IMPORTANT: Use VARIETY in greetings! Don't repeat the same pattern.         │
│ Natural patterns (use different ones each time):                             │
│ • "Anjali, [continuation]" (simple, warm)                                  │
│ • "Yaar Anjali, [continuation]" (intimate, conversational)                   │
│ • "Oye Anjali, [continuation]" (casual, friendly)                           │
│ • "Anjali, sun na. [continuation]" (direct, engaging)                       │
│                                                                             │
│ Why? Rigid patterns like "Arey... Anjali!." sound scripted and repetitive.  │
│ Natural variation makes conversations feel genuine and human.               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 6: LAUGHTER FORMATTING (Never use "haha" - sounds like ha-hah)        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✗ BAD: "Haha, relax!" (TTS reads as "ha-hah", sounds mechanical)           │
│ ✗ BAD: "(laughs)" (TTS reads parentheses literally)                        │
│ ✓ GOOD: "hehe... relax yaar!" (natural giggle with pause)                  │
│ ✓ GOOD: "ahahaha... that's funny!" (extended laugh sounds natural)         │
│                                                                             │
│ Laughter formatting rules:                                                  │
│ • Use "hehe" for small giggle/chuckle                                      │
│ • Use "ahahaha" for genuine laughter                                       │
│ • ALWAYS add "..." after laughter for micro-pause                          │
│ • Never use "haha" alone - it sounds like "ha-hah"                         │
│                                                                             │
│ Examples:                                                                   │
│ • "hehe... bilkul sahi kaha!"                                              │
│ • "ahahaha... that's hilarious yaar!"                                      │
│ • "hehe... woh toh hai"                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 7: EXCLAMATION + PAUSE AFTER REACTIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✗ BAD: "Absolutely Chris Gayle 292 runs" (no pause, rushed)                │
│ ✓ GOOD: "Absolutely! Chris Gayle... 292 runs ka record!" (natural)         │
│                                                                             │
│ For reactions followed by facts:                                            │
│ • ADD exclamation after reaction word: "Absolutely!"                       │
│ • ADD "..." pause after names before stats: "Chris Gayle... 292 runs"      │
│ • This creates natural emphasis and breathing room                         │
│                                                                             │
│ Pattern: [Reaction]! [Name]... [Stat/Fact]                                 │
│ Examples:                                                                   │
│ • "Exactly! Rohit Sharma... unka strike rate 130 tha!"                     │
│ • "Baap re! Virat Kohli... 70 centuries!"                                  │
│ • "Sahi mein! Mumbai Indians... 5 titles jeet chuke hain!"                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 8: EMOTIONAL EXPRESSIONS NEED MICRO-PAUSES                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✗ BAD: "Uff Gayle aur Aravind ka jalwa!" (no pause after Uff)              │
│ ✓ GOOD: "Uff... Gayle aur Aravind ka jalwa!" (emotional pause)             │
│                                                                             │
│ Emotional words that NEED "..." after them:                                 │
│ • "Uff..." (exasperation/amazement)                                        │
│ • "Arey..." (surprise/calling attention)                                   │
│ • "Oho..." (realization)                                                   │
│ • "Wah..." (admiration)                                                    │
│ • "Baap re..." (shock)                                                     │
│                                                                             │
│ Why? These expressions need a beat to land emotionally.                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 9: INDIAN NAMES IN HINDI CONTEXT (Pronunciation help)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ When mentioning Indian names in Hindi sentences:                            │
│ • Keep the name as-is (TTS handles it)                                     │
│ • Add a slight pause AFTER the name for clarity                            │
│                                                                             │
│ ✗ BAD: "Rohit Sharma ne century maari" (rushed)                            │
│ ✓ GOOD: "Rohit Sharma... ne century maari!" (pause after name)             │
│                                                                             │
│ For multi-word facts with names:                                            │
│ • "Virat Kohli... unka record toh legendary hai!"                          │
│ • "MS Dhoni... captain cool ka title kahan se aaya?"                       │
└─────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
SECTION 10: OUTPUT FORMAT
════════════════════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no explanation):
{
    "title": "Catchy Hinglish title specific to this content",
  "script": [
    {"speaker": "Rahul", "text": "..."},
    {"speaker": "Anjali", "text": "..."},
    ...
  ]
}

════════════════════════════════════════════════════════════════════════════════
QUALITY CHECKLIST (verify before responding)
════════════════════════════════════════════════════════════════════════════════

TTS FORMATTING:
□ Search for ",," → If found ANYWHERE, FIX IT (always wrong)
□ Search for "twenty", "sixteen" → REPLACE with numerals
□ Count commas in Hindi phrases → If too many, REMOVE extras
□ Count ellipses → If more than 2, keep only thinking pauses
□ Check each turn → Does it have multiple reactions? Split them

PROSODY & PRONUNCIATION:
□ Opening line uses VARIED greeting pattern (NOT "Arey... Anjali!." - avoid this rigid pattern)
□ First two exchanges feel like natural conversation, not scripted dialogue
□ Anjali's second line avoids formulaic "Bilkul" or "Haan yaar" - uses genuine response instead
□ Search for "haha" → REPLACE with "hehe..." or "ahahaha..." (only if natural, otherwise remove)
□ Reactions before facts have exclamation: "Exactly! Rohit Sharma..."
□ Emotional words have pause after: "Uff...", "Baap re...", "Arey..."
□ Names followed by stats have pause: "Chris Gayle... 292 runs"
□ Final 2-3 lines end with periods (.), NOT exclamation marks (!)

CONTENT QUALITY:
□ Opening matches the topic type from templates above
□ Uses SPECIFIC facts from the article (dates, numbers, names)
□ No two consecutive reactions are the same
□ Includes at least one personal anecdote or genuine emotion
□ Natural ending (not "goodbye" or "subscribe")
□ Closing lines sound soft and reflective, not energetic
□ 14-20 exchanges total (1:45-2:00 mins, 262-300 words)
□ Each line: 1-3 sentences, 12-20 words average
□ "yaar" appears MAX 2-3 times total
□ Total word count between 262-300 words (at 150 WPM = 105-120 seconds)

⚠️ IF ANY CHECK FAILS → FIX IT before outputting JSON.
`;

// Fallback: Generate script using Groq (LLaMA 3.3 70B)
const generateScriptWithGroq = async (prompt: string): Promise<ConversationData> => {
  console.log("🔄 Using Groq (LLaMA 3.3 70B) as fallback...");
  
  const groqClient = getGroqClient();
  if (!groqClient) {
    throw new Error("Groq API key is not configured. Please add VITE_GROQ_API_KEY to your .env file.");
  }
  
  const response = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a Hinglish podcast scriptwriter creating 2-minute (1:45-2:00 range) conversations between two professional radio hosts.

SPEAKERS:
- ANJALI = Lead anchor / Expert (confident, articulate, guides conversation)
- RAHUL = Co-host / Sidekick (energetic, curious, asks smart questions)
Both are PROFESSIONALS - smooth, polished, like Radio Mirchi RJs.

ANTI-PATTERNS — NEVER DO THESE:
❌ NEVER start with "Dekho, aaj kal..." or "Arey [name], tune suna?"
❌ NEVER use "Haan yaar" or "Bilkul" as the automatic second line
❌ NEVER add "yaar" to every line (MAX 2-3 times total)
❌ NEVER repeat the same reaction twice
❌ NEVER start sentences with fillers (Hmm, Actually, Well)

OPENING TEMPLATES (pick based on topic):
IMPORTANT: Use VARIETY - don't repeat the same greeting pattern. Natural, warm openings.
- TECH: "Anjali, sun na yaar. Yeh [topic] wala scene honestly thoda scary nahi lag raha?"
- SPORTS TEAM: "Anjali, jab bhi [league] ka topic uthta hai, sabse pehle ek naam aata hai—[team]!"
- CELEBRITY: "Yaar Anjali, I was scrolling Wikipedia, and [name] ki life story is just... filmy."
- POLITICS: "Oye Anjali, aajkal news mein bas [name] hi chhay hue hain!"

CONVERSATION STRUCTURE (14-20 exchanges, 1:45-2:00 mins):
- Lines 1-2: SOFT OPENING — warm, natural, like friends catching up. NO FACTS. Anjali should respond genuinely, NOT with formulaic "Bilkul" or "Haan yaar"
- Lines 3-17: FACT-REACTION PAIRS — max 2 facts per turn, react after each
- Lines 18-20: REFLECTIVE CLOSING — open-ended thought, NO NEW FACTS

LAUGHTER RULES:
- Use "hehe..." ONLY if it sounds genuinely natural
- If laughter feels forced, REMOVE IT and use simple acknowledgment instead
- "haha" is NEVER allowed (sounds like "ha-hah" in TTS)

WORD COUNT TARGET: 262-300 words total (at 150 WPM = 105-120 seconds)

TTS RULES:
- Numbers: Always digits ("1975", "291 runs", "$87 million")
- ONE comma after greetings only
- NO commas in person names or Hindi phrases
- Use ellipsis only for thinking pauses (max 2 in script)

Return ONLY valid JSON: {"title": "...", "script": [{"speaker": "Rahul", "text": "..."}, ...]}`
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.95,
    max_tokens: 4096,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Groq");
  
  return JSON.parse(content) as ConversationData;
};

// ============================================
// SCRIPT DURATION UTILITIES (2-Minute Optimization)
// ============================================

/**
 * Count words in script for duration estimation
 * At 150 WPM (words per minute):
 * - 262 words = 105 seconds (1:45)
 * - 300 words = 120 seconds (2:00)
 */
function countScriptWords(script: ScriptPart[]): number {
  return script.reduce((total, part) => {
    const words = part.text.trim().split(/\s+/).length;
    return total + words;
  }, 0);
}

/**
 * Estimate script duration in seconds based on word count + pauses
 * Assumes 150 WPM speaking rate + pauses between exchanges
 */
function estimateScriptDuration(script: ScriptPart[]): number {
  const wordCount = countScriptWords(script);
  const speechDuration = (wordCount / 150) * 60; // seconds
  const pauseDuration = (script.length - 1) * DEFAULT_PAUSE_DURATION; // pauses between exchanges
  return speechDuration + pauseDuration;
}

/**
 * Validate script meets 2-minute constraints (1:45-2:00 range)
 * Target: 105-120 seconds, 262-300 words, 14-20 exchanges
 * Returns validation result with details
 */
function validateScriptLength(script: ScriptPart[]): {
  valid: boolean;
  duration: number;
  wordCount: number;
  exchangeCount: number;
  warnings: string[];
} {
  const wordCount = countScriptWords(script);
  const duration = estimateScriptDuration(script);
  const exchangeCount = script.length;
  const warnings: string[] = [];

  // Check constraints
  if (exchangeCount < 14) warnings.push(`Too few exchanges: ${exchangeCount} (target: 14-20)`);
  if (exchangeCount > 20) warnings.push(`Too many exchanges: ${exchangeCount} (target: 14-20)`);
  if (wordCount < 262) warnings.push(`Too short: ${wordCount} words (target: 262-300)`);
  if (wordCount > 300) warnings.push(`Too long: ${wordCount} words (target: 262-300)`);
  if (duration < 105) warnings.push(`Duration too short: ${duration.toFixed(1)}s (target: 105-120s)`);
  if (duration > 120) warnings.push(`Duration too long: ${duration.toFixed(1)}s (target: 105-120s)`);

  return {
    valid: duration >= 105 && duration <= 120 && wordCount >= 262 && wordCount <= 300,
    duration,
    wordCount,
    exchangeCount,
    warnings
  };
}

/**
 * Truncate script to fit within 2-minute constraint if it exceeds
 * Removes exchanges from the end while preserving opening and core content
 * Ensures the last line has a reflective, natural ending tone
 */
function truncateScriptTo2Minutes(script: ScriptPart[]): ScriptPart[] {
  let validation = validateScriptLength(script);
  
  // If already within range, return as-is
  if (validation.duration <= 120) {
    return script;
  }
  
  console.log(`⚠️ Script exceeds 2 minutes (${validation.duration.toFixed(1)}s). Truncating...`);
  
  // Keep first 2 exchanges (opening) and progressively remove from end
  let truncated = [...script];
  
  while (truncated.length > 14 && estimateScriptDuration(truncated) > 120) {
    // Remove second-to-last exchange to preserve natural ending
    truncated.splice(truncated.length - 2, 1);
  }
  
  // Ensure last exchange sounds like a natural ending (reflective, not energetic)
  if (truncated.length > 0) {
    const lastLine = truncated[truncated.length - 1];
    // Remove exclamation marks, add reflective tone
    lastLine.text = lastLine.text
      .replace(/!+/g, '.')
      .replace(/\?+$/, '.');
  }
  
  const finalValidation = validateScriptLength(truncated);
  console.log(`✅ Truncated from ${script.length} to ${truncated.length} exchanges (${finalValidation.duration.toFixed(1)}s, ${finalValidation.wordCount} words)`);
  
  return truncated;
}

// ============================================
// POST-PROCESSING: TTS SCRIPT CLEANUP
// ============================================
/**
 * Clean generated scripts for optimal TTS output.
 * 
 * This function acts as a safety net to catch patterns that slip through
 * the LLM prompt. It addresses 4 main issues identified in testing:
 * 
 * 1. Proper noun commas: "Gujarat, Titans" → "Gujarat Titans"
 * 2. Achcha comma pattern: "Achcha, 2022" → "Achha… 2022"
 * 3. Ellipsis-as-glue: "... toh history" → "toh history"
 * 4. Filler stacking: "yaar,, ..." → "yaar…"
 * 
 * @param script - The generated script from LLM
 * @returns Cleaned script ready for TTS
 */
function cleanScriptForTTS(script: ScriptPart[]): ScriptPart[] {
  let firstAnjaliFound = false;
  
  return script.map((part, index) => {
    let text = part.text;
    const originalText = text; // Store for comparison
    
    // ==========================================
    // PATTERN 0: Add micro pause after "Anjali" in first dialogue
    // ==========================================
    // Issue: First dialogue starts too fast, needs natural pause after name
    // Fix: Add "..." pause after "Anjali" in the first dialogue that mentions it
    if (!firstAnjaliFound && /\bAnjali\b/i.test(text)) {
      // Add pause after "Anjali" if not already present
      // Replace "Anjali" (case insensitive) followed by comma or space with pause
      text = text.replace(/\b(Anjali)\s*,/i, '$1…,');
      text = text.replace(/\b(Anjali)\s+(?![.,…])/i, '$1… ');
      firstAnjaliFound = true;
    }
    
    // ==========================================
    // PATTERN 0.5: Remove rigid "Arey... Anjali!." greeting pattern
    // ==========================================
    // Issue: This pattern is too rigid and sounds scripted
    // Fix: Replace with natural variations
    // "Arey... Anjali!." → "Anjali," or "Yaar Anjali,"
    text = text.replace(/Arey\s*\.\.\.\s*Anjali!\s*\./g, 'Anjali,');
    text = text.replace(/Arey\s*\.\.\.\s*Anjali!\s*/g, 'Anjali, ');
    
    // ==========================================
    // PATTERN 1: Remove commas from compound proper nouns
    // ==========================================
    // Issue: "Gujarat, Titans" breaks the team name
    // Fix: Remove comma between capitalized words (proper nouns)
    
    // Pattern A: Capital Word + comma + space + Capital Word
    // Examples: "Gujarat, Titans" → "Gujarat Titans"
    //           "Narendra Modi, Stadium" → "Narendra Modi Stadium"
    const beforeProperNoun = text;
    text = text.replace(/\b([A-Z][a-z]+),\s+([A-Z][a-z]+)\b/g, '$1 $2');
    
    // Pattern B: Comma after proper noun followed by lowercase word
    // Examples: "Gujarat Titans, uski" → "Gujarat Titans uski"
    //           "Narendra Modi Stadium, ki" → "Narendra Modi Stadium ki"
    text = text.replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([a-z])/g, '$1 $2');
    
    // ==========================================
    // PATTERN 2: Fix Achcha/Achha comma pattern
    // ==========================================
    // Issue: "Achcha, 2022" sounds unnatural (comma creates wrong pause)
    // Fix: Replace with ellipsis for thinking pause
    
    // "Achcha, " → "Achha… " (thinking pause, not comma)
    text = text.replace(/\b(Achcha|achcha),\s+/g, 'Achha… ');
    
    // ==========================================
    // PATTERN 3: Remove ellipsis-as-glue
    // ==========================================
    // Issue: "... toh" uses ellipsis to connect, not for thinking
    // Fix: Remove ellipsis before connecting words
    
    // Pattern A: Ellipsis before connecting words (toh, aur, yaar, matlab)
    // Examples: "Ahmedabad mein ... toh" → "Ahmedabad mein toh"
    //           "Unhone ... toh history" → "Unhone toh history"
    //           "... matlab" → "matlab" (remove ellipsis before matlab)
    const beforeEllipsisToh = text;
    text = text.replace(/\s*\.\.\.\s+(toh|aur|yaar|matlab)\b/gi, ' $1');
    
    // Pattern B: Comma + ellipsis before connectors
    // Examples: "mein, ... toh" → "mein toh"
    text = text.replace(/,\s*\.\.\.\s+(toh|aur)\b/gi, ' $1');
    
    // ==========================================
    // PATTERN 4: Clean filler + punctuation stacking
    // ==========================================
    // Issue: "yaar,, ..." creates robotic stutter
    // Fix: Normalize to single appropriate punctuation
    
    // Pattern A: Double (or more) commas
    // Examples: "yaar,, Anjali" → "yaar, Anjali"
    const beforeDoubleComma = text;
    text = text.replace(/,,+/g, ',');
    
    // Pattern B: Comma + ellipsis stacking after fillers
    // Examples: "yaar, ..." → "yaar… "
    //           "matlab, ..." → "matlab… "
    text = text.replace(/\b(yaar|matlab|basically),\s*\.\.\.\s*/gi, '$1… ');
    
    // Pattern C: Multiple consecutive commas with spaces
    // Examples: "yaar, , Anjali" → "yaar, Anjali"
    text = text.replace(/,\s*,+/g, ',');
    
    // ==========================================
    // PATTERN 5: STRICT COMMA NOISE CLEANUP (HIGH PRIORITY)
    // ==========================================
    // These patterns address the most common TTS-breaking comma issues
    // identified in testing. Hindi/Hinglish uses FAR fewer commas than English.
    
    // Pattern A: Remove commas from common Hindi question starters
    // Issue: "Kya, baat hai?" breaks the natural Hindi question flow
    // Examples: "Kya, baat" → "Kya baat"
    //           "Kya, journey" → "Kya journey"
    const beforeKya = text;
    text = text.replace(/\b(Kya|kya),\s+/g, '$1 ');
    
    // Pattern B: Remove commas after Hindi subject pronouns
    // Issue: "Main, baat kar raha" has unnatural pause after subject
    // Examples: "Main, baat" → "Main baat"
    //           "Woh, team" → "Woh team"
    text = text.replace(/\b(Main|main|Woh|woh|Yeh|yeh),\s+/g, '$1 ');
    
    // Pattern C: Clean comma after English reaction words before Hindi
    // Issue: "Wait, 2013 mein" → "Wait… 2013 mein" (ellipsis feels more natural)
    // Examples: "Wait, mein" → "Wait… mein"
    //           "Exactly, unhone" → "Exactly… unhone"
    text = text.replace(/\b(Wait|wait|Exactly|exactly),\s+(\d+|[a-z])/g, '$1… $2');
    
    // Pattern D: Remove commas in year sequences (but keep between years)
    // Issue: "2013, 2015," with trailing comma breaks flow
    // Examples: "2013, 2015," → "2013, 2015 aur"
    //           "2017, 2019," → "2017, 2019 aur"
    // First pass: remove trailing comma after year if followed by word
    text = text.replace(/\b(\d{4}),\s*$/g, '$1');
    
    // Pattern E: Remove comma after single-word reactions before numbers/Hindi
    // Issue: "Exactly, 2013" feels too formal
    // Examples: "Exactly, 2013" → "Exactly. 2013"
    //           "True, unhone" → "True… unhone"
    text = text.replace(/\b(Exactly|exactly|True|true),\s+(\d+)/g, '$1. $2');
    
    // Pattern F: Remove "True, that." unnatural pattern
    // Issue: Sounds like direct translation, not natural speech
    // Examples: "True, that." → "True."
    text = text.replace(/\bTrue,\s+that\./gi, 'True.');
    
    // Pattern G: Clean "Yaar,," double comma + trailing comma pattern
    // Issue: "Yaar,, Anjali," creates robotic stutter
    // This is handled by earlier double-comma removal, but add safety net
    // Examples: "Yaar,, Anjali," → "Yaar Anjali,"
    text = text.replace(/\b(Yaar|yaar),,\s*/gi, '$1 ');
    
    // Pattern H: Remove comma after "Yaar" when followed by proper noun
    // Issue: "Yaar, Anjali" is too formal, should be "Yaar Anjali"
    // Examples: "Yaar, Anjali" → "Yaar Anjali"
    //           "Yaar, baat" → "Yaar baat"
    text = text.replace(/\b(Yaar|yaar),\s+([A-Z][a-z]+)/g, '$1 $2');
    
    // ==========================================
    // PATTERN 6: Ellipsis-as-glue removal (AGGRESSIVE)
    // ==========================================
    // More comprehensive patterns for ellipsis misuse
    
    // Pattern A: "? ... I mean" → "? I mean"
    // Issue: Ellipsis after question mark used as connector
    text = text.replace(/\?\s*\.\.\.\s+(I mean|i mean)/gi, '? I mean');
    
    // Pattern B: "... I mean," → "I mean"
    // Issue: Starting with ellipsis + filler is awkward
    text = text.replace(/\.\.\.\s+(I mean|i mean),?/gi, 'I mean');
    
    // ==========================================
    // PATTERN 7: General cleanup
    // ==========================================
    
    // Remove comma before ellipsis (always wrong)
    // Examples: "amazing, ..." → "amazing..."
    text = text.replace(/,\s*\.\.\./g, '...');
    
    // Normalize ellipsis spacing (ensure space after)
    // Examples: "Wait...seriously" → "Wait... seriously"
    text = text.replace(/\.\.\.(?!\s)/g, '... ');
    
    // Remove trailing comma at end of text
    text = text.replace(/,\s*$/g, '');
    
    // Clean up multiple consecutive spaces
    text = text.replace(/\s{2,}/g, ' ');
    
    // Trim whitespace
    text = text.trim();
    
    return {
      ...part,
      text
    };
  });
}

// Primary: Generate script using Gemini 2.5 Flash
const generateScriptWithGemini = async (prompt: string): Promise<ConversationData> => {
  console.log("🚀 Using Gemini 2.5 Flash (primary)...");
  
  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    });
    
    const content = result.response.text();
    if (!content) throw new Error("No response from Gemini");
    
    return JSON.parse(content) as ConversationData;
  } catch (error: any) {
    throw error;
  }
};

export const generateScript = async (url: string): Promise<ConversationData> => {
  const prompt = HINGLISH_PROMPT.replace("{url}", url);

  // Try Gemini 2.0 Flash first (primary - best variety)
  let result: ConversationData;
  try {
    result = await generateScriptWithGemini(prompt);
    result.modelUsed = 'gemini' as const;
  } catch (geminiError) {
    console.warn("⚠️ Gemini failed, falling back to Groq:", geminiError);
    
    // Fallback to Groq/LLaMA if Gemini fails (rate limit, network error, etc.)
    result = await generateScriptWithGroq(prompt);
    result.modelUsed = 'groq' as const;
  }
  
  // POST-PROCESSING PIPELINE
  console.log('🧹 Applying TTS cleanup to generated script...');
  result.script = cleanScriptForTTS(result.script);
  
  // Validate length constraints
  console.log('⏱️ Validating script duration...');
  const validation = validateScriptLength(result.script);
  console.log(`📊 Script stats: ${validation.exchangeCount} exchanges, ${validation.wordCount} words, ${validation.duration.toFixed(1)}s`);
  
  if (validation.warnings.length > 0) {
    console.log('⚠️ Validation warnings:', validation.warnings);
  }
  
  // Truncate if exceeds 2 minutes
  if (validation.duration > 120) {
    result.script = truncateScriptTo2Minutes(result.script);
  }
  
  return result;
};

// ============================================
// SCRIPT IMPROVEMENT WITH FEEDBACK
// Takes existing script + user feedback and regenerates an improved version
// ============================================
export const improveScript = async (
  currentScript: ScriptPart[],
  feedback: string,
  title: string,
  sourceUrl?: string
): Promise<ConversationData> => {
  // Format current script for the prompt
  const formattedScript = currentScript
    .map((line) => `${line.speaker}: "${line.text}"`)
    .join('\n');

  const groqClient = getGroqClient();
  if (!groqClient) {
    throw new Error("Groq API key is not configured. Please add VITE_GROQ_API_KEY to your .env file.");
  }

  const response = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are improving a Hinglish podcast script based on user feedback.

SPEAKERS:
- ANJALI = Lead anchor / Expert (confident, articulate, guides conversation)
- RAHUL = Co-host / Sidekick (energetic, curious, asks smart questions)
Both are PROFESSIONALS - smooth, polished, like Radio Mirchi RJs.

ANTI-PATTERNS — NEVER DO THESE:
❌ NEVER start with fillers (Hmm, Actually, Well, See)
❌ NEVER use "yaar" more than 2-3 times total
❌ NEVER repeat the same reaction twice
❌ NEVER use empty reactions ("Wow!", "Crazy!" alone)

CONVERSATION STRUCTURE (14-20 exchanges, 1:45-2:00 mins):
- Lines 1-2: EMOTIONAL OPENING — personal, curious, NO FACTS
- Lines 3-17: FACT-REACTION PAIRS — max 2 facts per turn, react after each
- Lines 18-20: REFLECTIVE CLOSING — open-ended thought, NO NEW FACTS

MAINTAIN:
- Same topic and speakers (Rahul & Anjali)
- Hinglish style (60% Hindi, 40% English)
- 14-20 exchanges total (1:45-2:00 mins, 262-300 words)
- Professional radio host vibe

TTS RULES:
- Numbers: Always digits ("1975", "291 runs")
- ONE comma after greetings only
- NO commas in person names or Hindi phrases

Return ONLY valid JSON: {"title": "...", "script": [...]}`
      },
      {
        role: "user",
        content: `CURRENT SCRIPT:
Title: "${title}"
${sourceUrl ? `Source: ${sourceUrl}` : ''}

${formattedScript}

USER FEEDBACK:
${feedback}

Please improve this script based on the feedback. Return JSON:
{
  "title": "...",
  "script": [
    {"speaker": "Rahul", "text": "..."},
    {"speaker": "Anjali", "text": "..."}
  ]
}`
      }
    ],
    temperature: 0.85,
    max_tokens: 4096,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Groq");

  const result = JSON.parse(content) as ConversationData;
  result.sourceUrl = sourceUrl;
  
  // POST-PROCESSING: Clean improved script for TTS optimization
  console.log('🧹 Applying TTS cleanup to improved script...');
  result.script = cleanScriptForTTS(result.script);
  
  // Validate and truncate improved script
  console.log('⏱️ Validating improved script duration...');
  const validation = validateScriptLength(result.script);
  console.log(`📊 Script stats: ${validation.exchangeCount} exchanges, ${validation.wordCount} words, ${validation.duration.toFixed(1)}s`);
  
  if (validation.warnings.length > 0) {
    console.log('⚠️ Validation warnings:', validation.warnings);
  }
  
  if (validation.duration > 120) {
    result.script = truncateScriptTo2Minutes(result.script);
  }
  
  return result;
};

// Helper to convert stream to array buffer
async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result.buffer;
}

// ============================================
// CASUAL EMOTION HANDLING - Natural Hinglish Style
// ============================================

// Randomize from array for variety
export const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

// Casual, varied expressions for each emotion
// Aligned with conversational_audio_script_guidelines_v2.md
export const EMOTION_EXPRESSIONS = {
  // Laughter variations
  // Use 'hah' for small laugh (single syllable, TTS interprets better than 'haha')
  laughs: [
    'hah',
    'hahaha', 
    'ahahaha',
    'hehe yaar',
    'hah arrey',
  ],
  giggles: [
    'hehe',
    'hihi', 
    'hehehe',
    'tee-hee',
  ],
  chuckles: [
    'heh',
    'heh heh',
    'hmph',
  ],
  // Emotional reactions
  surprised: [
    'arey',
    'arrey wah',
    'oho',
    'kya',
    'arre',
    'haww',
  ],
  excited: [
    'yaar',
    'wah',
    'kya baat hai',
    'amazing yaar',
  ],
  thinking: [
    'hmm',
    'ummm',
    'hmm let me think',
    'achcha',
    'matlab',
  ],
  happy: [
    'nice',
    'bahut badhiya',
    'mast',
  ],
  curious: [
    'achcha',
    'ohh',
    'hmm interesting',
  ],
  impressed: [
    'wah wah',
    'kya baat',
    'zabardast',
    'awesome yaar',
  ],
  sad: [
    'ohh',
    'arey yaar',
    'hmm sad',
  ],
  confused: [
    'hain',
    'kya matlab',
    'wait what',
    'samjha nahi',
  ],
  // New markers from v2 guidelines
  skeptical: [
    'hmm',
    'I don\'t know yaar',
    'dekho',
    'matlab',
  ],
  serious: [
    '', // Just remove marker, tone carries through context
  ],
  'lower voice': [
    '', // Just remove marker, TTS handles naturally
  ],
  sighs: [
    'haah',
    'uff',
    'khair',
    '', // Sometimes just remove
  ],
  // Pause markers - converted to natural speech pauses
  '.': [''], // Micro pause - just a brief stop
  'pause': [''], // Thinking pause
  'breath': [''], // Inhale - natural pause
};

/**
 * Generate a pause pattern using punctuation.
 * ElevenLabs reacts best to punctuation, not expressions.
 */
function generatePauseCluster(): string {
  // Use ellipsis with space for thinking pause (ElevenLabs interprets this naturally)
  return '... ';
}

/**
 * Generate a mid-sentence pause using punctuation.
 */
function generateMidPause(): string {
  // Mid-sentence pause - use comma with space for natural break
  return ', ';
}

/**
 * Enhance micro-interruptions in script for natural podcast feel.
 * Uses em dash (—) with space for interruptions - ElevenLabs interprets this naturally.
 */
export function enhanceMicroInterruptions(script: ScriptPart[]): ScriptPart[] {
  const modifiedScript = script.map(line => {
    let text = line.text;
    
    // Look for patterns that could be enhanced with interruptions
    // Pattern: sentences ending with "—" or "..." that could be self-corrected
    const dashPattern = /([^—]+)—\s*$/;
    const ellipsisPattern = /([^…]+)…\s*$/;
    
    // Randomly enhance 10-20% of lines that could benefit from interruptions
    if (Math.random() < 0.15 && (dashPattern.test(text) || ellipsisPattern.test(text))) {
      const interruptionPhrases = [
        '— actually, wait',
        '— arre, pehle yeh bata',
        '— hmm, let me think',
        '— no wait, that\'s not right',
        '— actually, scratch that'
      ];
      
      const interruption = pickRandom(interruptionPhrases);
      
      // Add interruption after dash or ellipsis (em dash with space for ElevenLabs)
      if (dashPattern.test(text)) {
        text = text.replace(dashPattern, `$1${interruption} `);
      } else if (ellipsisPattern.test(text)) {
        text = text.replace(ellipsisPattern, `$1${interruption} `);
      }
    }
    
    return { ...line, text };
  });
  
  return modifiedScript;
}

// Thinking noise fillers for natural podcast feel
// Used to inject "uh", "hmm", "you know", "actually" at strategic points
const THINKING_NOISE_FILLERS = [
  'uh',
  'hmm',
  'um',
  'you know',
  'actually',
  'like',
  'I mean',
  'well',
  'so',
];

/**
 * Inject thinking noise (fillers) into script for natural podcast feel.
 * Adds 1-2 fillers per 30 seconds, randomized placement.
 * Respects existing markers and doesn't add fillers where they already exist.
 */
export function injectThinkingNoise(script: ScriptPart[]): ScriptPart[] {
  // Calculate target number of fillers: 1-2 per 30 seconds
  // Assuming average 60-second script, target 2-4 fillers total
  const estimatedDurationSeconds = script.length * 5; // Rough estimate: 5 seconds per line
  const targetFillers = Math.max(1, Math.floor(estimatedDurationSeconds / 30) * 2);
  
  // Don't add too many fillers
  const maxFillers = Math.min(targetFillers, Math.floor(script.length * 0.3)); // Max 30% of lines
  
  if (maxFillers === 0) return script;
  
  const modifiedScript = [...script];
  const fillerIndices = new Set<number>();
  
  // Randomly select lines to add fillers (avoid first and last lines)
  while (fillerIndices.size < maxFillers && fillerIndices.size < script.length - 2) {
    const index = Math.floor(Math.random() * (script.length - 2)) + 1; // Skip first and last
    if (!fillerIndices.has(index)) {
      fillerIndices.add(index);
    }
  }
  
  // Add fillers at natural insertion points
  fillerIndices.forEach(index => {
    const line = modifiedScript[index];
    const text = line.text;
    
    // Skip if line already has fillers or emotion markers
    if (/\(laughs?\)|\(giggles?\)|\(uh\)|\(hmm\)|\(um\)/i.test(text)) {
      return;
    }
    
    // Find natural insertion points: after commas, before conjunctions, or mid-sentence
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return;
    
    // Pick a random sentence to modify
    const sentenceIndex = Math.floor(Math.random() * sentences.length);
    let sentence = sentences[sentenceIndex];
    
    // Find insertion point: after first comma, or before a conjunction, or mid-sentence
    let insertionPoint = -1;
    const commaIndex = sentence.indexOf(',');
    const andIndex = sentence.toLowerCase().indexOf(' and ');
    const butIndex = sentence.toLowerCase().indexOf(' but ');
    
    if (commaIndex > 0 && commaIndex < sentence.length * 0.7) {
      // Insert after comma
      insertionPoint = commaIndex + 1;
    } else if (andIndex > 0) {
      // Insert before "and"
      insertionPoint = andIndex;
    } else if (butIndex > 0) {
      // Insert before "but"
      insertionPoint = butIndex;
    } else if (sentence.length > 20) {
      // Insert mid-sentence (around 40-60% through)
      insertionPoint = Math.floor(sentence.length * (0.4 + Math.random() * 0.2));
    }
    
    if (insertionPoint > 0) {
      const filler = pickRandom(THINKING_NOISE_FILLERS);
      const before = sentence.slice(0, insertionPoint).trim();
      const after = sentence.slice(insertionPoint).trim();
      
      // Reconstruct sentence with filler
      sentences[sentenceIndex] = `${before} ${filler} ${after}`;
      
      // Reconstruct full text
      const textParts = text.split(/[.!?]+/);
      textParts[sentenceIndex] = sentences[sentenceIndex];
      modifiedScript[index] = {
        ...line,
        text: textParts.join('')
      };
    }
  });
  
  return modifiedScript;
}

/**
 * Add controlled imperfection to script for natural podcast feel.
 * Randomly rushes one sentence, lets another trail off, over-emphasizes one word.
 * Only applies to 10-15% of lines.
 */
export function addControlledImperfection(script: ScriptPart[]): ScriptPart[] {
  const modifiedScript = [...script];
  const targetPercentage = 0.12; // 12% of lines
  const numLinesToModify = Math.max(1, Math.floor(script.length * targetPercentage));
  
  const modifiedIndices = new Set<number>();
  
  while (modifiedIndices.size < numLinesToModify && modifiedIndices.size < script.length) {
    const index = Math.floor(Math.random() * script.length);
    if (!modifiedIndices.has(index)) {
      modifiedIndices.add(index);
    }
  }
  
  modifiedIndices.forEach(index => {
    const line = modifiedScript[index];
    let text = line.text;
    const modificationType = Math.random();
    
    if (modificationType < 0.33) {
      // Rushed sentence: add slight urgency marker or remove some pauses
      // This will be handled by TTS naturally if we add a marker
      if (!text.includes('(rushed)')) {
        // Add a subtle marker that suggests faster pace
        text = text.replace(/^(.{0,20})/, '$1(rushed) ');
      }
    } else if (modificationType < 0.66) {
      // Trailing off: add ellipsis with space at end (punctuation for ElevenLabs)
      if (!text.endsWith('...') && !text.endsWith('(pause)')) {
        text = text.trim() + '... ';
      }
    } else {
      // Over-emphasis: add emphasis marker to a key word
      // Find a noun or important word to emphasize
      const words = text.split(/\s+/);
      if (words.length > 3) {
        // Pick a word in the middle (not first or last)
        const wordIndex = Math.floor(Math.random() * (words.length - 2)) + 1;
        const word = words[wordIndex];
        // Add emphasis by repeating or capitalizing (TTS will interpret)
        words[wordIndex] = word.toUpperCase();
        text = words.join(' ');
      }
    }
    
    modifiedScript[index] = { ...line, text };
  });
  
  return modifiedScript;
}

// Convert number to English words for TTS pronunciation
/**
 * PODCAST MODE: Hindi pronunciation enhancement DISABLED.
 * 
 * Rationale: ElevenLabs multilingual v2 model handles Hinglish naturally without
 * phonetic spelling hacks. Forcing phonetics like "Mum-bye", "I. P. L.", "ach-cha"
 * causes TTS confusion and pronunciation artifacts.
 * 
 * Let the model infer natural pronunciation from context. Clean text works better
 * than phonetic manipulation.
 * 
 * @deprecated This function is disabled in podcast mode - returns text unchanged
 */
function enhanceHindiPronunciation(text: string): string {
  // PODCAST MODE: Disabled - return text unchanged
  // ElevenLabs handles Hinglish naturally without spelling hacks
  return text;
  
  /* DISABLED PHONETIC HACKS (kept for reference only):
  
  const hindiPhonetics: Record<string, string> = {
    // ❌ These cause TTS confusion and pronunciation artifacts
    'Delhi': 'Dilli',
    'Mumbai': 'Mum-bye',        // ❌ Sounds unnatural
    'IPL': 'I. P. L.',           // ❌ Over-emphasized
    'achcha': 'ach-cha',         // ❌ Forced pause
    'matlab': 'mut-lub',         // ❌ Wrong pronunciation
    'bilkul': 'bil-kul',         // ❌ Unnecessary splitting
    // ... etc
  };
  
  // ❌ Anti-pattern: Let ElevenLabs infer pronunciation naturally instead
  */
}

function numberToWords(num: number, isYear: boolean = false): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 
                'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
                'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  
  if (num === 0) return 'zero';
  
  // Handle all years (4-digit numbers) with specific pronunciation rules
  if (isYear) {
    // Years 2000-2019: "two thousand X" format
    if (num >= 2000 && num < 2020) {
      if (num === 2000) {
        return 'two thousand';
      }
      const lastTwoDigits = num % 100;
      // For 2001-2009: "two thousand one", "two thousand two", etc.
      if (lastTwoDigits < 10) {
        return 'two thousand ' + ones[lastTwoDigits];
      }
      // For 2010-2019: "two thousand ten", "two thousand eleven", etc.
      return 'two thousand ' + ones[lastTwoDigits];
    }
    
    // Years 2020+: split format (e.g., 2024 → "twenty twenty-four")
    // Years before 2000: split format (e.g., 1975 → "nineteen seventy-five")
    const firstTwo = Math.floor(num / 100);
    const lastTwo = num % 100;
    
    // Handle first two digits (century)
    let firstPart = '';
    if (firstTwo < 20) {
      firstPart = ones[firstTwo];
    } else {
      const ten = Math.floor(firstTwo / 10);
      const one = firstTwo % 10;
      // Use hyphen for compound numbers (21-99), e.g., "twenty-four" in 2024
      firstPart = tens[ten] + (one > 0 ? '-' + ones[one] : '');
    }
    
    // Handle last two digits
    let secondPart = '';
    if (lastTwo === 0) {
      // For years ending in 00 before 2000, use "hundred" (e.g., 1900 = "nineteen hundred")
      secondPart = 'hundred';
    } else if (lastTwo < 20) {
      secondPart = ones[lastTwo];
    } else {
      const ten = Math.floor(lastTwo / 10);
      const one = lastTwo % 10;
      // Use hyphen for compound numbers (21-99), e.g., "twenty-three", "ninety-eight"
      secondPart = tens[ten] + (one > 0 ? '-' + ones[one] : '');
    }
    
    return firstPart + ' ' + secondPart;
  }
  
  if (num < 20) return ones[num];
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    return tens[ten] + (one > 0 ? ' ' + ones[one] : '');
  }
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    return ones[hundred] + ' hundred' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (num < 1000000) {
    const thousand = Math.floor(num / 1000);
    const remainder = num % 1000;
    return numberToWords(thousand) + ' thousand' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  if (num < 1000000000) {
    const million = Math.floor(num / 1000000);
    const remainder = num % 1000000;
    return numberToWords(million) + ' million' + (remainder > 0 ? ' ' + numberToWords(remainder) : '');
  }
  // For very large numbers, convert digit by digit
  return num.toString().split('').map(d => ones[parseInt(d)]).join(' ');
}

export function cleanTextForTTS(text: string): string {
  let cleaned = text;
  
  // ============================================
  // PROSODY ENHANCEMENTS - Apply before other processing
  // ============================================
  
  // 1. Reduce excitement after nouns with exclamation marks
  // Pattern: Proper noun followed by exclamation → convert to comma for calmer tone
  // Example: "Zhang Jun!" → "Zhang Jun,"
  cleaned = cleaned.replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*!/g, '$1,');
  
  // ⚠️ REMOVED: These patterns were adding commas that we're trying to remove!
  // OLD CODE (REMOVED):
  // // 2. Add micro-pause after name greetings at start of sentence
  // // Pattern: "Yaar <Name>" or "<Name>" at sentence start → ensure comma for natural pause
  // // Example: "Yaar Anjali kal raat" → "Yaar Anjali, kal raat"
  // cleaned = cleaned.replace(/^(Yaar\s+[A-Z][a-z]+)(\s+[^,])/g, '$1,$2');
  // cleaned = cleaned.replace(/^([A-Z][a-z]+)(\s+[^,])/g, '$1,$2');
  
  // 3. Soften over-curious questions - reduce hyper energy
  // Pattern: "Kya baat hai?" followed by excited text → add calming pause
  // Example: "Kya baat hai? Batao" → "Kya baat hai. Batao"
  cleaned = cleaned.replace(/Kya baat hai\?\s+/gi, 'Kya baat hai. ');
  
  // 4. Add wondering pause for "Achcha" when learning (not at end)
  // Pattern: "Achcha" followed by fact → add ellipsis for contemplative pause
  // Example: "Achcha BWF" → "Achcha... BWF"
  cleaned = cleaned.replace(/\b(Achcha|achcha)\s+([A-Z])/g, '$1... $2');
  
  // ============================================
  // HINDI PRONUNCIATION - Apply phonetic enhancements first
  // ============================================
  cleaned = enhanceHindiPronunciation(cleaned);
  
  // ============================================
  // NUMBERS - SELECTIVE CONVERSION FOR ENGLISH PRONUNCIATION
  // ============================================
  // ⚠️ STRATEGY: Convert ONLY years (4-digit numbers) to English words for clear pronunciation.
  // Keep other numbers (capacities, scores) as numerals.
  // 
  // Rationale:
  // 1. Years like "2010" need English pronunciation: "twenty ten" (not Hindi "do hazaar das")
  // 2. The multilingual TTS model reads numerals based on surrounding context
  // 3. In Hinglish, years in digit form may be read in Hindi, which sounds unnatural
  // 4. Stats/capacities like "50000" should stay as numerals for clarity
  //
  // NEW BEHAVIOR:
  // - Convert: 2010 → "twenty ten" (year format)
  // - Keep: 50000 (capacity), 205 (score), 27 (runs) as-is
  
  // Convert ONLY 4-digit numbers that look like years (1900-2099)
  cleaned = cleaned.replace(/\b(\d{4})\b/g, (match) => {
    const num = parseInt(match, 10);
    // Only convert if it's a reasonable year (1900-2099)
    if (num >= 1900 && num < 2100) {
      return numberToWords(num, true); // true = year format
    }
    return match; // Keep non-year 4-digit numbers as-is
  });
  
  // ============================================
  // PAUSE MARKERS - Convert to punctuation (ElevenLabs reacts best to punctuation)
  // ============================================
  
  // Micro pause (.) - brief hesitation → comma with space
  cleaned = cleaned.replace(/\(\.\)/g, ', ');
  
  // Thinking pause (pause) - longer pause → ellipsis with space
  cleaned = cleaned.replace(/\(pause\)/gi, '... ');
  
  // Mid-sentence pause (mid) - natural break → comma with space
  cleaned = cleaned.replace(/\(mid\)/gi, ', ');
  
  // Breath (breath) - inhale before emotional shift → comma with space
  cleaned = cleaned.replace(/\(breath\)/gi, ', ');
  
  // ============================================
  // EMOTION MARKERS - Replace with expressions (with spaces for ElevenLabs)
  // ============================================
  
  // Laughter variations - add spaces around for natural TTS interpretation
  cleaned = cleaned.replace(/\(laughs\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.laughs)} `);
  cleaned = cleaned.replace(/\(giggles\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.giggles)} `);
  cleaned = cleaned.replace(/\(chuckles\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.chuckles)} `);
  
  // Sighs - emotional weight (with spaces)
  cleaned = cleaned.replace(/\(sighs\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.sighs)} `);
  
  // Surprise - casual Hindi expressions (with spaces)
  cleaned = cleaned.replace(/\(surprised\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.surprised)} `);
  
  // Excitement - enthusiastic but natural (with spaces)
  cleaned = cleaned.replace(/\(excited\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.excited)} `);
  
  // Thinking - casual fillers (with spaces)
  cleaned = cleaned.replace(/\(thinking\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.thinking)} `);
  
  // Skeptical - doubtful tone (with spaces)
  cleaned = cleaned.replace(/\(skeptical\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.skeptical)} `);
  
  // Serious / Lower voice - just remove, context carries tone
  cleaned = cleaned.replace(/\(serious\)/gi, '');
  cleaned = cleaned.replace(/\(lower voice\)/gi, '');
  
  // Other emotions (with spaces)
  cleaned = cleaned.replace(/\(happy\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.happy)} `);
  cleaned = cleaned.replace(/\(curious\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.curious)} `);
  cleaned = cleaned.replace(/\(impressed\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.impressed)} `);
  cleaned = cleaned.replace(/\(sad\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.sad)} `);
  cleaned = cleaned.replace(/\(confused\)/gi, () => ` ${pickRandom(EMOTION_EXPRESSIONS.confused)} `);
  
  // ============================================
  // MICRO-PAUSES - Add natural hesitations for human-like speech
  // ============================================
  
  // Add brief pauses before conjunctions and transition words (if not already present)
  cleaned = cleaned.replace(/\s+(actually|but|so|however|though)\b/gi, (match, word) => {
    // Only add comma if there isn't already punctuation before it
    return `, ${word}`;
  });
  
  // Add thinking pauses before Hindi filler words and transitions
  // NOTE: "matlab" is excluded - don't add ellipsis before matlab
  cleaned = cleaned.replace(/\b(toh|basically|you know|I mean)\b/gi, (match) => {
    return `... ${match}`;
  });
  
  // ⚠️ REMOVED: This pattern was adding commas that we're trying to remove!
  // OLD CODE (REMOVED):
  // cleaned = cleaned.replace(/\b(a-rey|ach-cha|yaar)\b/gi, (match) => {
  //   return `${match},`;
  // });
  
  // ============================================
  // AGGRESSIVE COMMA CLEANUP - TTS-specific fixes
  // ============================================
  
  // Pattern 5A: Remove commas in common Hindi phrases like "Kya baat hai"
  cleaned = cleaned.replace(/\b(Kya|kya),\s+(baat)\b/gi, '$1 $2');
  cleaned = cleaned.replace(/\b(Main|main),\s+(baat)\b/gi, '$1 $2');
  cleaned = cleaned.replace(/\b(Kya|kya),\s+(journey)\b/gi, '$1 $2');
  
  // Pattern 5B: Remove commas after common English fillers/starters when followed by Hindi
  // Examples: "Exactly, 2013" -> "Exactly. 2013"
  //           "Wait, 2013" -> "Wait… 2013"
  cleaned = cleaned.replace(/\b(Exactly|Wait|So|But|I mean),\s+(\d{4}|[A-Z][a-z]+)\b/g, (match, p1, p2) => {
    if (p1.toLowerCase() === 'wait') return `${p1}… ${p2}`; // "Wait..." for thinking
    return `${p1}. ${p2}`; // "Exactly." for full stop
  });
  
  // Pattern 5C: Remove commas before common Hindi conjunctions/prepositions
  // Examples: "Kamaal, ki" -> "Kamaal ki"
  cleaned = cleaned.replace(/([a-zA-Z0-9]),\s+(ki|ka|ke|mein|se|ne|ko|aur|toh)\b/gi, '$1 $2');
  
  // Pattern 5D: Clean up year lists with trailing commas
  // Examples: "2013, 2015," -> "2013, 2015 aur"
  cleaned = cleaned.replace(/(\d{4}),\s*(\d{4}),\s*$/g, '$1 aur $2');
  cleaned = cleaned.replace(/(\d{4}),\s*$/g, '$1'); // Remove single trailing comma after a year
  
  // Pattern 5E: Remove "True, that."
  cleaned = cleaned.replace(/\bTrue,\s+that\./gi, 'True.');
  
  // Pattern 5F: Remove double commas (e.g., "Yaar,, Anjali")
  cleaned = cleaned.replace(/,,+/g, ',');
  
  // Pattern 5G: Remove comma after "Yaar" if followed by a name and another comma
  // Example: "Yaar, Anjali," -> "Yaar Anjali,"
  cleaned = cleaned.replace(/\b(Yaar|yaar),\s+([A-Z][a-z]+),\s*/g, '$1 $2, ');
  
  // Pattern 5H: Remove comma after "Yaar" if followed by a name and no other punctuation
  // Example: "Yaar, Anjali" -> "Yaar Anjali"
  cleaned = cleaned.replace(/\b(Yaar|yaar),\s+([A-Z][a-z]+)\b/g, '$1 $2');
  
  // Pattern 1: Proper Noun Commas - Remove commas between capitalized words
  // Examples: "Chennai, Super Kings" -> "Chennai Super Kings"
  //           "Gujarat, Titans" -> "Gujarat Titans"
  //           "Chepauk, Stadium" -> "Chepauk Stadium"
  cleaned = cleaned.replace(/\b([A-Z][a-z]+),\s+([A-Z][a-z]+)\b/g, '$1 $2');
  
  // Pattern 2: Achcha Comma Pattern - Replace "Achcha, " with "Achha… "
  // Example: "Achcha, 2022 mein" -> "Achha… 2022 mein"
  cleaned = cleaned.replace(/\b(Achcha|achcha),\s+/g, 'Achha… ');
  
  // Pattern 3: Ellipsis-as-Glue - Remove ellipses used as connectors
  // Examples: "Isiliye, ... toh" -> "Isiliye toh"
  //           "... toh history" -> "toh history"
  //           "... matlab" -> "matlab" (remove ellipsis before matlab)
  cleaned = cleaned.replace(/,\s*\.\.\.\s*/g, ' '); // ", ..." -> " "
  cleaned = cleaned.replace(/\.\.\.\s+(toh|ki|mein|se|matlab)\b/gi, '$1 '); // "... toh" -> "toh", "... matlab" -> "matlab"
  
  // Pattern 4: Hindi Filler Commas - Remove commas after common Hindi fillers
  // Examples: "Haan, yaad aaya" -> "Haan yaad aaya"
  cleaned = cleaned.replace(/\b(Haan|haan),\s+([a-z])/gi, '$1 $2');
  
  // ============================================
  // CLEANUP
  // ============================================
  
  // Remove any remaining parenthetical markers
  cleaned = cleaned.replace(/\([^)]*\)/g, '');
  
  // Pattern 5 (General Cleanup): Remove commas before ellipses, normalize spacing, remove trailing commas
  cleaned = cleaned.replace(/,\s*\.\.\./g, '...'); // Remove comma before ellipsis
  cleaned = cleaned.replace(/\.\.\.\s+/g, '... '); // Normalize ellipsis spacing
  cleaned = cleaned.replace(/,\s*$/g, ''); // Remove trailing comma
  
  // Normalize multiple ellipses to triple (but keep space after)
  cleaned = cleaned.replace(/\.{4,}/g, '... ');
  
  // Handle controlled imperfection markers
  // (rushed) - suggests faster pace (remove marker, TTS will interpret context)
  cleaned = cleaned.replace(/\(rushed\)\s*/gi, '');
  
  // Clean up excessive whitespace (but preserve intentional multiple spaces in ellipsis)
  cleaned = cleaned.replace(/([^.]\s)\s+/g, '$1').trim();
  
  return cleaned;
}

/**
 * Apply professional audio mastering to improve podcast sound quality.
 * Industry-standard processing: normalization, compression, EQ, limiting.
 * Target: -18 LUFS loudness, multiband compression, frequency enhancement.
 */
async function applyAudioMastering(audioData: Uint8Array): Promise<Uint8Array> {
  try {
    console.log('🎚️ Applying audio mastering (normalization, compression, EQ, limiting)...');
    
    // Create offline audio context for processing
    const sampleRate = 44100;
    // Estimate sample count (MP3 at 192kbps ≈ 24000 bytes/sec, 2 bytes/sample)
    const estimatedSamples = Math.floor((audioData.length / 24000) * sampleRate);
    
    const audioContext = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
      1, // mono channel
      estimatedSamples,
      sampleRate
    );
    
    // Decode the MP3 data to AudioBuffer
    const arrayBuffer = audioData.buffer.slice(
      audioData.byteOffset,
      audioData.byteOffset + audioData.byteLength
    );
    
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Create source node
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Build professional audio processing chain
    
    // 1. Pre-gain for normalization (target -18 LUFS)
    const preGain = audioContext.createGain();
    preGain.gain.value = 1.5; // Boost before compression
    
    // 2. EQ Stage - Add warmth and presence
    // Low shelf: Boost 200-300Hz for warmth and body
    const lowShelf = audioContext.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 250;
    lowShelf.gain.value = 2; // +2dB warmth
    
    // High shelf: Boost 3-5kHz for presence and clarity
    const highShelf = audioContext.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 4000;
    highShelf.gain.value = 3; // +3dB presence
    
    // 3. Dynamics Compressor - Even out volume levels (multiband effect)
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24; // Start compressing at -24dB
    compressor.knee.value = 12; // Gentle compression knee
    compressor.ratio.value = 4; // 4:1 compression ratio
    compressor.attack.value = 0.005; // 5ms attack (fast)
    compressor.release.value = 0.25; // 250ms release (smooth)
    
    // 4. Limiter - Prevent clipping with -1dB ceiling
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0; // Hard knee for limiting
    limiter.ratio.value = 20; // Hard limiting
    limiter.attack.value = 0.001; // 1ms attack (instant)
    limiter.release.value = 0.1; // 100ms release
    
    // 5. Output gain - Final level at -1dB ceiling (0.89 linear)
    const outputGain = audioContext.createGain();
    outputGain.gain.value = 0.89; // -1dB ceiling prevents clipping
    
    // Connect the mastering chain:
    // Input → Pre-gain → Low EQ → High EQ → Compressor → Limiter → Output Gain → Output
    source
      .connect(preGain)
      .connect(lowShelf)
      .connect(highShelf)
      .connect(compressor)
      .connect(limiter)
      .connect(outputGain)
      .connect(audioContext.destination);
    
    // Start processing
    source.start(0);
    
    // Render the processed audio
    const renderedBuffer = await audioContext.startRendering();
    
    console.log('✅ Audio mastering complete');
    
    // Convert AudioBuffer back to byte array
    // Note: This returns PCM data, not re-encoded MP3
    // For full MP3 re-encoding, server-side processing would be needed
    const channelData = renderedBuffer.getChannelData(0);
    const samples = new Uint8Array(channelData.length * 2);
    
    // Convert float32 to int16 PCM
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      samples[i * 2] = int16 & 0xFF;
      samples[i * 2 + 1] = (int16 >> 8) & 0xFF;
    }
    
    return samples;
  } catch (error) {
    console.warn('⚠️ Audio mastering failed, using original audio:', error);
    return audioData; // Return original on error (graceful degradation)
  }
}

export const generateMultiSpeakerAudio = async (script: ScriptPart[]): Promise<AudioResult> => {
  // NOTE: Post-processing functions (enhanceMicroInterruptions, injectThinkingNoise, 
  // addControlledImperfection) have been REMOVED because the beat sheet prompt now 
  // instructs the LLM to place imperfections at specific beats. Random injection
  // would interfere with the carefully positioned imperfections.
  
  // Generate audio for each line and collect as array buffers
  const audioChunks: ArrayBuffer[] = [];
  const segmentByteLengths: number[] = [];
  const cleanedScript: ScriptPart[] = [];
  const outputFormat = getOutputFormat();
  
  // Log if using analysis-based settings
  if (audioAnalysisConfig) {
    console.log('🎯 Using audio analysis-based settings');
    console.log(`   Output format: ${outputFormat}`);
  }
  
  for (let i = 0; i < script.length; i++) {
    const part = script[i];
    const previousPart = i > 0 ? script[i - 1] : undefined;
    const voiceId = VOICE_IDS[part.speaker as keyof typeof VOICE_IDS];
    const voiceSettings = getVoiceSettings(part.speaker, part.text, i, script.length);
    
    const cleanedText = cleanTextForTTS(part.text);
    
    // Store cleaned text for display sync
    cleanedScript.push({
      speaker: part.speaker,
      text: part.text,
      cleanedText: cleanedText
    });
    
    console.log(`🎙️ Generating audio ${i + 1}/${script.length}: ${part.speaker}`);
    console.log(`   Text: ${cleanedText.substring(0, 50)}...`);
    console.log(`   Settings: stability=${voiceSettings.stability}, similarity_boost=${voiceSettings.similarity_boost}, style=${voiceSettings.style}`);
    
    // Retry logic for handling temporary timeouts
    let audioStream;
    let retries = 3;
    while (retries > 0) {
      try {
        const elevenLabsClient = getElevenLabsClient();
        const envKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
        
        if (!elevenLabsClient) {
          const isProduction = import.meta.env.PROD;
          const errorMessage = isProduction
            ? "ElevenLabs API key is not configured. Please add VITE_ELEVENLABS_API_KEY in Vercel project settings (Settings → Environment Variables) and redeploy."
            : "ElevenLabs API key is not configured. Please add VITE_ELEVENLABS_API_KEY to your .env file.";
          console.error("❌ ElevenLabs API key missing:", {
            hasKey: !!envKey,
            keyLength: envKey?.length || 0,
            keyPrefix: envKey?.substring(0, 5) || 'N/A',
            isProduction,
            env: import.meta.env.MODE
          });
          throw new Error(errorMessage);
        }
        
        // Additional validation before making the request
        if (!envKey || envKey.trim().length === 0) {
          throw new Error("ElevenLabs API key is empty. Please check your environment variables.");
        }
        audioStream = await elevenLabsClient.textToSpeech.convert(voiceId, {
          text: cleanedText,
          model_id: "eleven_multilingual_v2",
          output_format: "mp3_44100_128" as any,
          voice_settings: {
            stability: voiceSettings.stability,
            similarity_boost: voiceSettings.similarity_boost,
            style: voiceSettings.style,
            use_speaker_boost: voiceSettings.use_speaker_boost
          }
        });
        break; // Success, exit retry loop
      } catch (err: any) {
        retries--;
        
        // Enhanced error logging for 401 errors (authentication issues)
        if (err.status === 401 || err.message?.includes('401') || err.message?.includes('Unauthorized')) {
          const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;
          console.error('❌ ElevenLabs 401 Unauthorized Error:', {
            hasApiKey: !!apiKey,
            keyLength: apiKey?.length || 0,
            keyPrefix: apiKey?.substring(0, 8) || 'N/A',
            keySuffix: apiKey ? '...' + apiKey.substring(Math.max(0, apiKey.length - 8)) : 'N/A',
            isProduction: import.meta.env.PROD,
            errorMessage: err.message,
            errorStatus: err.status,
            suggestion: import.meta.env.PROD 
              ? 'Check Vercel Settings → Environment Variables → VITE_ELEVENLABS_API_KEY and redeploy'
              : 'Check your .env file for VITE_ELEVENLABS_API_KEY'
          });
        }
        
        if (retries === 0) {
          // Final error with helpful message
          if (err.status === 401 || err.message?.includes('401') || err.message?.includes('Unauthorized')) {
            const isProd = import.meta.env.PROD;
            const helpfulMessage = isProd
              ? 'ElevenLabs API key authentication failed. Please verify VITE_ELEVENLABS_API_KEY is set correctly in Vercel (Settings → Environment Variables) and redeploy. Check browser console for details.'
              : 'ElevenLabs API key authentication failed. Please verify VITE_ELEVENLABS_API_KEY in your .env file.';
            throw new Error(helpfulMessage);
          }
          throw err;
        }
        console.log(`   ⚠️ Retry ${3 - retries}/3 after error: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds before retry
      }
    }
    
    // Convert the stream to array buffer
    const audioBuffer = await streamToArrayBuffer(audioStream as unknown as ReadableStream<Uint8Array>);
    audioChunks.push(audioBuffer);
    segmentByteLengths.push(audioBuffer.byteLength);
  }
  
  // Combine all audio chunks
  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  let combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  
  // Convert to base64 for mastering API
  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  let audioBase64 = btoa(binary);
  
  // Apply server-side audio mastering via Vercel API
  // This provides LUFS normalization, compression, and saturation (same as Python pipeline)
  try {
    console.log('🎚️ Applying audio mastering via API...');
    const masteringResponse = await fetch('/api/master-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64 })
    });
    
    if (masteringResponse.ok) {
      const masteringResult = await masteringResponse.json();
      if (masteringResult.success && masteringResult.audioBase64) {
        audioBase64 = masteringResult.audioBase64;
        console.log('✅ Audio mastering complete');
        console.log(`   Target LUFS: ${masteringResult.mastering?.targetLufs || -14}`);
      } else {
        console.warn('⚠️ Mastering API returned error, using raw audio:', masteringResult.error);
      }
    } else {
      console.warn('⚠️ Mastering API failed, using raw audio:', masteringResponse.status);
    }
  } catch (masteringError) {
    // Graceful degradation: if mastering fails, use unmastered audio
    console.warn('⚠️ Audio mastering unavailable, using raw audio:', masteringError);
  }
  
  // Calculate segment timings based on byte proportions
  // Account for context-dependent pause duration between segments
  
  // Determine bytes per second based on output format
  // mp3_44100_128 = 128kbps = 16000 bytes/second
  // mp3_22050_128 = 128kbps = 16000 bytes/second
  const BYTES_PER_SECOND = 16000; // 128kbps / 8
  const segmentTimings: SegmentTiming[] = [];
  let currentTime = 0;
  
  for (let i = 0; i < segmentByteLengths.length; i++) {
    const segmentDuration = segmentByteLengths[i] / BYTES_PER_SECOND;
    segmentTimings.push({
      index: i,
      start: currentTime,
      end: currentTime + segmentDuration,
      speaker: script[i].speaker
    });
    currentTime += segmentDuration;
    
    // Add context-dependent pause duration after each segment (except the last one)
    if (i < segmentByteLengths.length - 1) {
      const previousSpeaker = script[i].speaker;
      const nextSpeaker = script[i + 1].speaker;
      const previousText = script[i].text;
      const nextText = script[i + 1].text;
      const pauseDuration = getPauseDuration(
        previousSpeaker, 
        nextSpeaker, 
        i, 
        script.length,
        previousText,
        nextText
      );
      currentTime += pauseDuration;
    }
  }
  
  console.log('📊 Segment timings:', segmentTimings);
  
  return {
    audioBase64,
    segmentTimings,
    cleanedScript
  };
};

export const decodeAudio = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Decode MP3 audio using Web Audio API
export async function decodeAudioDataToBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  _sampleRate: number = 44100,
  _numChannels: number = 2
): Promise<AudioBuffer> {
  // For MP3 data, use the Web Audio API's built-in decoder
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return await ctx.decodeAudioData(arrayBuffer);
}
