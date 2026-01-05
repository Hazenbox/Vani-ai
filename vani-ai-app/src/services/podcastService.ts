
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
  if (!elevenlabs && import.meta.env.VITE_ELEVENLABS_API_KEY) {
    elevenlabs = new ElevenLabsClient({
      apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY
    });
  }
  return elevenlabs;
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
// CONTINUOUS CONVERSATION PROMPT SYSTEM v4.0
// Fact-First | Natural Flow | Industry-Standard Podcast
// ============================================
const HINGLISH_PROMPT = `
You are creating a 60-second Hinglish podcast conversation between two professional radio hosts.

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
│ FORBIDDEN COMMA PATTERNS (These WILL break TTS):                           │
│ ✗ "Yaar,, Anjali," → Creates robotic stutter                               │
│ ✗ "Kya, baat hai?" → Breaks Hindi question flow                            │
│ ✗ "Main, baat kar raha hoon" → Unnatural pause after subject               │
│ ✗ "Exactly, 2013, 2015," → Too many pauses, robotic listing                │
│ ✗ "Wait, 2013 mein" → Use "Wait… 2013 mein" (ellipsis, not comma)         │
│ ✗ "Kya, journey rahi hai" → Should be "Kya journey rahi hai"               │
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
│ FORBIDDEN PATTERNS:                                                         │
│ • "twenty sixteen", "twenty seventeen" ✗                                   │
│ • "thirty seven thousand" ✗                                                │
│ • "two ninety one" ✗                                                       │
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
│ Examples of CORRECT usage:                                                  │
│ • "Makes you wonder... what the future holds."                             │
│ • "That's... wow, I didn't expect that."                                   │
│                                                                             │
│ Examples of WRONG usage (ellipsis as glue, NOT thinking):                  │
│ • "Gujarat Lions ... Suresh Raina captain ... 2016 season ..." ✗           │
│   (structural gaps — sounds like reading bullet points)                    │
│ • "Most successful? ... I mean," ✗                                         │
│   (Use "Most successful? I mean" — no ellipsis as connector)               │
│ • "2013 mein ... toh unhone" ✗                                             │
│   (Use "2013 mein toh unhone" — ellipsis doesn't connect Hindi phrases)    │
│ • "highest valued ... toh yahi hai" ✗                                      │
│   (Remove ellipsis, use normal spacing)                                    │
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
│ Turn Structure Rules:                                                       │
│ • ONE idea → ONE reaction → NEXT speaker's turn ✓                          │
│ • React THEN ask follow-up (in next turn) ✓                                │
│ • NEVER stack: question + wow + excitement + new question ✗                │
│                                                                             │
│ Examples of stacked reactions (WRONG):                                      │
│ • "Wow! Amazing! That's crazy!" (3 reactions in one breath) ✗              │
│ • "Great! But what about X? And also Y?" (reaction + 2 questions) ✗        │
│                                                                             │
│ Why? Humans don't speak multiple emotions in one breath.                   │
│ Stacking = sounds scripted and unnatural.                                  │
└─────────────────────────────────────────────────────────────────────────────┘

📋 TTS PRE-SUBMISSION CHECKLIST (Run this BEFORE generating your script):

Before you write the JSON output, mentally perform these checks:

1. Search your draft for ",," → If found anywhere, FIX IT (always wrong)
2. Search for "twenty", "sixteen", "seventeen", "fifteen" → REPLACE with numerals
3. Look for commas in person names (e.g., "Smith,") → REMOVE them
4. Count commas in Hinglish phrases → If >1 per short phrase, REDUCE
5. Count ellipses in entire script → If >2, keep only thinking pauses
6. Check each turn → Does it have multiple reactions? Split them across turns
7. Mentally read aloud → Would TTS pronounce this naturally?

════════════════════════════════════════════════════════════════════════════════
SECTION 1: CORE PHILOSOPHY — FACT-FIRST CONVERSATIONS
════════════════════════════════════════════════════════════════════════════════

This is an INDUSTRY-STANDARD podcast. Think NPR, Spotify Original, or Radio Mirchi prime time.

GOLDEN RULES:
1. EVERY turn must contain at least ONE concrete fact (name, date, number, event)
2. NEVER start a sentence with a filler (Hmm, Actually, Well, See, Uh)
3. Reactions must REFERENCE something specific from the previous turn
4. NO empty reactions (avoid standalone "Wow!", "Crazy!", "Uff!")
5. Build conversation like a river — each turn flows from the previous

WHAT MAKES A GREAT PODCAST TURN:
✓ "1975 mein England mein hua tha, sirf 8 teams thi!" (fact-rich)
✓ "Wait, Clive Lloyd ki captaincy? That's the guy with 189 runs!" (builds on previous)
✓ "Haan, and West Indies ne Australia ko 17 runs se haraya final mein." (adds detail)

WHAT MAKES A BAD PODCAST TURN:
✗ "Hmm, actually let me think..." (filler-first, no content)
✗ "Wow, that's crazy!" (empty reaction)
✗ "So the thing is— actually, let me put it this way—" (mechanical self-correction)
✗ "But what about—" (incomplete thought with no purpose)

════════════════════════════════════════════════════════════════════════════════
SECTION 2: PERSONAS — WHO THEY ARE
════════════════════════════════════════════════════════════════════════════════

RAHUL & ANJALI — Two Friends, Equal Energy
├─ Both are casual, warm, and equally knowledgeable
├─ Neither is the "expert" or "student" — they're equals
├─ Both share facts AND react genuinely
├─ Same friendly energy, same conversational tone

RAHUL:
├─ Casual, friendly, shares what he discovered
├─ Warm opener: "Yaar Anjali, kal raat kuch interesting padha..."
├─ Reacts genuinely: "Wait, seriously? That's huge!"
└─ Also shares facts, not just asks questions

ANJALI:
├─ Equally casual, equally friendly
├─ Warm response: "Kya? Tell me yaar!"
├─ Shares facts conversationally, not as a teacher
└─ Also reacts genuinely, not just explains

Together: Two friends chatting over chai, equally excited about what they learned.

════════════════════════════════════════════════════════════════════════════════
SECTION 3: CONVERSATION FLOW — CONTINUOUS STRUCTURE
════════════════════════════════════════════════════════════════════════════════

The conversation flows CONTINUOUSLY. No rigid beats. Natural progression.

┌─────────────────────────────────────────────────────────────────────────────┐
│ SOFT OPENING (Lines 1-2) — Warm, Friendly Entry (EQUAL ENERGY)              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Energy: WARM, CASUAL (two friends settling into a chat)                     │
│                                                                             │
│ BOTH speakers should sound equally casual and friendly.                     │
│ Neither dominates — they're equals sharing excitement.                      │
│                                                                             │
│ Rahul opens with:                                                           │
│ ├─ Personal, casual hook (NO facts yet)                                    │
│ └─ Warm energy, like telling a friend something cool                       │
│                                                                             │
│ Anjali responds with:                                                       │
│ ├─ Equal casual energy (NOT expert explaining)                             │
│ └─ Genuine curiosity, like a friend who wants to hear more                 │
│                                                                             │
│ GOOD OPENER (equal energy):                                                 │
│ Rahul: "Yaar Anjali, kal raat randomly kuch padh raha tha...               │
│         something just blew my mind."                                       │
│ Anjali: "Kya yaar? Tell me tell me! You sound excited."                    │
│                                                                             │
│ BAD OPENER (unequal energy):                                                │
│ Rahul: "Yaar, pehla Cricket World Cup kab hua tha?" (passive, just asking) │
│ Anjali: "1975 mein hua tha England mein." (expert mode, too confident)     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ EXPLORATION (Lines 3-8) — Fact-Dense Exchange                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Energy: STEADY, ENGAGED (information-rich, natural rhythm)                  │
│                                                                             │
│ Each turn MUST:                                                             │
│ ├─ Add NEW information (fact, name, date, number, context)                 │
│ ├─ Reference something from the previous turn                              │
│ └─ Move the conversation forward                                           │
│                                                                             │
│ GOOD EXPLORATION:                                                           │
│ Rahul: "Clive Lloyd was the captain, right? And Vivian Richards bhi       │
│         us team mein the!"                                                  │
│ Anjali: "Exactly! Richards ne tournament mein 189 runs banaye. And the    │
│          final against Australia, West Indies ne 291 runs banaye."         │
│ Rahul: "291? That was massive for that era. Australia couldn't chase?"     │
│ Anjali: "Nope, 274 pe all out. 17 runs se haare. And you know what's      │
│          crazy? That final was at Lord's, sold out crowd."                 │
│                                                                             │
│ BAD EXPLORATION:                                                            │
│ Rahul: "But what about—"                                                   │
│ Anjali: "—the final? Let me tell you!"                                    │
│ Rahul: "Wow, that's amazing!"                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SOFT LANDING (Lines 9-11) — Reflective Close                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Energy: MEDIUM → LOW (settling, satisfied)                                  │
│                                                                             │
│ Final turns should:                                                         │
│ ├─ Reflect on significance or legacy                                       │
│ ├─ Make a connection to present/future                                     │
│ └─ End with open thought, not a question                                   │
│                                                                             │
│ GOOD LANDING:                                                               │
│ Anjali: "Cricket has evolved so much since 1975. From 8 teams to 14,      │
│          from 60 overs to 50, but the spirit of World Cup remains same."  │
│ Rahul: "True that. Looking forward to the next one. Those 1975 legends    │
│         set the standard for everything that came after."                  │
│                                                                             │
│ BAD LANDING:                                                                │
│ Rahul: "Hmm, you know, it's like... cricket has come so far..."           │
│ Anjali: "Bilkul, ab toh har saal World Cup hota hai!"                     │
└─────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
SECTION 4: ENERGY MANAGEMENT — FLAT WITH SOFT EDGES
════════════════════════════════════════════════════════════════════════════════

Energy should be CONSISTENT throughout, with soft start and soft end.

┌─────────────────────────────────────────────────────────────────────────────┐
│ ENERGY CURVE:                                                               │
│                                                                             │
│     ████████████████████████████████████                                   │
│   ██                                    ██                                 │
│ ██                                        ██                               │
│ ▲                                          ▲                               │
│ │                                          │                               │
│ SOFT START                              SOFT END                           │
│ (curious, warm)                    (reflective, open)                      │
│                                                                             │
│ Lines 1-2: Lower energy, inviting tone                                     │
│ Lines 3-8: Steady energy, engaged, information-rich                        │
│ Lines 9-11: Settling energy, thoughtful close                              │
└─────────────────────────────────────────────────────────────────────────────┘

AVOID:
├─ Explosive openings ("DUDE! You won't BELIEVE this!")
├─ Energy spikes mid-conversation
├─ Abrupt endings
└─ Monotone throughout

════════════════════════════════════════════════════════════════════════════════
SECTION 4.5: EMOTIONAL BEAT RULES (NON-NEGOTIABLE)
════════════════════════════════════════════════════════════════════════════════

These 3 rules make conversations feel HUMAN, not robotic:

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 1 — EMOTIONAL OPENING (Lines 1-2)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ First 2 lines must be personal, curious, warm.                              │
│ NO facts, numbers, dates, or places allowed in opening.                     │
│ Start like two friends settling into a conversation.                        │
│                                                                             │
│ GOOD OPENING:                                                               │
│ Rahul: "Yaar Anjali, kal raat randomly kuch padh raha tha...               │
│         something really caught my attention."                              │
│ Anjali: "Kya? Tell me tell me!"                                            │
│                                                                             │
│ BAD OPENING:                                                                │
│ Rahul: "1975 mein pehla World Cup hua England mein."                       │
│ (Jumps straight to facts - feels like reading Wikipedia)                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 2 — FACT-REACTION PAIRS (Lines 3-9)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ After any number > 100, year, or surprising statistic:                      │
│ → Next speaker MUST react emotionally BEFORE adding new information         │
│ → Maximum 2 facts per turn                                                  │
│                                                                             │
│ GOOD FACT-REACTION:                                                         │
│ Anjali: "Final mein West Indies ne 291 runs banaye."                       │
│ Rahul: "Two ninety one? Yaar, that's massive for that era!"                │
│ Anjali: "And Australia? 274 pe all out, 17 runs se haare."                 │
│ Rahul: "Uff, so close... imagine their faces."                             │
│                                                                             │
│ BAD FACT-DUMP:                                                              │
│ Anjali: "291 runs banaye. Australia 274 pe out. 17 runs se haare.         │
│          Final Lord's mein hua. 8 teams thi."                              │
│ (5 facts in one turn - sounds like reading a teleprompter)                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 3 — REFLECTIVE CLOSING (Lines 10-12)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Last 2-3 lines must be reflective, open-ended.                              │
│ NO new facts or statistics allowed in closing.                              │
│ End with a thought, not a conclusion.                                       │
│                                                                             │
│ GOOD CLOSING:                                                               │
│ Anjali: "Cricket has evolved so much since then..."                        │
│ Rahul: "Haan yaar, those 1975 legends had no idea what they were starting. │
│         Makes you wonder what the next 50 years will bring."               │
│ Anjali: "Hmm... something to think about."                                 │
│                                                                             │
│ BAD CLOSING:                                                                │
│ Rahul: "Ab toh 14 teams participate karti hai."                            │
│ Anjali: "Haan, aur T20 World Cup bhi hota hai."                            │
│ (Ends with facts - no emotional closure)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
SECTION 4.6: PROSODY AND EMOTIONAL MODULATION (NON-NEGOTIABLE)
════════════════════════════════════════════════════════════════════════════════

These rules ensure natural emotional expression and appropriate energy levels:

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 1 — GREETINGS WITH NAMES (Opening exchanges)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ When calling someone's name in opening dialogue:                            │
│ → Use warm, friendly tone (NOT overly excited or surprised)                 │
│ → Add natural pause after name for conversational feel                      │
│ → Sound like meeting a colleague warmly, not surprising them                │
│                                                                             │
│ GOOD GREETING:                                                              │
│ Rahul: "Yaar Anjali, kal raat main kuch random Wikipedia articles          │
│         padh raha tha... aur ek cheez ne mujhe seriously impress kiya."    │
│ (Warm, conversational - natural pause after "Anjali")                      │
│                                                                             │
│ BAD GREETING:                                                               │
│ Rahul: "Anjali! Guess what I found!"                                       │
│ (Too excited, sounds forced)                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 2 — EXCLAMATION MARKS - Use Sparingly                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ After nouns/facts: reduce excitement, keep professional                     │
│ → Factual statements should use periods, not exclamations                   │
│ → Reserve exclamations for genuine surprise/reaction only                   │
│                                                                             │
│ GOOD USAGE:                                                                 │
│ Anjali: "Zhang Jun. Aur Secretary-General Wang Xiaomu hain."               │
│ (Calm, informative)                                                         │
│                                                                             │
│ BAD USAGE:                                                                  │
│ Anjali: "Zhang Jun! Aur Secretary-General Wang Xiaomu hain!"               │
│ (Too excited for factual information)                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 3 — CURIOSITY MARKERS - Natural Questions                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ "Kya baat hai?" and similar questions: mildly curious, not overly excited   │
│ → Tone: interested friend asking, not shocked reporter                      │
│ → Keep moderate, conversational energy                                      │
│                                                                             │
│ GOOD CURIOSITY:                                                             │
│ Anjali: "Kya baat hai? Batao batao, you sound quite intrigued!"            │
│ (Gentle interest, friendly)                                                 │
│                                                                             │
│ BAD CURIOSITY:                                                              │
│ Anjali: "KYA BAAT HAI?! TELL ME NOW!"                                      │
│ (Hyper, forced excitement)                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RULE 4 — WONDERING EXPRESSIONS - Learning Moments                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ "Achcha" when learning a fact: wondering/thoughtful tone                    │
│ → Sound like processing new information, not just agreeing                  │
│ → Add brief pause before continuing with the fact                           │
│                                                                             │
│ GOOD WONDERING:                                                             │
│ Anjali: "Achcha, BWF aur BA dono se affiliation hai. No wonder China       │
│          ke players itne Olympic titles jeete hain."                        │
│ (Contemplative, connecting dots)                                            │
│                                                                             │
│ BAD WONDERING:                                                              │
│ Anjali: "Achcha! BWF aur BA dono se affiliation hai!"                      │
│ (Too excited, loses the thoughtful quality)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

SUMMARY - Prosody Guidelines:
├─ Greetings: Warm and friendly, not surprised or hyper
├─ Facts: Calm presentation with periods, not exclamations
├─ Questions: Genuinely curious, not shocked
└─ Learning: Thoughtful and contemplative, not reactive

════════════════════════════════════════════════════════════════════════════════
SECTION 5: NATURAL SPEECH PATTERNS (NOT Mechanical Imperfections)
════════════════════════════════════════════════════════════════════════════════

Instead of FORCING imperfections, let them emerge NATURALLY:

NATURAL PATTERNS TO USE:
├─ Mid-sentence pause: "West Indies ne, well, 291 runs banaye final mein."
├─ Trailing reflection: "Those were different times, simpler maybe..."
├─ Building on thought: "Actually no wait, Vivian Richards wasn't captain then, it was Clive Lloyd."
├─ Genuine surprise: "Wait, seriously? 17 runs se haare?"

MECHANICAL PATTERNS TO AVOID:
├─ Forced self-correction: "So the thing is— actually, let me put it this way—"
├─ Artificial handoffs: "But what about—" / "—exactly what I was thinking!"
├─ Filler-first sentences: "Hmm, actually, 1975 mein hua tha..."
├─ Empty reactions: "Uff!", "Baap re!", "Crazy!" (without substance)

════════════════════════════════════════════════════════════════════════════════
SECTION 6: FACT EXTRACTION REQUIREMENTS
════════════════════════════════════════════════════════════════════════════════

Before writing the script, extract these from the SOURCE URL:

REQUIRED FACTS (aim for 8-12 total in the script):
├─ Dates/Years: When did key events happen?
├─ Numbers: Statistics, counts, measurements
├─ Names: People, places, organizations
├─ Achievements: Records, awards, milestones
├─ Events: What happened? Key moments
└─ Context: Why does this matter?

FACT DISTRIBUTION (aligned with Emotional Beat Rules):
├─ Lines 1-2: NO FACTS (emotional opening only)
├─ Lines 3-9: 6-10 facts (fact-reaction pairs, max 2 per turn)
├─ Lines 10-12: NO NEW FACTS (reflective closing only)

════════════════════════════════════════════════════════════════════════════════
SECTION 7: TTS OPTIMIZATION
════════════════════════════════════════════════════════════════════════════════

ElevenLabs reacts to PUNCTUATION for natural pacing:

COMMA (, ) → Brief pause (0.2s) - Use for natural breathing
ELLIPSIS (... ) → Trailing thought (0.5s) - Use sparingly at end of reflections
PERIOD (.) → Full stop - Clean sentence boundary
EXCLAMATION (!) → Emphasis - Use for genuine excitement, not every sentence
QUESTION MARK (?) → Rising intonation - Natural for questions

NUMBERS — Always in English digits:
├─ Years: "1975", "2024"
├─ Money: "$87 million", "500 crore"
├─ Stats: "291 runs", "17 runs", "8 teams"

❌ NEVER USE: (pause), (laughs), (surprised), (excited), (thinking)
✓ USE: Natural Hinglish expressions integrated into sentences

════════════════════════════════════════════════════════════════════════════════
SECTION 7.5: TTS ANTI-EXAMPLES (What BAD Scripts Look Like)
════════════════════════════════════════════════════════════════════════════════

Learn from these mistakes. The examples below show EXACTLY what NOT to do.

┌─────────────────────────────────────────────────────────────────────────────┐
│ ❌ BAD SCRIPT EXAMPLE (Multiple TTS Issues)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Rahul: "Yaar,, Anjali,, kal raat,, main IPL, ke baare, mein padh raha tha. │
│         Something really interesting mila."                                  │
│                                                                             │
│ Anjali: "Kya, baat hai? Batao, batao!"                                     │
│                                                                             │
│ Rahul: "Remember Gujarat Lions? Woh team, jo twenty sixteen aur twenty     │
│         seventeen, ke seasons mein kheli thi."                              │
│                                                                             │
│ Anjali: "Achcha ... Gujarat Lions. Haan yaad aaya. Woh Chennai Super Kings│
│          aur Rajasthan Royals, ko replace kiya tha na, jab un par do saal │
│          ka ban laga tha?"                                                  │
│                                                                             │
│ Rahul: "Exactly. Unhone December twenty fifteen mein ... apni team form ki │
│         thi. Aur twenty sixteen mein Suresh, Raina captain the."           │
│                                                                             │
│ Anjali: "Nine, wins out of fourteen matches? Wow, that's brilliant!,       │
│          But playoffs mein kya hua tha?"                                    │
│                                                                             │
│ 🚨 PROBLEMS IN THIS SCRIPT:                                                 │
│ 1. Double commas: "Yaar,, Anjali,," → robotic micro-pauses                │
│ 2. Comma overload: "IPL, ke baare, mein" → breaks Hindi rhythm            │
│ 3. Spoken years: "twenty sixteen" → TTS hesitates, loses authority         │
│ 4. Ellipses for structure: "... apni team" → sounds incomplete            │
│ 5. Comma in name: "Suresh, Raina" → breaks the name                       │
│ 6. Stacked reactions: "Wow, that's brilliant!, But" → 3 emotions in one   │
│                                                                             │
│ TTS OUTPUT WOULD SOUND: Choppy, robotic, uncertain, unnatural              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ ✅ GOOD SCRIPT EXAMPLE (TTS-Optimized)                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Rahul: "Yaar Anjali, kal raat main IPL ke kuch puraane records dekh raha  │
│         tha. Ek team ke baare mein padha jo kaafi interesting lagi."       │
│                                                                             │
│ Anjali: "Kya baat hai? Batao batao, you sound quite intrigued!"            │
│                                                                             │
│ Rahul: "Remember Gujarat Lions? Woh team jo 2016 aur 2017 ke seasons mein │
│         kheli thi."                                                         │
│                                                                             │
│ Anjali: "Achha, Gujarat Lions. Haan yaad aaya. Woh Chennai Super Kings    │
│          aur Rajasthan Royals ko replace kiya tha na, jab un par do saal  │
│          ka ban laga tha?"                                                  │
│                                                                             │
│ Rahul: "Exactly. Unhone December 2015 mein apni team form ki thi. Aur     │
│         2016 mein Suresh Raina captain the."                               │
│                                                                             │
│ Anjali: "Nine wins out of fourteen matches? That's a brilliant debut       │
│          season."                                                           │
│                                                                             │
│ Rahul: "But playoffs mein unki luck achhi nahi thi."                       │
│                                                                             │
│ ✅ WHY THIS WORKS:                                                          │
│ 1. One comma after greeting: "Yaar Anjali, kal raat" → natural pause      │
│ 2. Hindi phrases flow: "IPL ke kuch puraane records" → no commas          │
│ 3. Numerals for years: "2016" → TTS reads correctly                       │
│ 4. No ellipses for structure → facts flow naturally                       │
│ 5. Names intact: "Suresh Raina" → no comma                                │
│ 6. One reaction per turn: separate excitement from next question          │
│                                                                             │
│ TTS OUTPUT WOULD SOUND: Natural, confident, conversational, professional   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SIDE-BY-SIDE COMPARISON: Same Content, Different TTS Impact                │
├─────────────────────────────────────────────────────────────────────────────┤
│ ❌ BAD: "Yaar,, Anjali,, twenty sixteen mein, Steven, Smith ne ..."        │
│ ✅ GOOD: "Yaar Anjali, 2016 mein Steven Smith ne ..."                      │
│                                                                             │
│ ❌ BAD: "Nine, wins? Wow! Amazing! But what about ...?"                    │
│ ✅ GOOD: "Nine wins? That's amazing." (next turn) "What about ...?"        │
│                                                                             │
│ ❌ BAD: "December twenty fifteen mein ... toh team form hui ..."           │
│ ✅ GOOD: "December 2015 mein team form hui thi."                           │
│                                                                             │
│ ❌ BAD: "Kya, baat hai? Tell me, tell me!"                                 │
│ ✅ GOOD: "Kya baat hai? Tell me tell me!"                                  │
└─────────────────────────────────────────────────────────────────────────────┘

⚠️ REMEMBER: Your script is NOT for reading, it's for LISTENING.
   Bad formatting = Bad audio = Failed podcast.

════════════════════════════════════════════════════════════════════════════════
SECTION 8: ANTI-PATTERNS (STRICTLY FORBIDDEN)
════════════════════════════════════════════════════════════════════════════════

❌ FILLER-FIRST SENTENCES:
├─ "Hmm, actually..." → Start with the fact instead
├─ "Well, you know..." → Start with the content
├─ "So basically..." → Just say it directly
├─ "Achcha, toh..." → Lead with information

❌ EMPTY REACTIONS:
├─ "Wow!" / "Crazy!" / "Uff!" (alone, without substance)
├─ "That's amazing!" (without adding anything)
├─ "Baap re!" (as a complete turn)
└─ Instead: "Wait, 17 runs se haare? That's so close!"

❌ MECHANICAL PATTERNS:
├─ "So the thing is— actually, let me put it this way—"
├─ "But what about—" / "—exactly!"
├─ Multiple trailing: "It's... kind of... complicated..."
├─ Clustered fillers: "Hmm, uh, you know, actually..."

❌ GENERIC DIALOGUE:
├─ Rahul just agreeing: "Haan yaar, sahi kaha"
├─ Long monologues (>3 sentences per turn)
├─ Template phrases: "Arey tune suna?"
└─ Same reaction used twice in script

════════════════════════════════════════════════════════════════════════════════
SECTION 9: OUTPUT FORMAT
════════════════════════════════════════════════════════════════════════════════

Return ONLY valid JSON. No markdown. No explanation.

{
  "title": "Catchy Hinglish title specific to THIS content",
  "script": [
    {"speaker": "Rahul", "text": "..."},
    {"speaker": "Anjali", "text": "..."},
    ...
  ]
}

BEFORE GENERATING, run BOTH content AND TTS formatting checks:

═══════════════════════════════════════════════════════════════════════════════
🎯 TTS FORMATTING CHECK (CRITICAL — Most Common Mistakes)
═══════════════════════════════════════════════════════════════════════════════

Run these searches on your draft script BEFORE outputting JSON:

1. COMMA CHECK (CRITICAL — Most common TTS killer):
   □ Search entire script for ",," → If found ANYWHERE, FIX IT (always wrong)
   □ Search for "Yaar,," → REMOVE double comma (should be "Yaar " or "Yaar…")
   □ Search for "Kya, baat" → REMOVE comma (should be "Kya baat")
   □ Search for "Main, baat" → REMOVE comma (should be "Main baat")
   □ Search for "Exactly, 2013" → Change to "Exactly. 2013" or "Exactly… 2013"
   □ Search for "Wait, mein" → Change to "Wait… mein" (ellipsis, not comma)
   □ Search for "Kya, journey" → REMOVE comma (should be "Kya journey")
   □ Count commas in Hindi phrases → If too many, REMOVE extras
   □ Mentally read aloud → Do commas create robotic pauses? Remove them

2. NUMBER CHECK:
   □ Search for "twenty", "sixteen", "seventeen", "fifteen" → REPLACE with numerals
   □ Search for "thirty", "forty", "fifty" in capacities → REPLACE with numerals
   □ Search for "thousand", "hundred" in stats → REPLACE with numerals (e.g., 37000)
   □ All years MUST be digits: 2016, 2017, 1975 (NOT spelled out)

3. ELLIPSIS CHECK:
   □ Count "..." in entire script → If more than 2, keep only thinking pauses
   □ Check if ellipses connect facts → If yes, REMOVE (use normal spacing)
   □ Ellipses only for: "That's... impressive" or trailing thoughts

4. REACTION CHECK:
   □ Scan each turn → Does any turn have >1 reaction? Split into separate turns
   □ Look for patterns like "Wow! Amazing! But" → Break into multiple turns

5. HINGLISH FLOW CHECK:
   □ Read Hindi phrases aloud → "Kya baat hai", "aur unka", "ke baare mein"
   □ Do they sound natural? If comma-heavy, remove commas

═══════════════════════════════════════════════════════════════════════════════
📝 CONTENT QUALITY CHECK (Story & Structure)
═══════════════════════════════════════════════════════════════════════════════

□ Lines 1-2: EMOTIONAL OPENING — personal, curious, NO FACTS
□ Lines 3-9: Fact-reaction pairs — max 2 facts per turn, reaction after each
□ Lines 10-12: REFLECTIVE CLOSING — open-ended thought, NO NEW FACTS
□ After every surprising number/date, next speaker reacts emotionally
□ NO filler-first sentences (no "Hmm," "Well," "Actually" at start)
□ NO empty reactions without substance
□ Energy: flat with soft edges (warm start, reflective end)
□ All facts from SOURCE URL only
□ 10-12 lines total (~60 seconds)
□ Sounds like two friends having a genuine conversation
□ PROSODY: Greetings are warm (not hyper), facts use periods (not exclamations)
□ PROSODY: Questions are curious (not shocked), "Achcha" is thoughtful (not excited)

⚠️ IF ANY TTS CHECK FAILS → FIX IT before outputting JSON. Bad formatting = Bad audio.
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
        content: `You are a Hinglish podcast scriptwriter creating 60-second conversations that sound like two friends chatting.

