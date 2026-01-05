# Audio Analysis and Comparison Usage Guide

## Overview

This directory contains scripts for analyzing reference audio files and testing TTS generation with different settings.

## Scripts

### 1. `analyze_audio.py`

Enhanced audio analysis script that extracts:
- Basic audio properties (sample rate, duration, format)
- Voice characteristics (pitch, formants, speech rate)
- **Pitch patterns** (script opening/closing, per-dialogue start/end)
- **Emotion detection** (laughter, excitement, neutral)
- Timing patterns (pause durations)
- Recommended ElevenLabs settings

**Usage:**
```bash
python scripts/analyze_audio.py "Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast.wav"
```

**Output:** `Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json`

### 2. `test_audio_comparison.py`

Comparison test script that generates two audio versions:
- **Version A**: Default/flat settings (current behavior)
- **Version B**: Analysis-based dynamic settings with pitch variations and emotions

**Usage:**
```bash
# Set your ElevenLabs API key
export ELEVENLABS_API_KEY=your_api_key_here

# Run comparison
python scripts/test_audio_comparison.py \
  "Script training/The_Mumbai_Indians_Story_script.md" \
  "Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json"
```

**Outputs:**
- `output/mumbai_indians_default.mp3` - Version A (flat)
- `output/mumbai_indians_analysis_based.mp3` - Version B (dynamic)
- `output/comparison_report.json` - Detailed comparison

## Workflow

1. **Run Analysis:**
   ```bash
   python scripts/analyze_audio.py "Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast.wav"
   ```

2. **Review Analysis Results:**
   - Check the generated JSON file
   - Verify pitch patterns and emotion detection
   - Review recommended settings

3. **Run Comparison Test:**
   ```bash
   python scripts/test_audio_comparison.py \
     "Script training/The_Mumbai_Indians_Story_script.md" \
     "Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json"
   ```

4. **Compare Outputs:**
   - Listen to both MP3 files
   - Review `comparison_report.json`
   - Verify Version B has:
     - Dynamic opening (not flat)
     - Dynamic closing (not flat)
     - Per-dialogue pitch variations
     - Emotion-aware settings

## Key Features

### Pitch Analysis
- **Script Opening**: Analyzes first 1-2 seconds for pitch trajectory
- **Script Closing**: Analyzes last 1-2 seconds for pitch trajectory
- **Per-Dialogue**: Extracts start/end pitch for each dialogue segment
- **Trajectory Detection**: Identifies rising, falling, or stable patterns

### Emotion Detection
- **Laughter**: Detects high frequency variations and spectral patterns
- **Excitement**: Detects pitch spikes and energy bursts
- **Neutral**: Default classification for calm segments
- **Mapping**: Maps emotions to dialogue segments

### Version B Enhancements
- **Opening Variation**: Applies higher/lower style based on opening pitch
- **Closing Variation**: Applies style adjustments for closing
- **Dialogue Variations**: Adjusts style based on per-dialogue pitch patterns
- **Emotion Settings**: Applies appropriate stability/style for laughter/excitement

## Requirements

Install dependencies:
```bash
pip install -r tests/python/requirements.txt
```

Required libraries:
- `librosa>=0.10.0` - Audio analysis
- `soundfile>=0.12.0` - WAV file reading
- `scipy>=1.11.0` - Signal processing
- `pydub>=0.25.0` - Audio processing
- `numpy>=1.24.0` - Numerical operations
- `elevenlabs>=0.2.0` - TTS API

## Notes

- The analysis script works best with clear, single-speaker or well-separated multi-speaker audio
- Large audio files (>10MB) may take longer to analyze
- Version B applies dynamic settings that may differ from Version A
- Emotion detection combines audio features with text markers
- Pitch variations are mapped to ElevenLabs style/stability parameters
