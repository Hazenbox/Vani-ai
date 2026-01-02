import { ElevenLabsClient } from "elevenlabs";
import { ScriptPart, AudioResult, SegmentTiming } from "../types";
import { cleanTextForTTS } from "./podcastService";

const VOICE_IDS = {
  Rahul: "mCQMfsqGDT6IDkEKR20a",
  Anjali: "2zRM7PkgwBPiau2jvVXc"
};

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
  pitch_analysis?: {
    script_opening?: {
      start_pitch_hz: number;
      pitch_trajectory: string;
      energy_level: number;
    };
    script_closing?: {
      end_pitch_hz: number;
      pitch_trajectory: string;
      energy_level: number;
    };
    per_dialogue?: Array<{
      index: number;
      start_pitch_hz: number;
      end_pitch_hz: number;
      trajectory: string;
      pitch_range: number;
    }>;
  };
  emotion_analysis?: {
    emotion_segments?: Array<{
      index: number;
      emotion_type: string;
      intensity: number;
    }>;
  };
}

const DEFAULT_SETTINGS: VoiceSettings = {
  stability: 0.35,
  similarity_boost: 0.75,
  style: 0.55,
  use_speaker_boost: true
};

function detectEmotionInText(text: string): string | null {
  const textLower = text.toLowerCase();
  if (/(laughs?|giggles?|chuckles?)/i.test(textLower)) {
    return "laughter";
  }
  if (/(excited?|surprised?)/i.test(textLower)) {
    return "excitement";
  }
  return null;
}

function getDialogueSettingsVersionA(
  dialogueIndex: number,
  totalDialogues: number,
  text: string
): VoiceSettings {
  return { ...DEFAULT_SETTINGS };
}

function getDialogueSettingsVersionB(
  dialogueIndex: number,
  totalDialogues: number,
  text: string,
  analysisConfig: AudioAnalysisConfig
): VoiceSettings {
  const baseSettings = { ...analysisConfig.recommended_elevenlabs_settings };
  const pitchAnalysis = analysisConfig.pitch_analysis || {};
  const emotionAnalysis = analysisConfig.emotion_analysis || {};

  // Apply opening variation
  if (dialogueIndex === 0 && pitchAnalysis.script_opening) {
    const opening = pitchAnalysis.script_opening;
    if (opening.pitch_trajectory === "rising") {
      baseSettings.style = Math.min(0.9, baseSettings.style + 0.1);
      baseSettings.stability = Math.max(0.1, baseSettings.stability - 0.05);
    } else if (opening.pitch_trajectory === "falling") {
      baseSettings.style = Math.max(0.1, baseSettings.style - 0.05);
    }
    if (opening.start_pitch_hz > 180) {
      baseSettings.style = Math.min(0.9, baseSettings.style + 0.05);
    }
  }

  // Apply closing variation
  if (dialogueIndex === totalDialogues - 1 && pitchAnalysis.script_closing) {
    const closing = pitchAnalysis.script_closing;
    if (closing.pitch_trajectory === "falling") {
      baseSettings.style = Math.max(0.1, baseSettings.style - 0.1);
      baseSettings.stability = Math.min(0.9, baseSettings.stability + 0.05);
    }
    if (closing.end_pitch_hz < 170) {
      baseSettings.style = Math.max(0.1, baseSettings.style - 0.05);
    }
  }

  // Apply per-dialogue pitch pattern
  if (pitchAnalysis.per_dialogue && dialogueIndex < pitchAnalysis.per_dialogue.length) {
    const dialoguePitch = pitchAnalysis.per_dialogue[dialogueIndex];
    if (dialoguePitch.trajectory === "falling") {
      baseSettings.style = Math.min(0.9, baseSettings.style + 0.05);
    } else if (dialoguePitch.trajectory === "rising") {
      baseSettings.style = Math.max(0.1, baseSettings.style - 0.05);
    }
    
    const pitchDiff = dialoguePitch.start_pitch_hz - dialoguePitch.end_pitch_hz;
    if (pitchDiff > 10) {
      baseSettings.style = Math.max(0.1, baseSettings.style - 0.03);
    } else if (pitchDiff < -10) {
      baseSettings.style = Math.min(0.9, baseSettings.style + 0.03);
    }
  }

  // Apply emotion-based adjustments
  const emotion = detectEmotionInText(text);
  if (emotion === "laughter") {
    baseSettings.stability = 0.25;
    baseSettings.style = 0.75;
  } else if (emotion === "excitement") {
    baseSettings.stability = 0.35;
    baseSettings.style = 0.65;
  }

  // Check emotion analysis from audio
  if (emotionAnalysis.emotion_segments) {
    for (const seg of emotionAnalysis.emotion_segments) {
      if (seg.index === dialogueIndex) {
        const intensity = seg.intensity || 0.5;
        if (seg.emotion_type === "laughter") {
          baseSettings.stability = Math.max(0.1, 0.3 - intensity * 0.1);
          baseSettings.style = Math.min(0.9, 0.7 + intensity * 0.1);
        } else if (seg.emotion_type === "excitement") {
          baseSettings.stability = Math.max(0.1, 0.4 - intensity * 0.1);
          baseSettings.style = Math.min(0.9, 0.6 + intensity * 0.1);
        }
      }
    }
  }

  // Ensure values are in valid range
  baseSettings.stability = Math.max(0.1, Math.min(0.9, baseSettings.stability));
  baseSettings.style = Math.max(0.1, Math.min(0.9, baseSettings.style));
  baseSettings.similarity_boost = Math.max(0.3, Math.min(0.9, baseSettings.similarity_boost));

  return baseSettings;
}

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