CORE PHILOSOPHY:
- Sound like two friends having a genuine conversation, NOT reading a script
- NEVER start sentences with fillers (Hmm, Actually, Well, See)
- Reactions must REFERENCE something specific from previous turn
- NO empty reactions (avoid standalone "Wow!", "Crazy!", "Uff!")

PERSONAS (EQUAL ENERGY):
- RAHUL & ANJALI are equal friends, same casual energy
- Neither is the "expert" or "student" — both share facts AND react
- Both are warm, friendly, equally excited about the topic
- Think: Two friends chatting over chai, not a host interviewing a guest

EMOTIONAL BEAT RULES (NON-NEGOTIABLE):

RULE 1 — EMOTIONAL OPENING (Lines 1-2):
- First 2 lines must be personal, curious, warm
- NO facts, numbers, dates, or places allowed in opening
- Start like friends settling into conversation
- Example: "Yaar Anjali, I was thinking about something..." / "Kya? Tell me!"

RULE 2 — FACT-REACTION PAIRS (Lines 3-9):
- After any number > 100, year, or surprising stat: next speaker MUST react emotionally
- Maximum 2 facts per turn
- Example: "291 runs banaye!" → "Wait, that's massive yaar!"

RULE 3 — REFLECTIVE CLOSING (Lines 10-12):
- Last 2-3 lines must be reflective, open-ended
- NO new facts allowed in closing
- Example: "Makes you wonder what the future holds..." / "Hmm... something to think about."

