#!/usr/bin/env python3
"""
Audio Comparison Test Script

Generates two versions of audio from the same script:
- Version A: Default/flat settings (current behavior)
- Version B: Analysis-based dynamic settings with pitch variations and emotions

Compares the outputs for testing before applying to main project.
"""

import sys
import json
import re
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

try:
    from elevenlabs import ElevenLabs
    from pydub import AudioSegment
    from pydub.silence import split_on_silence
    import numpy as np
except ImportError as e:
    print(f"❌ Missing required library: {e}")
    print("Please install: pip install elevenlabs pydub numpy")
    sys.exit(1)


# Voice IDs matching main project
VOICE_IDS = {
    "Rahul": "mCQMfsqGDT6IDkEKR20a",  # Indian male voice
    "Anjali": "2zRM7PkgwBPiau2jvVXc"   # Indian female voice
}

# Default settings (Version A - Flat)
DEFAULT_SETTINGS = {
    "stability": 0.35,
    "similarity_boost": 0.75,
    "style": 0.55,
    "use_speaker_boost": True,
    "pause_duration_seconds": 0.3
}


def parse_markdown_script(script_path: str) -> List[Dict[str, str]]:
    """Parse markdown script format into structured dialogue list."""
    with open(script_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern to match: **Speaker**: text
    pattern = r'\*\*(Rahul|Anjali)\*\*:\s*(.+?)(?=\n\*\*|\Z)'
    matches = re.findall(pattern, content, re.DOTALL)
    
    script = []
    for speaker, text in matches:
        # Clean text: remove extra whitespace, keep emotion markers
        text = ' '.join(text.split())
        script.append({
            "speaker": speaker,
            "text": text
        })
    
    return script


def clean_text_for_tts(text: str) -> str:
    """Clean text for TTS, handling emotion markers."""
    # Emotion markers mapping (similar to main project)
    emotion_markers = {
        r'\(laughs?\)': 'haha',
        r'\(giggles?\)': 'hehe',
        r'\(chuckles?\)': 'heh',
        r'\(surprised?\)': 'arey',
        r'\(excited?\)': '',
        r'\(thinking?\)': 'hmm',
    }
    
    cleaned = text
    for pattern, replacement in emotion_markers.items():
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
    
    # Remove remaining parenthetical markers
    cleaned = re.sub(r'\([^)]*\)', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    return cleaned


def detect_emotion_in_text(text: str) -> Optional[str]:
    """Detect emotion markers in text."""
    text_lower = text.lower()
    if re.search(r'\(laughs?\)|\(giggles?\)|\(chuckles?\)', text_lower):
        return "laughter"
    elif re.search(r'\(excited?\)|\(surprised?\)', text_lower):
        return "excitement"
    return None


def get_dialogue_settings_version_a(dialogue_index: int, total_dialogues: int, text: str) -> Dict:
    """Get voice settings for Version A (default/flat)."""
    # Flat settings for all dialogues
    return DEFAULT_SETTINGS.copy()


def get_dialogue_settings_version_b(
    dialogue_index: int,
    total_dialogues: int,
    text: str,
    analysis_config: Dict
) -> Dict:
    """Get voice settings for Version B (analysis-based dynamic)."""
    base_settings = analysis_config.get("recommended_elevenlabs_settings", DEFAULT_SETTINGS).copy()
    
    pitch_analysis = analysis_config.get("pitch_analysis", {})
    emotion_analysis = analysis_config.get("emotion_analysis", {})
    
    # Apply opening variation
    if dialogue_index == 0 and "script_opening" in pitch_analysis:
        opening = pitch_analysis["script_opening"]
        if opening.get("pitch_trajectory") == "rising":
            base_settings["style"] = min(0.9, base_settings.get("style", 0.55) + 0.1)
            base_settings["stability"] = max(0.1, base_settings.get("stability", 0.35) - 0.05)
        elif opening.get("pitch_trajectory") == "falling":
            base_settings["style"] = max(0.1, base_settings.get("style", 0.55) - 0.05)
        # High start pitch
        if opening.get("start_pitch_hz", 0) > 180:
            base_settings["style"] = min(0.9, base_settings.get("style", 0.55) + 0.05)
    
    # Apply closing variation
    if dialogue_index == total_dialogues - 1 and "script_closing" in pitch_analysis:
        closing = pitch_analysis["script_closing"]
        if closing.get("pitch_trajectory") == "falling":
            base_settings["style"] = max(0.1, base_settings.get("style", 0.55) - 0.1)
            base_settings["stability"] = min(0.9, base_settings.get("stability", 0.35) + 0.05)
        # Low end pitch
        if closing.get("end_pitch_hz", 0) < 170:
            base_settings["style"] = max(0.1, base_settings.get("style", 0.55) - 0.05)
    
    # Apply per-dialogue pitch pattern
    per_dialogue = pitch_analysis.get("per_dialogue", [])
    if dialogue_index < len(per_dialogue):
        dialogue_pitch = per_dialogue[dialogue_index]
        trajectory = dialogue_pitch.get("trajectory", "stable")
        
        if trajectory == "falling":
            # Start higher, end lower
            base_settings["style"] = min(0.9, base_settings.get("style", 0.55) + 0.05)
        elif trajectory == "rising":
            # Start lower, end higher
            base_settings["style"] = max(0.1, base_settings.get("style", 0.55) - 0.05)
        
        # Adjust based on start/end pitch difference
        start_pitch = dialogue_pitch.get("start_pitch_hz", 0)
        end_pitch = dialogue_pitch.get("end_pitch_hz", 0)
        if start_pitch > 0 and end_pitch > 0:
            pitch_diff = start_pitch - end_pitch
            if pitch_diff > 10:  # Falling significantly
                base_settings["style"] = max(0.1, base_settings.get("style", 0.55) - 0.03)
            elif pitch_diff < -10:  # Rising significantly
                base_settings["style"] = min(0.9, base_settings.get("style", 0.55) + 0.03)
    
    # Apply emotion-based adjustments
    emotion = detect_emotion_in_text(text)
    if emotion == "laughter":
        base_settings["stability"] = 0.25
        base_settings["style"] = 0.75
    elif emotion == "excitement":
        base_settings["stability"] = 0.35
        base_settings["style"] = 0.65
    
    # Also check emotion analysis from audio
    emotion_segments = emotion_analysis.get("emotion_segments", [])
    for seg in emotion_segments:
        if seg.get("index") == dialogue_index:
            emotion_type = seg.get("emotion_type")
            intensity = seg.get("intensity", 0.5)
            if emotion_type == "laughter":
                base_settings["stability"] = max(0.1, 0.3 - (intensity * 0.1))
                base_settings["style"] = min(0.9, 0.7 + (intensity * 0.1))
            elif emotion_type == "excitement":
                base_settings["stability"] = max(0.1, 0.4 - (intensity * 0.1))
                base_settings["style"] = min(0.9, 0.6 + (intensity * 0.1))
    
    # Ensure values are in valid range
    base_settings["stability"] = max(0.1, min(0.9, base_settings.get("stability", 0.35)))
    base_settings["style"] = max(0.1, min(0.9, base_settings.get("style", 0.55)))
    base_settings["similarity_boost"] = max(0.3, min(0.9, base_settings.get("similarity_boost", 0.75)))
    
    return base_settings


def generate_audio_version(
    script: List[Dict[str, str]],
    analysis_config: Optional[Dict],
    version: str,
    output_path: str,
    elevenlabs_client: ElevenLabs
) -> Dict:
    """Generate audio for a version (A or B)."""
    print(f"\n🎙️ Generating {version}...")
    
    audio_segments = []
    settings_used = []
    pause_duration = DEFAULT_SETTINGS["pause_duration_seconds"]
    
    if analysis_config:
        pause_duration = analysis_config.get("recommended_elevenlabs_settings", {}).get(
            "pause_duration_seconds", DEFAULT_SETTINGS["pause_duration_seconds"]
        )
    
    for i, dialogue in enumerate(script):
        speaker = dialogue["speaker"]
        text = dialogue["text"]
        cleaned_text = clean_text_for_tts(text)
        
        voice_id = VOICE_IDS.get(speaker)
        if not voice_id:
            print(f"   ⚠️ Warning: Unknown speaker {speaker}, skipping...")
            continue
        
        # Get settings based on version
        if version == "A":
            settings = get_dialogue_settings_version_a(i, len(script), text)
        else:
            settings = get_dialogue_settings_version_b(i, len(script), text, analysis_config or {})
        
        settings_used.append({
            "dialogue_index": i,
            "speaker": speaker,
            "settings": settings.copy()
        })
        
        print(f"   [{i+1}/{len(script)}] {speaker}: stability={settings['stability']:.2f}, style={settings['style']:.2f}")
        
        try:
            # Generate audio with ElevenLabs
            audio_stream = elevenlabs_client.text_to_speech.convert(
                voice_id=voice_id,
                text=cleaned_text,
                model_id=settings.get("model_id", "eleven_multilingual_v2"),
                output_format=settings.get("output_format", "mp3_44100_128"),
                voice_settings={
                    "stability": settings["stability"],
                    "similarity_boost": settings["similarity_boost"],
                    "style": settings["style"],
                    "use_speaker_boost": settings["use_speaker_boost"]
                }
            )
            
            # Save to temporary file
            temp_path = f"/tmp/segment_{i}_{version}.mp3"
            with open(temp_path, 'wb') as f:
                for chunk in audio_stream:
                    f.write(chunk)
            
            # Load with pydub
            segment = AudioSegment.from_mp3(temp_path)
            audio_segments.append(segment)
            
            # Add pause after segment (except last one)
            if i < len(script) - 1:
                pause_ms = int(pause_duration * 1000)
                audio_segments.append(AudioSegment.silent(duration=pause_ms))
            
            os.remove(temp_path)
            
        except Exception as e:
            print(f"   ❌ Error generating audio for dialogue {i}: {e}")
            continue
    
    # Combine all segments
    if audio_segments:
        combined = sum(audio_segments)
        combined.export(output_path, format="mp3")
        print(f"   ✅ Saved to: {output_path}")
        print(f"   Duration: {len(combined) / 1000.0:.2f} seconds")
        
        return {
            "output_path": output_path,
            "duration_seconds": len(combined) / 1000.0,
            "file_size_bytes": os.path.getsize(output_path),
            "settings_used": settings_used
        }
    else:
        print(f"   ❌ No audio segments generated")
        return {}


def generate_comparison_report(
    version_a_result: Dict,
    version_b_result: Dict,
    analysis_config: Dict,
    output_path: str
):
    """Generate comparison report JSON."""
    report = {
        "comparison_date": str(Path(output_path).stat().st_mtime) if os.path.exists(output_path) else "",
        "version_a": {
            "description": "Default/flat settings - current behavior",
            "duration_seconds": version_a_result.get("duration_seconds", 0),
            "file_size_bytes": version_a_result.get("file_size_bytes", 0),
            "settings_summary": {
                "stability": DEFAULT_SETTINGS["stability"],
                "similarity_boost": DEFAULT_SETTINGS["similarity_boost"],
                "style": DEFAULT_SETTINGS["style"],
                "use_speaker_boost": DEFAULT_SETTINGS["use_speaker_boost"]
            }
        },
        "version_b": {
            "description": "Analysis-based dynamic settings with pitch variations and emotions",
            "duration_seconds": version_b_result.get("duration_seconds", 0),
            "file_size_bytes": version_b_result.get("file_size_bytes", 0),
            "settings_summary": analysis_config.get("recommended_elevenlabs_settings", {}),
            "pitch_analysis_applied": {
                "opening_variation": "script_opening" in analysis_config.get("pitch_analysis", {}),
                "closing_variation": "script_closing" in analysis_config.get("pitch_analysis", {}),
                "per_dialogue_variations": len(analysis_config.get("pitch_analysis", {}).get("per_dialogue", []))
            },
            "emotion_analysis_applied": {
                "emotion_segments_detected": len(analysis_config.get("emotion_analysis", {}).get("emotion_segments", [])),
                "emotion_distribution": analysis_config.get("emotion_analysis", {}).get("emotion_distribution", {})
            }
        },
        "differences": {
            "duration_diff_seconds": version_b_result.get("duration_seconds", 0) - version_a_result.get("duration_seconds", 0),
            "file_size_diff_bytes": version_b_result.get("file_size_bytes", 0) - version_a_result.get("file_size_bytes", 0)
        },
        "recommendations": []
    }
    
    # Add recommendations
    if version_b_result.get("duration_seconds", 0) > 0:
        report["recommendations"].append(
            "Version B uses dynamic pitch variations and emotion-aware settings"
        )
    
    if analysis_config.get("pitch_analysis", {}).get("script_opening", {}).get("pitch_trajectory") == "rising":
        report["recommendations"].append(
            "Reference audio has rising opening - Version B applies higher style for first dialogue"
        )
    
    if analysis_config.get("pitch_analysis", {}).get("script_closing", {}).get("pitch_trajectory") == "falling":
        report["recommendations"].append(
            "Reference audio has falling closing - Version B applies lower style for last dialogue"
        )
    
    # Save report
    with open(output_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\n📊 Comparison report saved to: {output_path}")


def main():
    """Main entry point."""
    if len(sys.argv) < 3:
        print("Usage: python test_audio_comparison.py <script_path> <analysis_json_path> [elevenlabs_api_key]")
        print("\nExample:")
        print("  python test_audio_comparison.py 'Script training/The_Mumbai_Indians_Story_script.md' 'Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json'")
        sys.exit(1)
    
    script_path = sys.argv[1]
    analysis_json_path = sys.argv[2]
    api_key = sys.argv[3] if len(sys.argv) > 3 else os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key:
        print("❌ Error: ElevenLabs API key required")
        print("   Set ELEVENLABS_API_KEY environment variable or pass as third argument")
        sys.exit(1)
    
    # Initialize ElevenLabs client
    elevenlabs_client = ElevenLabs(api_key=api_key)
    
    # Load analysis config
    print(f"📂 Loading analysis config from: {analysis_json_path}")
    with open(analysis_json_path, 'r') as f:
        analysis_config = json.load(f)
    
    # Parse script
    print(f"📝 Parsing script from: {script_path}")
    script = parse_markdown_script(script_path)
    print(f"   Found {len(script)} dialogues")
    
    # Create output directory
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    
    # Generate Version A (default/flat)
    version_a_path = output_dir / "mumbai_indians_default.mp3"
    version_a_result = generate_audio_version(
        script, None, "A", str(version_a_path), elevenlabs_client
    )
    
    # Generate Version B (analysis-based/dynamic)
    version_b_path = output_dir / "mumbai_indians_analysis_based.mp3"
    version_b_result = generate_audio_version(
        script, analysis_config, "B", str(version_b_path), elevenlabs_client
    )
    
    # Generate comparison report
    report_path = output_dir / "comparison_report.json"
    generate_comparison_report(version_a_result, version_b_result, analysis_config, str(report_path))
    
    print("\n" + "=" * 60)
    print("✅ COMPARISON TEST COMPLETE")
    print("=" * 60)
    print(f"Version A (Default): {version_a_path}")
    print(f"Version B (Analysis-Based): {version_b_path}")
    print(f"Comparison Report: {report_path}")
    print("\n🎧 Listen to both versions and compare the differences!")


if __name__ == "__main__":
    main()
