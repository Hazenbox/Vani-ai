
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ElevenLabsClient } from "elevenlabs";
import { ConversationData, ScriptPart, AudioResult, SegmentTiming } from "../types";
import { extractSemanticContent, formatFactsForPrompt } from './semanticExtraction';

// ============================================
// LLM CONFIGURATION
// Primary: Gemini 2.0 Flash (best variety, natural conversations)
// Fallback: Groq/LLaMA 3.3 70B (faster, more requests/day)
// ============================================

// Primary: Gemini 2.5 Flash (best for script generation)
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Fallback: Groq (LLaMA 3.3 70B) - used if Gemini fails
const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true
});

// ElevenLabs for TTS
const elevenlabs = new ElevenLabsClient({
  apiKey: import.meta.env.VITE_ELEVENLABS_API_KEY
});

// ============================================
// VOICE CONFIGURATION - Indian-accented voices
// ============================================
const VOICE_IDS = {
  Rahul: "EOVAuWqgSZN2Oel78Psj",  // Indian male voice
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

// Default settings (will be overridden by analysis if available)
// Optimized for natural podcast feel: reduced stability, increased expressiveness
// Based on feedback: trade perfection for presence
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.20,  // Further reduced for more natural variation and human-like quality
  similarity_boost: 0.75,
  style: 0.60,     // Increased from 0.55 for more expressiveness
  use_speaker_boost: true
};

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
 * Get voice settings based on audio analysis or defaults.
 * Dynamic variation based on sentence position, content, and emotion markers.
 */