export async function generateAudioVersion(
  script: ScriptPart[],
  version: "A" | "B",
  analysisConfig: AudioAnalysisConfig | null,
  elevenlabs: ElevenLabsClient
): Promise<AudioResult & { settingsUsed: Array<{ index: number; speaker: string; settings: VoiceSettings }> }> {
  const audioChunks: ArrayBuffer[] = [];
  const segmentByteLengths: number[] = [];
  const cleanedScript: ScriptPart[] = [];
  const settingsUsed: Array<{ index: number; speaker: string; settings: VoiceSettings }> = [];
  
  const pauseDuration = analysisConfig?.recommended_elevenlabs_settings?.pause_duration_seconds || 0.3;
  const outputFormat = analysisConfig?.recommended_elevenlabs_settings?.output_format || "mp3_44100_128";
  const modelId = analysisConfig?.recommended_elevenlabs_settings?.model_id || "eleven_multilingual_v2";

  for (let i = 0; i < script.length; i++) {
    const part = script[i];
    const voiceId = VOICE_IDS[part.speaker as keyof typeof VOICE_IDS];
    
    let settings: VoiceSettings;
    if (version === "A") {
      settings = getDialogueSettingsVersionA(i, script.length, part.text);
    } else {
      settings = getDialogueSettingsVersionB(i, script.length, part.text, analysisConfig!);
    }
    
    settingsUsed.push({
      index: i,
      speaker: part.speaker,
      settings: { ...settings }
    });
    
    const cleanedText = cleanTextForTTS(part.text);
    cleanedScript.push({
      speaker: part.speaker,
      text: part.text,
      cleanedText: cleanedText
    });
    
    const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text: cleanedText,
      model_id: modelId,
      output_format: outputFormat,
      voice_settings: {
        stability: settings.stability,
        similarity_boost: settings.similarity_boost,
        style: settings.style,
        use_speaker_boost: settings.use_speaker_boost
      }
    });
    
    const audioBuffer = await streamToArrayBuffer(audioStream as unknown as ReadableStream<Uint8Array>);
    audioChunks.push(audioBuffer);
    segmentByteLengths.push(audioBuffer.byteLength);
  }
  
  // Combine all audio chunks
  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  
  // Convert to base64
  let binary = '';
  const bytes = combined;
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);
  
  // Calculate segment timings
  const BYTES_PER_SECOND = 16000;
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
    
    // Add pause duration after each segment (except the last one)
    if (i < segmentByteLengths.length - 1) {
      currentTime += pauseDuration;
    }
  }
  
  return {
    audioBase64,
    segmentTimings,
    cleanedScript,
    settingsUsed
  };
}
