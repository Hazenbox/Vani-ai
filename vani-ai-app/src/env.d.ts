/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;  // Primary: Gemini 2.0 Flash
  readonly VITE_GROQ_API_KEY: string;          // Fallback: LLaMA 3.3 70B
  readonly VITE_ELEVENLABS_API_KEY: string;    // TTS
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