function getVoiceSettings(
  speaker: 'Rahul' | 'Anjali', 
  text: string,
  sentenceIndex?: number,
  totalSentences?: number
): VoiceSettings {
  // If analysis config is available, use it as base
  let baseSettings: VoiceSettings;
  if (audioAnalysisConfig?.recommended_elevenlabs_settings) {
    const settings = audioAnalysisConfig.recommended_elevenlabs_settings;
    baseSettings = {
      stability: settings.stability,
      similarity_boost: settings.similarity_boost,
      style: settings.style,
      use_speaker_boost: settings.use_speaker_boost
    };
  } else {
    // Use optimized defaults
    baseSettings = { ...DEFAULT_VOICE_SETTINGS };
  }
  
  // Apply speaker-specific base adjustments
  if (speaker === 'Anjali') {
    // Anjali: Slightly more stable, professional, but still expressive
    baseSettings = {
      ...baseSettings,
      stability: baseSettings.stability + 0.05,
      style: baseSettings.style - 0.05
    };
  } else {
    // Rahul: More expressive, energetic
    baseSettings = {
      ...baseSettings,
      stability: baseSettings.stability - 0.03,
      style: baseSettings.style + 0.08
    };
  }
  
  // Dynamic variation based on content and position
  const hasEmotionalContent = /\(laughs?\)|\(giggles?\)|\(chuckles?\)|\(surprised?\)|\(excited?\)/i.test(text);
  
  if (hasEmotionalContent) {
    // Lower stability, higher style for emotional moments
    baseSettings = {
      ...baseSettings,
      stability: Math.max(0.20, baseSettings.stability - 0.05),
      style: Math.min(0.75, baseSettings.style + 0.05)
    };
  }
  
  // Energy modulation: vary by sentence position
  if (sentenceIndex !== undefined && totalSentences !== undefined) {
    const position = sentenceIndex / totalSentences;
    
    // Opening needs warmth and engagement (lower stability, higher style)
    if (position < 0.2) {
      // Start of conversation - warm, inviting, expressive (NOT robotic)
      baseSettings = {
        ...baseSettings,
        stability: Math.max(0.15, baseSettings.stability - 0.05), // More natural variation
        style: Math.min(0.85, baseSettings.style + 0.10)          // More expressive
      };
    } else if (position > 0.7) {
      // End of conversation - moderate, reflective, slightly more stable
      baseSettings = {
        ...baseSettings,
        stability: Math.min(0.40, baseSettings.stability + 0.03),
        style: Math.max(0.40, baseSettings.style - 0.02)
      };
    }
    // Mid-conversation (0.2-0.7) uses base settings (peak energy)
  }
  
  return baseSettings;
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
// BEAT SHEET PROMPT SYSTEM v3.0
// Conversation-First | Position-Based Imperfections | Anti-Leakage
// ============================================
const HINGLISH_PROMPT = `
You are creating a 60-second Hinglish podcast conversation between two professional radio hosts.

SOURCE URL: "{url}"

EXTRACTED FACTS (Ground your script in these ONLY):
{extracted_facts}

⚠️ CRITICAL: ALL facts in your script MUST come from the extracted facts above.
Do NOT add information not present in these facts. Do NOT hallucinate details.
If a fact is missing, focus the conversation on the facts that ARE present.

Extract ALL facts (names, dates, numbers, achievements) from this source ONLY.

════════════════════════════════════════════════════════════════════════════════
SECTION 0: DIRECTOR'S PERFORMANCE LAYER 🎬
════════════════════════════════════════════════════════════════════════════════

You are DIRECTING a performance, not just writing dialogue.

🎭 DIALECTIC CHARACTER PROFILES (Opposing Forces Create Energy):

RAHUL = FIRE 🔥 (High Energy Provocateur)
├─ Energy: High, reactive, fast-paced
├─ Sentence style: Short, punchy (5-10 words average)
├─ Questions vs Statements: 60% questions, 40% statements
├─ Preferred fillers: "yaar", "arrey", "kya", "seriously"
├─ Punctuation tendency: "!", "?!", frequent
├─ Pace: Quick exchanges, minimal inter-word pauses
├─ Pitch tendency: Rising (curiosity, surprise)
└─ Role: Challenges assumptions, reacts emotionally, provokes

ANJALI = WATER 💧 (Calm Expert Guide)
├─ Energy: Moderate, measured, controlled
├─ Sentence style: Complete, structured (12-18 words average)
├─ Questions vs Statements: 20% questions, 80% statements
├─ Preferred fillers: "hmm", "actually", "basically", "you see"
├─ Punctuation tendency: ",", "...", deliberate
├─ Pace: Steady, thoughtful pauses for emphasis
├─ Pitch tendency: Stable (declarative, explanatory)
└─ Role: Provides context, explains clearly, grounds conversation

DIALECTIC TENSION = ENGAGING CONVERSATION
Fire challenges → Water grounds → Fire reacts → Water explains
This creates rhythm without chaos.

🎯 ACOUSTIC ANCHOR CATALOG (Performance Cues for TTS):

Acoustic anchors are words/patterns that TTS models naturally interpret.
Use them INTENTIONALLY, not randomly.

TYPE 1: THINKING ANCHORS (Hesitation, Uncertainty)
├─ Words: "umm", "uh", "hmm", "well"
├─ TTS effect: Slows down, lowers pitch, elongates vowels
├─ Usage limit: MAX 1 per speaker per script
└─ When: Beginning of uncertain/corrective statements

TYPE 2: HINGLISH ANCHORS (Code-Switch Rhythm)
├─ Words: "yaar", "matlab", "achcha", "bilkul", "dekho"
├─ TTS effect: Natural Hinglish prosody break, cultural flavor
├─ Usage limit: 2-3 total per script
└─ When: Casual emphasis, transitions, emotional punctuation

TYPE 3: ENERGY ANCHORS (Peak Moments)
├─ Patterns: "Wow!", "Baap re!", "CAPS WORDS", "?!", "!!"
├─ TTS effect: Pitch spike, volume boost, fast delivery
├─ Usage limit: MAX 2-3 total per script (ONLY in Beat 4)
└─ When: Surprise reveals, peak emotional reactions

TYPE 4: TRAILING ANCHORS (Contemplation, Incompleteness)
├─ Patterns: "...", "I mean...", "you know...", sentences ending with "..."
├─ TTS effect: Fading energy, trailing off, incomplete thought
├─ Usage limit: 1-2 total per script
└─ When: Mid-thought hesitation, contemplative pauses

TYPE 5: INTERRUPTION ANCHORS (Overlapping Speech Simulation)
├─ Pattern: Em-dash at end + em-dash at start: "But what—" / "—exactly!"
├─ TTS effect: Abrupt stop, minimal pause (<100ms)
├─ Usage limit: Exactly 1 handoff per script (in Beat 3)
└─ When: Natural conversation overlap, thought completion

⚠️ PERFORMANCE DISCIPLINE - THE 70/20/10 RULE:

DO NOT over-direct. Natural conversations are mostly neutral.

70% = BASELINE (Neutral delivery)
- No special markers
- Natural sentence structure
- Factual, explanatory tone
- Example: "Delhi Capitals started in 2008."

20% = SUBTLE EMPHASIS (Mild modulation)
- Strategic commas for micro-pauses
- Thinking fillers ("hmm", "actually")
- Gentle questions ("Right?", "You know?")
- Example: "So basically, when you think about it, they've grown."

10% = PEAK ENERGY (Strong modulation)
- Exclamations, caps, energy anchors
- ONLY in Beat 4 (Peak moment)
- Example: "BAAP RE?! 5000 CRORE?!"

A conversation where everything is exciting = nothing is exciting.
Peak moments are EARNED through buildup, not scattered randomly.

🎬 WITHIN-SENTENCE ENERGY ARCHITECTURE:

Sentences should have natural prosody arcs, not flat energy.

GOOD ENERGY ARC ✓
"So when you think about it, actually, it's massive!"
 ↑ steady          ↑ pause/dip    ↑ PEAK

BAD ENERGY ARC ✗
"It's massive when you think about it actually."
 ↑ PEAK first (then falls off, anticlimactic)

GOOD PEAK DELIVERY ✓
"Baap re! 5000 crore?! That's... that's insane!"
 ↑ shock  ↑ question  ↑ pause   ↑ emphasis

BAD PEAK DELIVERY ✗
"That's insane 5000 crore baap re."
 (Energy backwards, doesn't build)

PRINCIPLE: Energy should BUILD in key sentences, creating anticipation.

🎤 BEAT-SPECIFIC PERFORMANCE INSTRUCTIONS:

Beat 1 (Hook): 
- NO performance tricks
- Clean, direct, engaging
- Let content create curiosity
- Energy: Neutral → Rising slightly

Beat 2 (Context):
- ONE self-correction with em-dash (Anjali)
- ONE thinking filler ("Hmm" or "Actually")
- Energy: Grounded, explanatory

Beat 3 (Exploration):
- Rapid back-and-forth
- ONE incomplete handoff (em-dash interruption)
- Energy: Building, discovering together

Beat 4 (PEAK): ⭐ THIS IS WHERE ENERGY ANCHORS LIVE
- ONE strong exclamation (Rahul reacts)
- Optional: CAPS for emphasis
- Energy: MAXIMUM (but just 1-2 lines)

Beat 5 (Landing):
- Return to baseline completely
- NO exclamations, NO energy anchors
- Reflective, satisfied tone
- Energy: Settling, neutral

📊 SELF-CHECK BEFORE GENERATING:

Mentally verify:
□ Rahul has 2+ energetic moments (questions, reactions)?
□ Anjali has 1+ thoughtful moments (explanations, pauses)?
□ Total energy anchors: 2-3 MAX?
□ Peak energy is in Beat 4 only?
□ Beat 5 is completely neutral?
□ Acoustic anchors are distributed (not clustered)?
□ 70% of script feels conversational-normal?

════════════════════════════════════════════════════════════════════════════════
SECTION 1: PERSONAS (Who They Are, Not What They Say)
════════════════════════════════════════════════════════════════════════════════

ANJALI — The Anchor
├─ Personality: Confident, warm, articulate, quick-witted
├─ Role: Guides conversation, provides context, explains clearly
├─ Energy: Grounded but enthusiastic, like a senior RJ
├─ Voice: Calm authority with occasional playful moments
└─ She LEADS but doesn't lecture. Short turns, invites dialogue.

RAHUL — The Curious One
├─ Personality: Energetic, curious, genuine, slightly irreverent
├─ Role: Asks questions, reacts authentically, adds perspective
├─ Energy: Higher than Anjali, more reactive
├─ Voice: Engaged listener who contributes, not just agrees
└─ He ENGAGES but doesn't dominate. Adds value to every turn.

Together: They sound like Radio Mirchi morning show hosts — professional but relatable.

════════════════════════════════════════════════════════════════════════════════
SECTION 2: BEAT SHEET (The Structure of Every Conversation)
════════════════════════════════════════════════════════════════════════════════

Every conversation follows 5 BEATS. Each beat has a FUNCTION and CONSTRAINTS.
Imperfections are ANCHORED to specific beats — not scattered randomly.

┌─────────────────────────────────────────────────────────────────────────────┐
│ BEAT 1: HOOK (Lines 1-2)                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Function: Grab attention with topic-specific curiosity                     │
│ Speaker: RAHUL opens                                                         │
│ Energy: Medium → Rising (curious, slightly provocative)                     │
│ Pattern: [TOPIC_REFERENCE] + [PERSONAL_OBSERVATION] + [QUESTION_TO_ANJALI]  │
│                                                                             │
│ Line 1 (Rahul): Opens with genuine curiosity about THIS specific topic     │
│ Line 2 (Anjali): Light reaction + initial acknowledgment                   │
│                                                                             │
│ Constraints:                                                                │
│ ├─ Make it SPECIFIC to the source content (not generic)                    │
│ ├─ Rahul shows he's genuinely interested, not reading a script             │
│ └─ NO imperfections in this beat — clean, engaging opening                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BEAT 2: CONTEXT (Lines 3-4) ← SELF-CORRECTION GOES HERE                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Function: Establish credibility with first key fact from source            │
│ Speaker: ANJALI leads, RAHUL reacts                                         │
│ Energy: Confident, grounded (Anjali knows her stuff)                        │
│ Pattern: [SETUP] + [SELF_CORRECTION] + [KEY_FACT_FROM_SOURCE]               │
│                                                                             │
│ Line 3 (Anjali): Provides historical/background context with ONE           │
│                  self-correction: "So the thing is— actually, let me       │
│                  put it this way—"                                          │
│ Line 4 (Rahul): Reacts with surprise or curiosity + asks follow-up         │
│                                                                             │
│ IMPERFECTION ANCHOR:                                                        │
│ ├─ Place the ONE self-correction (em-dash) in Line 3                       │
│ ├─ Place FILLER #1 ("Hmm" or "Achcha") at the START of Line 3 or 4         │
│ └─ This is the ONLY beat for self-correction                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BEAT 3: EXPLORATION (Lines 5-7) ← INCOMPLETE HANDOFF GOES HERE             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Function: Build interest through back-and-forth dialogue                   │
│ Speakers: BOTH — rapid exchange                                              │
│ Energy: Building (discovering together)                                     │
│ Pattern: Question → Answer → Reaction → Question                            │
│                                                                             │
│ Line 5 (Rahul): Asks about something specific, sentence trails off with —  │
│ Line 6 (Anjali): Completes his thought + provides answer                   │
│ Line 7 (Rahul): Reacts + asks another question                             │
│                                                                             │
│ IMPERFECTION ANCHOR:                                                        │
│ ├─ Place the ONE incomplete handoff between Lines 5-6                      │
│ │   Example: Rahul: "But what about—" / Anjali: "—the money? Exactly!"    │
│ ├─ Place FILLER #2 ("uh" or "you know") in Line 7                          │
│ └─ This is the ONLY beat for incomplete handoffs                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BEAT 4: PEAK (Lines 8-9) ← TRAILING THOUGHT GOES HERE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Function: Emotional high point — share the most interesting fact           │
│ Speakers: BOTH at highest energy                                             │
│ Energy: PEAK (excited, impressed, or moved)                                  │
│ Pattern: [STRONG_REACTION] + [PEAK_FACT] + [EMOTIONAL_RESPONSE]             │
│                                                                             │
│ Line 8 (Anjali): Shares the most surprising/impressive fact                │
│ Line 9 (Rahul): Strong emotional reaction, sentence can trail off...       │
│                                                                             │
│ IMPERFECTION ANCHOR:                                                        │
│ ├─ Place the ONE trailing thought (ellipsis) at the END of Line 8 or 9     │
│ │   Example: "Global circuit mein dominance..."                            │
│ └─ This is the ONLY beat for trailing thoughts                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BEAT 5: LANDING (Lines 10-11) ← CLEAN ZONE (NO IMPERFECTIONS)              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Function: Graceful close — reflect and leave open                          │
│ Speakers: BOTH winding down                                                  │
│ Energy: Settling (satisfied, forward-looking)                               │
│ Pattern: [BRIEF_REFLECTION] + [OPEN_THOUGHT_OR_CASUAL_REMARK]               │
│                                                                             │
│ Line 10 (Anjali): Brief reflection on why this matters                     │
│ Line 11 (Rahul): Open-ended remark or casual close                         │
│                                                                             │
│ ⚠️ CLEAN ZONE RULES:                                                        │
│ ├─ NO self-corrections (no em-dashes)                                      │
│ ├─ NO incomplete handoffs                                                   │
│ ├─ NO trailing ellipses                                                     │
│ ├─ NO fillers                                                               │
│ ├─ NO new questions or topics                                               │
│ └─ This beat must feel POLISHED and COMPLETE                               │
│                                                                             │
│ Good endings:                                                                │
│ ├─ "Chalo, dekhte hain kya hota hai. Exciting times!"                      │
│ └─ "It's a tool. Use it well, and it's a superpower."                      │
│                                                                             │
│ Bad endings (NEVER DO):                                                      │
│ ├─ "But what about— ...it's complicated... kind of..."                     │
│ └─ "Hmm, uh, you know... we'll see..."                                     │
└─────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
SECTION 3: VOCABULARY BANKS (Use These, Not Concrete Examples)
════════════════════════════════════════════════════════════════════════════════

⚠️ ALL FACTS must come from the SOURCE URL. NEVER use facts from this prompt.
   The examples below show PATTERNS only, not content to copy.

REACTIONS (pick variety, never repeat in same script):
├─ Surprise: "Baap re!", "Wait seriously?", "Sahi mein?", "Whoa!"
├─ Agreement: "Hundred percent!", "Exactly!", "Bilkul!"
├─ Understanding: "Achcha...", "Oh interesting", "Toh matlab..."
├─ Emotion: "Uff!", "Goosebumps!", "Man, that's [emotion]"
└─ Curiosity: "But wait...", "Aur suna hai...", "Tell me more"

FILLERS (use 3-4 total, distributed naturally across speakers):
├─ Start of sentence: "Hmm,", "Achcha,", "See,", "Well,"
├─ Mid-sentence: "uh,", "you know,", "like,", "I mean,"
└─ Placement: One every 15-20 seconds for natural feel (but NOT in Beat 5)

SELF-CORRECTION PATTERNS (use exactly 1 in Beat 2):
├─ "So the thing is— actually, let me put it this way—"
├─ "I was going to say— wait, that's not quite right—"
└─ "Basically— hmm, actually no—"

INCOMPLETE HANDOFF PATTERNS (use exactly 1 in Beat 3):
├─ Speaker A: "But what about—" / Speaker B: "—the [topic]? Exactly!"
├─ Speaker A: "And then when—" / Speaker B: "—when it happened? Yes!"
└─ Speaker A: "So the key thing is—" / Speaker B: "—is the timing? Bilkul!"

⚡ HANDOFF TIMING: These interruptions should feel QUICK (near-immediate pickup).
   The em-dash signals <100ms pause, creating natural overlap feeling.

LAUGHTER (use sparingly, with spaces):
├─ " hah " — light chuckle
├─ " hah relax!" — playful dismissal
└─ "haha" — genuine laugh (rare)

════════════════════════════════════════════════════════════════════════════════
SECTION 4: TTS OPTIMIZATION (ElevenLabs-Specific)
════════════════════════════════════════════════════════════════════════════════

ElevenLabs reacts to PUNCTUATION, not text markers.

COMMA (, ) → Brief pause (0.2s) - USE GENEROUSLY for micro-pauses
ELLIPSIS (... ) → Thinking pause, trailing off (0.5s)
EM-DASH (— ) → Self-interruption, abrupt stop (minimal pause)
PERIOD (.) → Full stop, sentence boundary
EXCLAMATION (!) → Emphasis, energy boost

💡 MICRO-PAUSES: Add commas strategically within sentences to create natural breathing:
   Example: "So basically, when you look at it, the thing is..."
   This reduces long silence gaps by distributing pauses throughout speech.

🎭 ENERGY VARIATION: Vary emphasis WITHIN sentences for dynamic delivery:
   ├─ Use ellipsis mid-sentence to drop energy: "When you think about it... it's massive"
   ├─ Use exclamation for energy peaks: "And then boom! Everything changed"
   ├─ Questions naturally raise energy: "Can you believe that? Insane!"
   └─ Commas create natural rise-fall rhythm in longer sentences

❌ NEVER USE: (pause), (laughs), (surprised), (excited), (thinking)
✓ INSTEAD USE: Punctuation + natural Hinglish expressions

NUMBERS — Always in English digits:
├─ Years: "1956", "2024" (NOT "unnis sau chhappan")
├─ Money: "$87 million", "500 crore"
├─ Stats: "5 titles", "87 percent"
└─ This ensures correct TTS pronunciation

════════════════════════════════════════════════════════════════════════════════
SECTION 5: ANTI-PATTERNS (What Breaks the Podcast Feel)
════════════════════════════════════════════════════════════════════════════════

❌ TEMPLATE PHRASES (Never Use):
├─ "Dekho, aaj kal..."
├─ "Arey [name], tune dekha/suna?"
├─ "Haan yaar" as automatic second line
├─ "Subscribe karna" or "Phir milenge"
└─ Any phrase that sounds like fill-in-the-blank

❌ OVER-IMPERFECTION (Sounds Worse Than Perfect):
├─ Multiple self-corrections: "So— wait— actually— I mean—"
├─ Clustered fillers: "Hmm, uh, you know, actually..."
├─ Multiple trailing: "It's... kind of... complicated..."
├─ Imperfections in ending (Beat 5)
└─ More than: 1 self-correction, 4 fillers, 1 trailing, 1 handoff

❌ CONTENT LEAKAGE (Never Copy Facts From Examples):
├─ "$87 million" — this is example content, not for your script
├─ "Dartmouth College 1956" — only use if YOUR source mentions it
├─ "Mumbai Indians" / "Rohit Sharma" — only if YOUR source is about them
└─ ALL facts must come from the SOURCE URL provided

❌ STRUCTURE VIOLATIONS:
├─ Rahul just agreeing ("Haan yaar, sahi kaha")
├─ Long monologues (>2 sentences per turn)
├─ Rushing to explanation (skipping Hook beat)
├─ Abrupt endings (skipping Landing beat)
└─ Same reaction used twice

════════════════════════════════════════════════════════════════════════════════
SECTION 6: OUTPUT FORMAT
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

BEFORE GENERATING, silently verify:
□ Beat 1 (Hook): Clean opening, no imperfections
□ Beat 2 (Context): Has 1 self-correction, has Filler #1
□ Beat 3 (Exploration): Has 1 incomplete handoff, has Filler #2 & #3
□ Beat 4 (Peak): Has 1 trailing thought (ellipsis), optional Filler #4
□ Beat 5 (Landing): CLEAN — no imperfections, no new topics
□ Total: 1 self-correction, 3-4 fillers, 1 trailing, 1 handoff
□ All facts from SOURCE URL (nothing copied from this prompt)
□ 10-12 lines total (~60 seconds)
□ Micro-pauses: Commas used strategically within longer sentences
`;

// Fallback: Generate script using Groq (LLaMA 3.3 70B)
const generateScriptWithGroq = async (prompt: string): Promise<ConversationData> => {
  console.log("🔄 Using Groq (LLaMA 3.3 70B) as fallback...");
  
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a Hinglish podcast scriptwriter creating 60-second conversations.

PERSONAS:
- ANJALI: Anchor, confident, guides conversation, provides context
- RAHUL: Curious, energetic, asks questions, adds perspective
Both sound like Radio Mirchi RJs — professional but relatable.

5-BEAT STRUCTURE:
Beat 1 (Lines 1-2): HOOK — Rahul opens with curiosity. NO imperfections.
Beat 2 (Lines 3-4): CONTEXT — Anjali provides facts. Place 1 SELF-CORRECTION here + Filler #1.
Beat 3 (Lines 5-7): EXPLORATION — Back-and-forth. Place 1 INCOMPLETE HANDOFF here + Filler #2.
Beat 4 (Lines 8-9): PEAK — Highest energy. Place 1 TRAILING THOUGHT (...) here.
Beat 5 (Lines 10-11): LANDING — CLEAN ZONE. No imperfections. Reflective close.

IMPERFECTION RULES (STRICT):
- EXACTLY 1 self-correction (em-dash) in Beat 2
- EXACTLY 2 fillers total (1 per speaker, spread out)
- EXACTLY 1 trailing thought (ellipsis) in Beat 4
- EXACTLY 1 incomplete handoff in Beat 3
- Beat 5 must be CLEAN (no imperfections)

⚠️ OVER-IMPERFECTION = WORSE. Adding more makes it sound choppy and hesitant.

ANTI-PATTERNS:
- NEVER: "Arey [name], tune dekha?", "Haan yaar" as auto-response
- NEVER: Rahul just agreeing. He adds perspective.
- NEVER: Template phrases. Be SPECIFIC to the content.
- NEVER: (laughs), (pause) markers. Use punctuation.

TTS RULES:
- Laughter: " hah " with spaces
- Numbers: English digits only ("1956", "$87 million")
- Punctuation for pauses, not markers

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

// Primary: Generate script using Gemini 2.5 Flash
const generateScriptWithGemini = async (prompt: string): Promise<ConversationData> => {
  console.log("🚀 Using Gemini 2.5 Flash (primary)...");
  
  const result = await geminiModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    }
  });
  
  const content = result.response.text();
  if (!content) throw new Error("No response from Gemini");
  
  return JSON.parse(content) as ConversationData;
};

