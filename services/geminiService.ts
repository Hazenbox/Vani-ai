
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
// #region agent log
const _geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
fetch('http://127.0.0.1:7242/ingest/be7db068-3ff4-4409-a71d-2fa2adf1e8d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:14',message:'Gemini API key check',data:{keyExists:!!_geminiApiKey,keyLength:_geminiApiKey.length,keyPrefix:_geminiApiKey.substring(0,10),keySuffix:_geminiApiKey.substring(_geminiApiKey.length-5)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H2'})}).catch(()=>{});
// #endregion
const genAI = new GoogleGenerativeAI(_geminiApiKey);
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
// CONTINUOUS CONVERSATION PROMPT SYSTEM v4.0
// Fact-First | Natural Flow | Industry-Standard Podcast
// ============================================
const HINGLISH_PROMPT = `
You are creating a 60-second Hinglish podcast conversation between two professional radio hosts.

SOURCE URL: "{url}"
Extract ALL facts (names, dates, numbers, achievements, events) from this source ONLY.

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

ANJALI — The Expert Host
├─ Knows the topic deeply, shares facts confidently
├─ Explains with specific details (dates, names, numbers)
├─ Warm and articulate, never lectures
├─ Her facts trigger Rahul's curiosity
└─ Example: "Actually, 1975 World Cup mein sirf 8 teams thi. West Indies ne dominate kiya."

RAHUL — The Engaged Co-Host
├─ Genuinely curious, asks smart questions
├─ Adds his own knowledge, doesn't just react
├─ Makes connections between facts
├─ His questions drive the conversation forward
└─ Example: "Clive Lloyd! And Vivian Richards bhi us team mein the na? Those guys were legends."

Together: They sound like two friends who KNOW things, sharing knowledge naturally.

════════════════════════════════════════════════════════════════════════════════
SECTION 3: CONVERSATION FLOW — CONTINUOUS STRUCTURE
════════════════════════════════════════════════════════════════════════════════

The conversation flows CONTINUOUSLY. No rigid beats. Natural progression.

┌─────────────────────────────────────────────────────────────────────────────┐
│ SOFT OPENING (Lines 1-2) — Warm, Curious Entry                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Energy: LOW → MEDIUM (inviting, not explosive)                              │
│                                                                             │
│ Rahul opens with:                                                           │
│ ├─ A specific observation or fact he discovered                            │
│ ├─ Personal connection to the topic                                        │
│ └─ A question that invites Anjali's expertise                              │
│                                                                             │
│ Anjali responds with:                                                       │
│ ├─ Acknowledgment + first major fact                                       │
│ └─ Sets up the exploration                                                 │
│                                                                             │
│ GOOD OPENER:                                                                │
│ Rahul: "Yaar Anjali, I was reading about the first Cricket World Cup,     │
│         1975 mein hua tha England mein. That's almost 50 years ago!"       │
│ Anjali: "Haan, and you know what's interesting? Sirf 8 teams thi us time. │
│          West Indies ne tournament dominate kiya."                          │
│                                                                             │
│ BAD OPENER:                                                                 │
│ Rahul: "Yaar, pehla Cricket World Cup kab hua tha?" (no fact, just asks)  │
│ Anjali: "Hmm, actually 1975 mein hua tha." (filler-first)                  │
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

FACT DISTRIBUTION:
├─ Lines 1-2: 2-3 facts (establish topic)
├─ Lines 3-8: 5-7 facts (explore depth)
├─ Lines 9-11: 1-2 facts (connect to bigger picture)

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

BEFORE GENERATING, silently verify:
□ Lines 1-2: Soft opening, at least 2 facts established
□ Lines 3-8: Fact-dense exploration, each turn adds information
□ Lines 9-11: Soft landing, reflective close
□ EVERY turn contains at least 1 fact or insight
□ NO filler-first sentences
□ NO empty reactions
□ Energy: flat with soft edges (no spikes)
□ All facts from SOURCE URL only
□ 10-12 lines total (~60 seconds)
□ Sounds like two knowledgeable friends talking, not a scripted exchange
`;

// Fallback: Generate script using Groq (LLaMA 3.3 70B)
const generateScriptWithGroq = async (prompt: string): Promise<ConversationData> => {
  console.log("🔄 Using Groq (LLaMA 3.3 70B) as fallback...");
  
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a Hinglish podcast scriptwriter creating 60-second FACT-RICH conversations.

CORE PHILOSOPHY:
- EVERY turn must contain at least ONE concrete fact (name, date, number, event)
- NEVER start sentences with fillers (Hmm, Actually, Well, See)
- Reactions must REFERENCE something specific from previous turn
- NO empty reactions (avoid standalone "Wow!", "Crazy!", "Uff!")

PERSONAS:
- ANJALI: Expert host, shares facts confidently with specific details (dates, names, numbers)
- RAHUL: Engaged co-host, asks smart questions, adds his own knowledge
Both sound like knowledgeable friends sharing insights, not scripted RJs.

CONVERSATION FLOW:
Lines 1-2 (SOFT OPENING): Warm, curious entry. Lower energy. 2-3 facts.
Lines 3-8 (EXPLORATION): Fact-dense exchange. Steady energy. 5-7 facts.
Lines 9-11 (SOFT LANDING): Reflective close. Settling energy. 1-2 facts.

ENERGY: Flat with soft edges. No explosive openings, no energy spikes, soft ending.

GOOD EXAMPLES:
✓ "1975 mein England mein hua tha, sirf 8 teams thi!" (fact-rich)
✓ "Wait, Clive Lloyd ki captaincy? That's the guy with 189 runs!" (builds on previous)
✓ "Haan, and West Indies ne Australia ko 17 runs se haraya final mein." (adds detail)

BAD EXAMPLES:
✗ "Hmm, actually let me think..." (filler-first, no content)
✗ "Wow, that's crazy!" (empty reaction)
✗ "So the thing is— actually, let me put it this way—" (mechanical)
✗ "But what about—" (incomplete with no purpose)

ANTI-PATTERNS:
- NEVER: Filler-first sentences
- NEVER: Empty reactions without substance
- NEVER: Rahul just agreeing ("Haan yaar, sahi kaha")
- NEVER: (laughs), (pause) markers. Use punctuation.

TTS RULES:
- Numbers: English digits only ("1975", "291 runs", "$87 million")
- Use commas for natural pauses, ellipsis for trailing thoughts

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
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/be7db068-3ff4-4409-a71d-2fa2adf1e8d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:generateScriptWithGemini:entry',message:'Gemini generate called',data:{promptLength:prompt.length,model:'gemini-2.5-flash'},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/be7db068-3ff4-4409-a71d-2fa2adf1e8d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:generateScriptWithGemini:success',message:'Gemini response received',data:{contentLength:content?.length || 0,hasContent:!!content,contentPreview:content?.substring(0,200),contentEnd:content?.substring(content.length-100),finishReason:result.response.candidates?.[0]?.finishReason},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H6-H7-H8'})}).catch(()=>{});
    // #endregion
    if (!content) throw new Error("No response from Gemini");
    
    return JSON.parse(content) as ConversationData;
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/be7db068-3ff4-4409-a71d-2fa2adf1e8d9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'geminiService.ts:generateScriptWithGemini:error',message:'Gemini error caught',data:{errorMessage:error?.message,errorName:error?.name,errorStatus:error?.status,errorDetails:error?.errorDetails?.slice(0,2)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1-H2-H3-H4-H5'})}).catch(()=>{});
    // #endregion
    throw error;
  }
};

export const generateScript = async (url: string): Promise<ConversationData> => {
  const prompt = HINGLISH_PROMPT.replace("{url}", url);

  // Try Gemini 2.0 Flash first (primary - best variety)
  try {
    const result = await generateScriptWithGemini(prompt);
    return { ...result, modelUsed: 'gemini' as const };
  } catch (geminiError) {
    console.warn("⚠️ Gemini failed, falling back to Groq:", geminiError);
    
    // Fallback to Groq/LLaMA if Gemini fails (rate limit, network error, etc.)
    const result = await generateScriptWithGroq(prompt);
    return { ...result, modelUsed: 'groq' as const };
  }
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

CORE PHILOSOPHY (ALWAYS MAINTAIN):
- EVERY turn must contain at least ONE concrete fact (name, date, number, event)
- NEVER start sentences with fillers (Hmm, Actually, Well, See)
- Reactions must REFERENCE something specific from previous turn
- NO empty reactions (avoid standalone "Wow!", "Crazy!", "Uff!")

CONVERSATION FLOW:
Lines 1-2 (SOFT OPENING): Warm, curious entry. Lower energy. 2-3 facts.
Lines 3-8 (EXPLORATION): Fact-dense exchange. Steady energy. 5-7 facts.
Lines 9-11 (SOFT LANDING): Reflective close. Settling energy. 1-2 facts.

ENERGY MANAGEMENT:
- Flat energy throughout with soft start and soft ending
- No explosive openings, no energy spikes
- Soft, reflective close

MAINTAIN:
- Same topic and speakers (Rahul & Anjali)
- Hinglish style (60% Hindi, 40% English)
- 10-12 exchanges total
- Industry-standard podcast vibe (like NPR, Spotify Original)

APPLY USER FEEDBACK by:
- Adding more facts if content feels thin
- Removing fillers if dialogue feels cluttered
- Adjusting tone and energy as requested
- Making reactions more substantive

ANTI-PATTERNS TO FIX:
- Filler-first sentences → Start with facts
- Empty reactions → Add substance
- Mechanical patterns → Natural flow
- (laughs), (pause) markers → Use punctuation
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
