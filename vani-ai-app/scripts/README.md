# Audio Analysis Scripts

This directory contains scripts for analyzing reference audio files and extracting characteristics to replicate in TTS generation.

## analyze_audio.py

Analyzes a reference audio file (.wav) to extract:
- Audio properties (sample rate, channels, duration, format)
- Voice characteristics (pitch, formants, speech rate, expressiveness)
- Timing patterns (pause durations, segment boundaries, speech rhythm)
- Audio quality metrics (RMS energy, dynamic range, frequency spectrum)

Maps findings to ElevenLabs TTS parameters for replication.

### Usage

```bash
# Basic usage
python scripts/analyze_audio.py "Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast.wav"

# With custom output path
python scripts/analyze_audio.py "Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast.wav" "config/audio_analysis.json"
```

### Output

The script generates a JSON file with analysis results:

```json
{
  "audio_properties": {
    "sample_rate": 44100,
    "channels": 2,
    "duration": 120.5,
    "format": "WAV"
  },
  "voice_characteristics": {
    "average_pitch_hz": 180.5,
    "pitch_variation_coefficient": 0.35,
    "speech_rate_wpm": 150,
    "expressiveness_score": 0.7
  },
  "timing_analysis": {
    "average_pause_duration_seconds": 0.3,
    "segment_count": 12
  },
  "recommended_elevenlabs_settings": {
    "stability": 0.35,
    "similarity_boost": 0.75,
    "style": 0.55,
    "use_speaker_boost": true,
    "output_format": "mp3_44100_128",
    "model_id": "eleven_multilingual_v2",
    "pause_duration_seconds": 0.3
  }
}
```

### Requirements

Install dependencies:

```bash
pip install -r tests/python/requirements.txt
```

Required libraries:
- `librosa>=0.10.0` - Audio analysis
- `soundfile>=0.12.0` - WAV file reading
- `scipy>=1.11.0` - Signal processing
- `pydub>=0.25.0` - Audio file handling
- `numpy>=1.24.0` - Numerical operations

## Integrating Analysis Results

### Option 1: Manual Configuration

1. Run the analysis script to generate JSON output
2. Copy the `recommended_elevenlabs_settings` from the JSON
3. Update `services/geminiService.ts` to use these settings

### Option 2: Programmatic Loading (Future)

The TTS service (`services/geminiService.ts`) includes a `loadAudioAnalysisConfig()` function that can be used to load analysis results:

```typescript
import { loadAudioAnalysisConfig } from './services/podcastService';

// Load analysis results
const analysisResults = await fetch('/path/to/analysis.json').then(r => r.json());
loadAudioAnalysisConfig(analysisResults);
```

### Current Implementation

The TTS system now:
- ✅ Uses analysis-based voice settings when available
- ✅ Applies recommended stability, similarity_boost, style, and speaker_boost
- ✅ Uses extracted pause durations between segments
- ✅ Matches output format from analysis
- ✅ Falls back to sensible defaults if analysis not available

## Example Workflow

1. **Analyze reference audio**:
   ```bash
   python scripts/analyze_audio.py "Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast.wav"
   ```

2. **Review the generated JSON** (e.g., `IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json`)

3. **The TTS system will automatically use these settings** when generating audio, or you can manually configure them in `services/geminiService.ts`

## Notes

- The analysis script works best with clear, single-speaker or well-separated multi-speaker audio
- For Hinglish speech, the script accounts for code-switching patterns
- Large audio files (>10MB) may take longer to analyze
- The script handles various WAV formats (PCM, different bit depths)