export const generateScript = async (url: string): Promise<ConversationData> => {
  // NEW: Phase 1 - Extract structured facts
  console.log('📊 Semantic Extraction: Starting...');
  const extraction = await extractSemanticContent(url);
  console.log(`📊 Semantic Extraction: Complete (${extraction.extractionTime}ms)`);
  
  // Phase 2 - Generate script WITH grounded facts
  const factsForPrompt = formatFactsForPrompt(extraction.facts);
  console.log('📝 Facts for prompt:', factsForPrompt);
  
  const prompt = HINGLISH_PROMPT
    .replace("{url}", url)
    .replace("{extracted_facts}", factsForPrompt);

  // Try Gemini 2.0 Flash first (primary - best variety)
  let scriptData: ConversationData;
  try {
    scriptData = await generateScriptWithGemini(prompt);
    scriptData.modelUsed = 'gemini' as const;
  } catch (geminiError) {
    console.warn("⚠️ Gemini failed, falling back to Groq:", geminiError);
    
    // Fallback to Groq/LLaMA if Gemini fails (rate limit, network error, etc.)
    scriptData = await generateScriptWithGroq(prompt);
    scriptData.modelUsed = 'groq' as const;
  }
  
  // Attach extraction metadata
  scriptData.extraction = extraction;
  
  // Run Director QA on generated script
  const qaReport = runDirectorQA(scriptData.script);
  
  // Log QA report to console
  console.log('\n' + '='.repeat(70));
  console.log('🎬 DIRECTOR QA REPORT');
  console.log('='.repeat(70));
  console.log(qaReport.summary);
  console.log(`\n✅ Strengths (${qaReport.strengths.length}):`);
  qaReport.strengths.forEach(s => console.log(`   ${s}`));
  if (qaReport.issues.length > 0) {
    console.log(`\n⚠️ Issues (${qaReport.issues.length}):`);
    qaReport.issues.forEach(issue => {
      const icon = issue.severity === 'high' ? '🚨' : issue.severity === 'medium' ? '⚠️' : 'ℹ️';
      console.log(`   ${icon} [${issue.severity.toUpperCase()}] ${issue.description}`);
      console.log(`      💡 ${issue.suggestion}`);
    });
  }
  console.log('='.repeat(70) + '\n');
  
  // Attach QA report to script data
  return {
    ...scriptData,
    directorQA: qaReport
  };
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

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are improving a Hinglish podcast script based on user feedback.

KEEP the 5-BEAT STRUCTURE:
Beat 1 (Lines 1-2): HOOK — Clean opening
Beat 2 (Lines 3-4): CONTEXT — Has 1 self-correction + Filler #1
Beat 3 (Lines 5-7): EXPLORATION — Has 1 incomplete handoff + Filler #2
Beat 4 (Lines 8-9): PEAK — Has 1 trailing thought (...)
Beat 5 (Lines 10-11): LANDING — CLEAN ZONE (no imperfections)

MAINTAIN:
- Same topic and speakers (Rahul & Anjali)
- Hinglish style (60% Hindi, 40% English)
- 10-12 exchanges total
- Professional radio show vibe

IMPERFECTION COUNTS (do not change):
- 1 self-correction in Beat 2
- 2 fillers total (spread across speakers)
- 1 trailing thought in Beat 4
- 1 incomplete handoff in Beat 3
- Beat 5 must stay CLEAN

APPLY USER FEEDBACK by:
- Modifying dialogue text
- Adjusting tone and energy
- Making it more casual/formal as requested
- Adding/reducing humor as requested

ANTI-PATTERNS:
- NEVER: Template phrases, over-imperfection
- NEVER: (laughs), (pause) markers. Use punctuation.
- Numbers: English digits only

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
 * Enhance Hindi pronunciation by adding phonetic hints and proper spacing.
 * ElevenLabs multilingual model benefits from phonetic guidance for Hindi words.
 */
function enhanceHindiPronunciation(text: string): string {
  // Common Hindi/Indian words that need phonetic guidance for better pronunciation
  const hindiPhonetics: Record<string, string> = {
    // Cities and places
    'Delhi': 'Dilli',
    'Mumbai': 'Mum-bye',
    'Bangalore': 'Beng-a-luru',
    'Chennai': 'Chen-nai',
    'Kolkata': 'Kol-ka-ta',
    'Hyderabad': 'Hai-der-a-baad',
    
    // Cricket/Sports terms
    'IPL': 'I. P. L.',
    'T20': 'T. twenty',
    'Capitals': 'Keh-pi-tulls',
    
    // Common Hindi words used in Hinglish
    'crore': 'karor',
    'lakh': 'laakh',
    'paisa': 'pai-sa',
    'rupee': 'ru-pee',
    'yaar': 'yaar',
    'achcha': 'ach-cha',
    'arey': 'a-rey',
    'matlab': 'mut-lub',
    'bilkul': 'bil-kul',
    
    // Names (add specific ones as needed)
    'Rohit': 'Ro-hit',
    'Virat': 'Vi-raat',
    'Dhoni': 'Dho-ni'
  };
  
  let enhanced = text;
  
  // Apply phonetic replacements (case-insensitive, word boundaries)
  for (const [word, phonetic] of Object.entries(hindiPhonetics)) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    enhanced = enhanced.replace(regex, phonetic);
  }
  
  return enhanced;
}