GOOD EXAMPLES:
✓ "Yaar, kal raat randomly padh raha tha..." (personal opening)
✓ "Wait, seriously? That's huge!" (genuine reaction after fact)
✓ "Those legends had no idea what they were starting..." (reflective close)

BAD EXAMPLES:
✗ "1975 mein pehla World Cup hua" (fact in opening - robotic)
✗ "291 runs. 274 pe out. 17 se haare." (fact dump without reaction)
✗ "Ab toh 14 teams hai." (new fact in closing - abrupt)

TTS RULES:
- Numbers: English digits only ("1975", "291 runs")
- Use commas for pauses, ellipsis for trailing thoughts

Return ONLY valid JSON: {"title": "...", "script": [{"speaker": "Rahul", "text": "..."}, ...]}`
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.95,
    max_tokens: 2048,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Groq");
  
  return JSON.parse(content) as ConversationData;
};

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
  return script.map((part, index) => {
    let text = part.text;
    const originalText = text; // Store for comparison
    
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
    
    // Pattern A: Ellipsis before connecting words (toh, aur, yaar)
    // Examples: "Ahmedabad mein ... toh" → "Ahmedabad mein toh"
    //           "Unhone ... toh history" → "Unhone toh history"
    const beforeEllipsisToh = text;
    text = text.replace(/\s*\.\.\.\s+(toh|aur|yaar)\b/gi, ' $1');
    
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
  
  // POST-PROCESSING: Clean script for TTS optimization
  console.log('🧹 Applying TTS cleanup to generated script...');
  
  result.script = cleanScriptForTTS(result.script);
  
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

CORE PHILOSOPHY:
- Sound like two friends having a genuine conversation, NOT reading a script
- NEVER start sentences with fillers (Hmm, Actually, Well, See)
- NO empty reactions (avoid standalone "Wow!", "Crazy!", "Uff!")

EMOTIONAL BEAT RULES (NON-NEGOTIABLE):

RULE 1 — EMOTIONAL OPENING (Lines 1-2):
- First 2 lines must be personal, curious, warm
- NO facts, numbers, dates, or places allowed in opening
- Example: "Yaar, I was thinking about something..." / "Kya? Tell me!"

RULE 2 — FACT-REACTION PAIRS (Lines 3-9):
- After any number > 100, year, or surprising stat: next speaker MUST react emotionally
- Maximum 2 facts per turn
- Example: "291 runs banaye!" → "Wait, that's massive yaar!"

RULE 3 — REFLECTIVE CLOSING (Lines 10-12):
- Last 2-3 lines must be reflective, open-ended
- NO new facts allowed in closing
- Example: "Makes you wonder..." / "Hmm... something to think about."

MAINTAIN:
- Same topic and speakers (Rahul & Anjali)
- Hinglish style (60% Hindi, 40% English)
- 10-12 exchanges total
- Friends chatting vibe, not scripted podcast

APPLY USER FEEDBACK by:
- Adding warmth if opening feels robotic
- Adding reactions after facts if it sounds like fact-dump
- Making closing reflective if it ends abruptly

TTS RULES:
- Numbers: English digits only
- Use commas for pauses, ellipsis for trailing thoughts

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
    max_tokens: 2048,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Groq");

  const result = JSON.parse(content) as ConversationData;
  result.sourceUrl = sourceUrl;
  
  // POST-PROCESSING: Clean improved script for TTS optimization
  console.log('🧹 Applying TTS cleanup to improved script...');
  result.script = cleanScriptForTTS(result.script);
  
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
  cleaned = cleaned.replace(/\b(toh|matlab|basically|you know|I mean)\b/gi, (match) => {
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
  cleaned = cleaned.replace(/,\s*\.\.\.\s*/g, ' '); // ", ..." -> " "
  cleaned = cleaned.replace(/\.\.\.\s+(toh|ki|mein|se)\b/gi, '$1 '); // "... toh" -> "toh"
  
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
        if (!elevenLabsClient) {
          throw new Error("ElevenLabs API key is not configured. Please add VITE_ELEVENLABS_API_KEY to your .env file.");
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
        if (retries === 0) throw err;
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
  
  // Skip audio mastering for now - it converts MP3 to PCM which breaks browser playback
  // The mastering function would need server-side MP3 re-encoding to work properly
  // combined = await applyAudioMastering(combined);
  
  // Convert to base64
  let binary = '';
  const bytes = combined;
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);
  
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