function numberToWords(num: number, isYear: boolean = false): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 
                'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
                'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  
  if (num === 0) return 'zero';
  
  // Handle all years (4-digit numbers) with specific pronunciation rules
  if (isYear) {
    // Years 2000-2009: "two thousand X" format
    if (num >= 2000 && num < 2010) {
      if (num === 2000) {
        return 'two thousand';
      }
      const lastDigit = num % 10;
      return 'two thousand ' + ones[lastDigit];
    }
    
    // Years 2010+: split format (e.g., 2024 → "twenty twenty four")
    // Years before 2000: split format (e.g., 1975 → "nineteen seventy five")
    const firstTwo = Math.floor(num / 100);
    const lastTwo = num % 100;
    
    // Handle first two digits (century)
    let firstPart = '';
    if (firstTwo < 20) {
      firstPart = ones[firstTwo];
    } else {
      const ten = Math.floor(firstTwo / 10);
      const one = firstTwo % 10;
      firstPart = tens[ten] + (one > 0 ? ' ' + ones[one] : '');
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
      secondPart = tens[ten] + (one > 0 ? ' ' + ones[one] : '');
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
  // HINDI PRONUNCIATION - Apply phonetic enhancements first
  // ============================================
  cleaned = enhanceHindiPronunciation(cleaned);
  
  // ============================================
  // NUMBERS - Convert to English words for strict English pronunciation
  // ============================================
  // Match integers (including large numbers)
  cleaned = cleaned.replace(/\b\d+\b/g, (match) => {
    const num = parseInt(match, 10);
    // For very large numbers (7+ digits), convert digit by digit for clarity
    if (match.length >= 7) {
      return match.split('').map(d => {
        const digit = parseInt(d, 10);
        return digit === 0 ? 'zero' : ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][digit];
      }).join(' ');
    }
    // Handle all years (4-digit numbers) as "nineteen seventy five" format
    // Treat 4-digit numbers in reasonable year range (1000-2999) as years
    const isYear = match.length === 4 && num >= 1000 && num < 3000;
    return numberToWords(num, isYear);
  });
  
  // Match decimal numbers (e.g., 3.14, 2024.5)
  cleaned = cleaned.replace(/\b\d+\.\d+\b/g, (match) => {
    const parts = match.split('.');
    const integerPart = parseInt(parts[0], 10);
    const decimalPart = parts[1];
    const integerWords = numberToWords(integerPart);
    const decimalDigits = decimalPart.split('').map(d => {
      const digit = parseInt(d, 10);
      return digit === 0 ? 'zero' : ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][digit];
    }).join(' ');
    return integerWords + ' point ' + decimalDigits;
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
  
  // Add slight pause after "arey", "achcha" for natural emphasis
  cleaned = cleaned.replace(/\b(a-rey|ach-cha|yaar)\b/gi, (match) => {
    return `${match},`;
  });
  
  // ============================================
  // CLEANUP
  // ============================================
  
  // Remove any remaining parenthetical markers
  cleaned = cleaned.replace(/\([^)]*\)/g, '');
  
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

// ============================================
// DIRECTOR QA SYSTEM - Quality Assurance
// ============================================

/**
 * Director QA: Validates script quality without overriding creative decisions.
 * This is a reporting system, not an auto-fix system.
 */
export function runDirectorQA(script: ScriptPart[]): import('./types').DirectorQAReport {
  const issues: import('./types').DirectorQAIssue[] = [];
  const strengths: string[] = [];
  let score = 100;
  
  // Rule 1: Peak Moment Check (Beat 4 must have energy)
  const beat4Lines = script.slice(7, 9); // Lines 8-9 (Beat 4)
  const hasPeakEnergy = beat4Lines.some(line => 
    /[!?]{2,}|[A-Z]{4,}|baap re|wow|insane|what\?!|seriously\?!/i.test(line.text)
  );
  
  if (!hasPeakEnergy) {
    issues.push({
      type: 'missing_peak',
      severity: 'high',
      beat: 4,
      description: 'Beat 4 (Peak) lacks high-energy moment',
      suggestion: 'Consider adding strong reaction: "Wow!", "Baap re!", or CAPS emphasis'
    });
    score -= 20;
  } else {
    strengths.push('Beat 4 has strong peak energy ✓');
  }
  
  // Rule 2: Dialectic Balance (Rahul vs Anjali character)
  const rahulLines = script.filter(l => l.speaker === 'Rahul');
  const anjaliLines = script.filter(l => l.speaker === 'Anjali');
  
  // Rahul should be reactive (questions, exclamations)
  const rahulEnergyMarkers = rahulLines.filter(l => 
    /\?|!|yaar|arrey|kya/i.test(l.text)
  ).length;
  
  if (rahulEnergyMarkers < 2) {
    issues.push({
      type: 'low_rahul_energy',
      severity: 'medium',
      description: 'Rahul (Fire) seems too calm—needs more reactive energy',
      suggestion: 'Add questions, exclamations, or Hinglish interjections ("yaar", "arrey")'
    });
    score -= 10;
  } else {
    strengths.push(`Rahul has ${rahulEnergyMarkers} energy markers (good dialectic) ✓`);
  }
  
  // Anjali should be measured (explanatory, pauses)
  const anjaliThoughtfulMarkers = anjaliLines.filter(l => 
    /,|\.\.\.|\bactually\b|\bbasically\b|\bhmm\b/i.test(l.text)
  ).length;
  
  if (anjaliThoughtfulMarkers < 1) {
    issues.push({
      type: 'low_anjali_depth',
      severity: 'low',
      description: 'Anjali (Water) could use more thoughtful pauses or explanatory markers',
      suggestion: 'Add commas, "actually", "basically", or ellipsis for measured delivery'
    });
    score -= 5;
  } else {
    strengths.push(`Anjali has ${anjaliThoughtfulMarkers} thoughtful markers (good grounding) ✓`);
  }
  
  // Rule 3: Over-Excitement Check (too many peaks)
  const totalExclamations = script.reduce((count, line) => 
    count + (line.text.match(/!/g) || []).length, 0
  );
  
  if (totalExclamations > 5) {
    issues.push({
      type: 'over_excitement',
      severity: 'high',
      description: `${totalExclamations} exclamation points is excessive (dilutes impact)`,
      suggestion: 'Remove exclamations from non-peak moments. Save ! for Beat 4 only.'
    });
    score -= 15;
  } else if (totalExclamations >= 2 && totalExclamations <= 4) {
    strengths.push(`Exclamations: ${totalExclamations} (balanced) ✓`);
  }
  
  // Rule 4: Acoustic Anchor Distribution
  const thinkingFillers = script.filter(l => /\b(umm|uh|hmm)\b/i.test(l.text)).length;
  const hinglishAnchors = script.filter(l => /\b(yaar|matlab|achcha|bilkul)\b/i.test(l.text)).length;
  
  if (thinkingFillers > 2) {
    issues.push({
      type: 'excessive_fillers',
      severity: 'medium',
      description: `${thinkingFillers} thinking fillers is too many (sounds uncertain)`,
      suggestion: 'Limit "umm", "uh", "hmm" to max 1-2 total per script'
    });
    score -= 8;
  }
  
  if (hinglishAnchors > 4) {
    issues.push({
      type: 'excessive_hinglish',
      severity: 'low',
      description: `${hinglishAnchors} Hinglish anchors might feel forced`,
      suggestion: 'Use "yaar", "matlab" sparingly (2-3 total) for natural code-switching'
    });
    score -= 5;
  }
  
  // Rule 5: Beat 5 Neutrality Check (landing should be calm)
  const beat5Lines = script.slice(9, 12); // Last 2-3 lines
  const beat5HasExcitement = beat5Lines.some(l => /!{2,}|[A-Z]{4,}|\?!/i.test(l.text));
  
  if (beat5HasExcitement) {
    issues.push({
      type: 'beat5_not_neutral',
      severity: 'medium',
      beat: 5,
      description: 'Beat 5 (Landing) should be reflective, not exciting',
      suggestion: 'Remove exclamations/caps from closing lines. End with calm reflection.'
    });
    score -= 12;
  } else {
    strengths.push('Beat 5 returns to neutral baseline ✓');
  }
  
  // Rule 6: Em-dash Handoff Check (should have exactly 1)
  const hasHandoff = script.some((line, i) => 
    i < script.length - 1 && 
    line.text.trim().endsWith('—') && 
    script[i + 1].text.trim().startsWith('—')
  );
  
  if (!hasHandoff) {
    issues.push({
      type: 'missing_handoff',
      severity: 'low',
      beat: 3,
      description: 'No incomplete handoff found (natural overlap feeling)',
      suggestion: 'Consider adding one em-dash interruption in Beat 3'
    });
    score -= 5;
  } else {
    strengths.push('Has natural handoff interruption ✓');
  }
  
  // Rule 7: Sentence Length Variety (dialectic check)
  const avgRahulLength = rahulLines.reduce((sum, l) => sum + l.text.split(' ').length, 0) / Math.max(rahulLines.length, 1);
  const avgAnjaliLength = anjaliLines.reduce((sum, l) => sum + l.text.split(' ').length, 0) / Math.max(anjaliLines.length, 1);
  
  if (avgRahulLength > avgAnjaliLength) {
    issues.push({
      type: 'dialectic_inversion',
      severity: 'medium',
      description: 'Rahul (Fire) has longer sentences than Anjali (Water)—feels backwards',
      suggestion: 'Rahul should be punchy (5-10 words), Anjali more structured (12-18 words)'
    });
    score -= 10;
  } else {
    strengths.push(`Sentence length dialectic maintained (Rahul: ${avgRahulLength.toFixed(1)}w, Anjali: ${avgAnjaliLength.toFixed(1)}w) ✓`);
  }
  
  // Rule 8: 70/20/10 Energy Distribution Estimate
  const neutralLines = script.filter(l => 
    !/[!?]{2,}|[A-Z]{4,}|umm|yaar|\.\.\./.test(l.text)
  ).length;
  const neutralPercent = (neutralLines / script.length) * 100;
  
  if (neutralPercent < 60) {
    issues.push({
      type: 'too_much_modulation',
      severity: 'high',
      description: `Only ${neutralPercent.toFixed(0)}% neutral lines (should be ~70%)`,
      suggestion: 'Most conversation should be baseline. Remove markers from non-critical lines.'
    });
    score -= 15;
  } else if (neutralPercent >= 65 && neutralPercent <= 75) {
    strengths.push(`Energy distribution: ${neutralPercent.toFixed(0)}% neutral (ideal) ✓`);
  }
  
  // Generate summary
  const passed = issues.filter(i => i.severity === 'high').length === 0;
  const summary = passed
    ? `✅ Script passes Director QA (Score: ${score}/100). ${strengths.length} strengths, ${issues.length} minor notes.`
    : `⚠️ Script needs review (Score: ${score}/100). ${issues.filter(i => i.severity === 'high').length} critical issues found.`;
  
  return {
    passed,
    score: Math.max(0, score),
    issues,
    strengths,
    summary
  };
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
        audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
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
