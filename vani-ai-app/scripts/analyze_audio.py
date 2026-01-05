#!/usr/bin/env python3
"""
Audio Analysis Script for Vani AI

Analyzes a reference audio file (.wav) to extract:
- Audio properties (sample rate, channels, duration, format)
- Voice characteristics (pitch, formants, speech rate, expressiveness)
- Timing patterns (pause durations, segment boundaries, speech rhythm)
- Audio quality metrics (RMS energy, dynamic range, frequency spectrum)

Maps findings to ElevenLabs TTS parameters for replication.
"""

import sys
import json
import os
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

try:
    import librosa
    import soundfile as sf
    import numpy as np
    from scipy import signal
    from scipy.stats import mode
    from pydub import AudioSegment
    from pydub.utils import mediainfo
except ImportError as e:
    print(f"❌ Missing required library: {e}")
    print("Please install: pip install librosa soundfile scipy pydub numpy")
    sys.exit(1)


class AudioAnalyzer:
    """Analyzes audio files to extract characteristics for TTS replication."""
    
    def __init__(self, audio_path: str):
        """Initialize analyzer with audio file path."""
        self.audio_path = Path(audio_path)
        if not self.audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        self.audio_properties = {}
        self.voice_characteristics = {}
        self.timing_analysis = {}
        self.audio_quality = {}
        self.recommended_settings = {}
        self.pitch_analysis = {}
        self.emotion_analysis = {}
    
    def analyze(self) -> Dict:
        """Run complete analysis and return results."""
        print(f"🎵 Analyzing audio: {self.audio_path.name}")
        print("=" * 60)
        
        # Step 1: Extract basic audio properties
        print("\n📊 Step 1: Extracting audio properties...")
        self._extract_audio_properties()
        
        # Step 2: Load audio for detailed analysis
        print("\n🎙️ Step 2: Loading audio for analysis...")
        y, sr = self._load_audio()
        
        # Step 3: Analyze voice characteristics
        print("\n🔊 Step 3: Analyzing voice characteristics...")
        self._analyze_voice_characteristics(y, sr)
        
        # Step 4: Analyze timing patterns
        print("\n⏱️ Step 4: Analyzing timing patterns...")
        self._analyze_timing_patterns(y, sr)
        
        # Step 5: Analyze audio quality
        print("\n📈 Step 5: Analyzing audio quality metrics...")
        self._analyze_audio_quality(y, sr)
        
        # Step 6: Analyze pitch patterns (script and dialogue level)
        print("\n🎵 Step 6: Analyzing pitch patterns...")
        onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time', backtrack=True)
        self._analyze_script_pitch_patterns(y, sr, onsets)
        self._analyze_dialogue_pitch_patterns(y, sr, onsets)
        
        # Step 7: Analyze emotions
        print("\n😊 Step 7: Analyzing emotions...")
        self._analyze_emotions(y, sr, onsets)
        
        # Step 8: Map to ElevenLabs settings
        print("\n⚙️ Step 8: Mapping to ElevenLabs parameters...")
        self._map_to_elevenlabs_settings()
        
        # Compile results
        results = {
            "audio_properties": self.audio_properties,
            "voice_characteristics": self.voice_characteristics,
            "timing_analysis": self.timing_analysis,
            "audio_quality": self.audio_quality,
            "pitch_analysis": self.pitch_analysis,
            "emotion_analysis": self.emotion_analysis,
            "recommended_elevenlabs_settings": self.recommended_settings
        }
        
        print("\n✅ Analysis complete!")
        return results
    
    def _extract_audio_properties(self):
        """Extract basic audio file properties using pydub."""
        try:
            audio = AudioSegment.from_file(str(self.audio_path))
            info = mediainfo(str(self.audio_path))
            
            self.audio_properties = {
                "sample_rate": audio.frame_rate,
                "channels": audio.channels,
                "duration": len(audio) / 1000.0,  # Convert ms to seconds
                "format": self.audio_path.suffix[1:].upper(),  # Remove dot
                "bit_depth": audio.sample_width * 8,
                "file_size_mb": self.audio_path.stat().st_size / (1024 * 1024),
                "frame_rate": audio.frame_rate,
                "codec": info.get('codec_name', 'unknown') if info else 'unknown'
            }
            
            print(f"   Sample Rate: {self.audio_properties['sample_rate']} Hz")
            print(f"   Channels: {self.audio_properties['channels']}")
            print(f"   Duration: {self.audio_properties['duration']:.2f} seconds")
            print(f"   Format: {self.audio_properties['format']}")
            
        except Exception as e:
            print(f"   ⚠️ Warning: Could not extract all properties: {e}")
            self.audio_properties = {"error": str(e)}
    
    def _load_audio(self) -> Tuple[np.ndarray, int]:
        """Load audio file using librosa."""
        try:
            y, sr = librosa.load(str(self.audio_path), sr=None, mono=False)
            
            # Convert to mono if stereo
            if len(y.shape) > 1:
                y = librosa.to_mono(y)
            
            return y, sr
        except Exception as e:
            raise RuntimeError(f"Failed to load audio: {e}")
    
    def _analyze_voice_characteristics(self, y: np.ndarray, sr: int):
        """Analyze voice characteristics: pitch, formants, speech rate."""
        try:
            # Extract pitch (fundamental frequency) using librosa
            pitches, magnitudes = librosa.piptrack(y=y, sr=sr, threshold=0.1)
            
            # Get pitch values (non-zero)
            pitch_values = []
            for t in range(pitches.shape[1]):
                index = magnitudes[:, t].argmax()
                pitch = pitches[index, t]
                if pitch > 0:
                    pitch_values.append(pitch)
            
            if pitch_values:
                avg_pitch = np.mean(pitch_values)
                pitch_std = np.std(pitch_values)
                pitch_range = np.max(pitch_values) - np.min(pitch_values)
                pitch_variation = pitch_std / avg_pitch if avg_pitch > 0 else 0
            else:
                avg_pitch = 0
                pitch_std = 0
                pitch_range = 0
                pitch_variation = 0
            
            # Estimate speech rate (approximate)
            # Use onset detection to find speech segments
            onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time')
            speech_rate_wpm = len(onsets) * 60 / self.audio_properties.get('duration', 1) if self.audio_properties.get('duration', 0) > 0 else 0
            
            # Extract formants (voice timbre) - simplified approach
            # Formants are typically at F1: 500-800Hz, F2: 1000-2500Hz
            fft = np.fft.fft(y)
            freqs = np.fft.fftfreq(len(fft), 1/sr)
            magnitude = np.abs(fft)
            
            # Find peaks in formant regions
            formant_region_1 = (freqs >= 500) & (freqs <= 800)
            formant_region_2 = (freqs >= 1000) & (freqs <= 2500)
            
            f1_idx = np.argmax(magnitude[formant_region_1]) if np.any(formant_region_1) else 0
            f2_idx = np.argmax(magnitude[formant_region_2]) if np.any(formant_region_2) else 0
            
            f1_freq = freqs[formant_region_1][f1_idx] if f1_idx > 0 else 0
            f2_freq = freqs[formant_region_2][f2_idx] if f2_idx > 0 else 0
            
            self.voice_characteristics = {
                "average_pitch_hz": float(avg_pitch),
                "pitch_std": float(pitch_std),
                "pitch_range": float(pitch_range),
                "pitch_variation_coefficient": float(pitch_variation),
                "speech_rate_wpm": float(speech_rate_wpm),
                "formant_f1_hz": float(f1_freq),
                "formant_f2_hz": float(f2_freq),
                "expressiveness_score": float(min(pitch_variation * 2, 1.0))  # Normalized 0-1
            }
            
            print(f"   Average Pitch: {avg_pitch:.1f} Hz")
            print(f"   Pitch Variation: {pitch_variation:.3f}")
            print(f"   Speech Rate: {speech_rate_wpm:.1f} words/min (estimated)")
            print(f"   Expressiveness: {self.voice_characteristics['expressiveness_score']:.2f}")
            
        except Exception as e:
            print(f"   ⚠️ Warning: Voice analysis error: {e}")
            self.voice_characteristics = {"error": str(e)}
    
    def _analyze_timing_patterns(self, y: np.ndarray, sr: int):
        """Analyze timing patterns: pauses, segment boundaries, rhythm."""
        try:
            # Detect onsets (speech segments)
            onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time', backtrack=True)
            
            # Calculate pause durations between onsets
            pause_durations = []
            if len(onsets) > 1:
                for i in range(len(onsets) - 1):
                    pause = onsets[i + 1] - onsets[i]
                    pause_durations.append(pause)
            
            avg_pause = np.mean(pause_durations) if pause_durations else 0.3
            min_pause = np.min(pause_durations) if pause_durations else 0.1
            max_pause = np.max(pause_durations) if pause_durations else 1.0
            
            # Detect silence segments (pauses)
            frame_length = 2048
            hop_length = 512
            rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
            rms_threshold = np.percentile(rms, 20)  # Bottom 20% considered silence
            
            # Find silence regions
            silence_frames = rms < rms_threshold
            silence_times = librosa.frames_to_time(np.where(silence_frames)[0], sr=sr, hop_length=hop_length)
            
            # Calculate average silence duration
            if len(silence_times) > 0:
                silence_durations = []
                current_silence_start = None
                for i, is_silent in enumerate(silence_frames):
                    time = librosa.frames_to_time(i, sr=sr, hop_length=hop_length)
                    if is_silent and current_silence_start is None:
                        current_silence_start = time
                    elif not is_silent and current_silence_start is not None:
                        silence_durations.append(time - current_silence_start)
                        current_silence_start = None
                
                avg_silence = np.mean(silence_durations) if silence_durations else avg_pause
            else:
                avg_silence = avg_pause
            
            # Estimate segment count (based on major onsets)
            major_onsets = librosa.onset.onset_detect(
                y=y, sr=sr, units='time', 
                delta=0.1, wait=0.5  # More selective
            )
            segment_count = len(major_onsets)
            
            self.timing_analysis = {
                "average_pause_duration_seconds": float(avg_pause),
                "min_pause_duration": float(min_pause),
                "max_pause_duration": float(max_pause),
                "average_silence_duration": float(avg_silence),
                "segment_count": int(segment_count),
                "total_onsets": int(len(onsets)),
                "speech_rhythm_regularity": float(1.0 - (np.std(pause_durations) / avg_pause) if avg_pause > 0 else 0.5)
            }
            
            print(f"   Average Pause: {avg_pause:.3f} seconds")
            print(f"   Segment Count: {segment_count}")
            print(f"   Speech Rhythm Regularity: {self.timing_analysis['speech_rhythm_regularity']:.2f}")
            
        except Exception as e:
            print(f"   ⚠️ Warning: Timing analysis error: {e}")
            self.timing_analysis = {"error": str(e)}
    
    def _analyze_audio_quality(self, y: np.ndarray, sr: int):
        """Analyze audio quality metrics: RMS energy, dynamic range, frequency spectrum."""
        try:
            # RMS energy
            rms = librosa.feature.rms(y=y)[0]
            avg_rms = np.mean(rms)
            max_rms = np.max(rms)
            min_rms = np.min(rms)
            dynamic_range_db = 20 * np.log10(max_rms / min_rms) if min_rms > 0 else 0
            
            # Frequency spectrum analysis
            fft = np.fft.fft(y)
            freqs = np.fft.fftfreq(len(fft), 1/sr)
            magnitude = np.abs(fft)
            
            # Energy in different frequency bands
            # Low: 0-300Hz, Mid: 300-3000Hz, High: 3000-8000Hz
            low_freq_mask = (freqs >= 0) & (freqs <= 300)
            mid_freq_mask = (freqs > 300) & (freqs <= 3000)
            high_freq_mask = (freqs > 3000) & (freqs <= 8000)
            
            low_energy = np.sum(magnitude[low_freq_mask])
            mid_energy = np.sum(magnitude[mid_freq_mask])
            high_energy = np.sum(magnitude[high_freq_mask])
            total_energy = low_energy + mid_energy + high_energy
            
            self.audio_quality = {
                "rms_energy_avg": float(avg_rms),
                "rms_energy_max": float(max_rms),
                "rms_energy_min": float(min_rms),
                "dynamic_range_db": float(dynamic_range_db),
                "low_freq_energy_ratio": float(low_energy / total_energy) if total_energy > 0 else 0,
                "mid_freq_energy_ratio": float(mid_energy / total_energy) if total_energy > 0 else 0,
                "high_freq_energy_ratio": float(high_energy / total_energy) if total_energy > 0 else 0,
                "clarity_score": float(mid_energy / total_energy) if total_energy > 0 else 0.5  # Mid freq = clarity
            }
            
            print(f"   Dynamic Range: {dynamic_range_db:.1f} dB")
            print(f"   Clarity Score: {self.audio_quality['clarity_score']:.2f}")
            
        except Exception as e:
            print(f"   ⚠️ Warning: Audio quality analysis error: {e}")
            self.audio_quality = {"error": str(e)}
    
    def _map_to_elevenlabs_settings(self):
        """Map analysis results to ElevenLabs voice settings."""
        try:
            # Stability: Lower = more expressive (based on pitch variation)
            # High pitch variation → Low stability (more expressive)
            pitch_var = self.voice_characteristics.get('pitch_variation_coefficient', 0.3)
            stability = max(0.1, min(0.9, 0.6 - (pitch_var * 0.5)))  # Inverse relationship
            
            # Similarity Boost: Higher = more consistent voice
            # Based on voice consistency (pitch stability and clarity)
            expressiveness = self.voice_characteristics.get('expressiveness_score', 0.5)
            clarity = self.audio_quality.get('clarity_score', 0.7)
            similarity_boost = max(0.3, min(0.9, 0.5 + (clarity * 0.3) - (expressiveness * 0.2)))
            
            # Style: Higher = more expressive (based on expressiveness score)
            style = max(0.1, min(0.9, 0.3 + (expressiveness * 0.4)))
            
            # Speaker Boost: Enable if clarity is good
            use_speaker_boost = clarity > 0.6
            
            # Output format: Match reference if possible
            sample_rate = self.audio_properties.get('sample_rate', 44100)
            if sample_rate >= 44100:
                output_format = "mp3_44100_128"
            elif sample_rate >= 22050:
                output_format = "mp3_22050_128"
            else:
                output_format = "mp3_44100_128"  # Default
            
            self.recommended_settings = {
                "stability": round(stability, 2),
                "similarity_boost": round(similarity_boost, 2),
                "style": round(style, 2),
                "use_speaker_boost": use_speaker_boost,
                "output_format": output_format,
                "model_id": "eleven_multilingual_v2",
                "pause_duration_seconds": round(self.timing_analysis.get('average_pause_duration_seconds', 0.3), 2)
            }
            
            print(f"   Recommended Stability: {stability:.2f}")
            print(f"   Recommended Similarity Boost: {similarity_boost:.2f}")
            print(f"   Recommended Style: {style:.2f}")
            print(f"   Speaker Boost: {use_speaker_boost}")
            print(f"   Pause Duration: {self.recommended_settings['pause_duration_seconds']:.2f}s")
            
        except Exception as e:
            print(f"   ⚠️ Warning: Settings mapping error: {e}")
            # Default settings
            self.recommended_settings = {
                "stability": 0.35,
                "similarity_boost": 0.75,
                "style": 0.55,
                "use_speaker_boost": True,
                "output_format": "mp3_44100_128",
                "model_id": "eleven_multilingual_v2",
                "pause_duration_seconds": 0.3
            }
    
    def _analyze_script_pitch_patterns(self, y: np.ndarray, sr: int, onsets: np.ndarray):
        """Analyze pitch patterns at script opening and closing."""
        try:
            duration = len(y) / sr
            opening_duration = min(2.0, duration * 0.1)  # First 2 seconds or 10% of audio
            closing_duration = min(2.0, duration * 0.1)  # Last 2 seconds or 10% of audio
            
            # Extract opening segment (first 1-2 seconds)
            opening_end = min(int(opening_duration * sr), len(y))
            opening_y = y[:opening_end]
            
            # Extract closing segment (last 1-2 seconds)
            closing_start = max(0, len(y) - int(closing_duration * sr))
            closing_y = y[closing_start:]
            
            # Analyze opening pitch
            opening_pitch = self._extract_pitch_contour(opening_y, sr)
            opening_trajectory = self._determine_pitch_trajectory(opening_pitch)
            opening_energy = np.mean(librosa.feature.rms(y=opening_y)[0])
            
            # Analyze closing pitch
            closing_pitch = self._extract_pitch_contour(closing_y, sr)
            closing_trajectory = self._determine_pitch_trajectory(closing_pitch)
            closing_energy = np.mean(librosa.feature.rms(y=closing_y)[0])
            
            self.pitch_analysis = {
                "script_opening": {
                    "start_pitch_hz": float(np.mean(opening_pitch)) if len(opening_pitch) > 0 else 0.0,
                    "pitch_trajectory": opening_trajectory,
                    "energy_level": float(opening_energy),
                    "duration_seconds": float(opening_duration)
                },
                "script_closing": {
                    "end_pitch_hz": float(np.mean(closing_pitch)) if len(closing_pitch) > 0 else 0.0,
                    "pitch_trajectory": closing_trajectory,
                    "energy_level": float(closing_energy),
                    "duration_seconds": float(closing_duration)
                }
            }
            
            print(f"   Opening Pitch: {self.pitch_analysis['script_opening']['start_pitch_hz']:.1f} Hz ({opening_trajectory})")
            print(f"   Closing Pitch: {self.pitch_analysis['script_closing']['end_pitch_hz']:.1f} Hz ({closing_trajectory})")
            
        except Exception as e:
            print(f"   ⚠️ Warning: Script pitch analysis error: {e}")
            self.pitch_analysis = {"error": str(e)}
    
    def _analyze_dialogue_pitch_patterns(self, y: np.ndarray, sr: int, onsets: np.ndarray):
        """Analyze pitch patterns for each dialogue segment."""
        try:
            if len(onsets) < 2:
                self.pitch_analysis["dialogue_patterns"] = {}
                self.pitch_analysis["per_dialogue"] = []
                return
            
            duration = len(y) / sr
            per_dialogue = []
            start_pitches = []
            end_pitches = []
            trajectories = []
            
            # Analyze each segment between onsets
            for i in range(len(onsets)):
                segment_start = int(onsets[i] * sr)
                segment_end = int(onsets[i + 1] * sr) if i < len(onsets) - 1 else len(y)
                
                if segment_end <= segment_start:
                    continue
                
                segment_y = y[segment_start:segment_end]
                segment_duration = len(segment_y) / sr
                
                # Extract start pitch (first 0.3-0.5 seconds)
                start_window = min(int(0.5 * sr), len(segment_y) // 2)
                start_segment = segment_y[:start_window]
                start_pitch = self._extract_pitch_contour(start_segment, sr)
                avg_start_pitch = np.mean(start_pitch) if len(start_pitch) > 0 else 0.0
                
                # Extract end pitch (last 0.3-0.5 seconds)
                end_window = min(int(0.5 * sr), len(segment_y) // 2)
                end_segment = segment_y[-end_window:] if len(segment_y) > end_window else segment_y
                end_pitch = self._extract_pitch_contour(end_segment, sr)
                avg_end_pitch = np.mean(end_pitch) if len(end_pitch) > 0 else 0.0
                
                # Extract full segment pitch for trajectory
                full_pitch = self._extract_pitch_contour(segment_y, sr)
                trajectory = self._determine_pitch_trajectory(full_pitch)
                pitch_range = np.max(full_pitch) - np.min(full_pitch) if len(full_pitch) > 0 else 0.0
                
                if avg_start_pitch > 0 and avg_end_pitch > 0:
                    start_pitches.append(avg_start_pitch)
                    end_pitches.append(avg_end_pitch)
                    trajectories.append(trajectory)
                    
                    per_dialogue.append({
                        "index": i,
                        "start_pitch_hz": float(avg_start_pitch),
                        "end_pitch_hz": float(avg_end_pitch),
                        "trajectory": trajectory,
                        "pitch_range": float(pitch_range),
                        "duration_seconds": float(segment_duration)
                    })
            
            # Calculate average patterns
            if start_pitches and end_pitches:
                avg_start = np.mean(start_pitches)
                avg_end = np.mean(end_pitches)
                common_trajectory = max(set(trajectories), key=trajectories.count) if trajectories else "stable"
                
                self.pitch_analysis["dialogue_patterns"] = {
                    "average_start_pitch_hz": float(avg_start),
                    "average_end_pitch_hz": float(avg_end),
                    "common_trajectory": common_trajectory,
                    "pitch_variation_range": float(np.max(start_pitches + end_pitches) - np.min(start_pitches + end_pitches))
                }
                self.pitch_analysis["per_dialogue"] = per_dialogue
                
                print(f"   Average Dialogue Start Pitch: {avg_start:.1f} Hz")
                print(f"   Average Dialogue End Pitch: {avg_end:.1f} Hz")
                print(f"   Common Trajectory: {common_trajectory}")
            else:
                self.pitch_analysis["dialogue_patterns"] = {}
                self.pitch_analysis["per_dialogue"] = []
                
        except Exception as e:
            print(f"   ⚠️ Warning: Dialogue pitch analysis error: {e}")
            if "dialogue_patterns" not in self.pitch_analysis:
                self.pitch_analysis["dialogue_patterns"] = {}
                self.pitch_analysis["per_dialogue"] = []
    
    def _analyze_emotions(self, y: np.ndarray, sr: int, onsets: np.ndarray):
        """Detect emotions in audio segments."""
        try:
            emotion_segments = []
            emotion_counts = {"laughter": 0, "excitement": 0, "neutral": 0}
            
            # Analyze each segment for emotions
            for i in range(len(onsets)):
                segment_start = int(onsets[i] * sr)
                segment_end = int(onsets[i + 1] * sr) if i < len(onsets) - 1 else len(y)
                
                if segment_end <= segment_start:
                    continue
                
                segment_y = y[segment_start:segment_end]
                segment_duration = len(segment_y) / sr
                
                # Detect laughter (high frequency variations, specific spectral patterns)
                laughter_score = self._detect_laughter(segment_y, sr)
                
                # Detect excitement (pitch spikes, energy bursts)
                excitement_score = self._detect_excitement(segment_y, sr)
                
                # Classify emotion
                if laughter_score > 0.6:
                    emotion_type = "laughter"
                    intensity = min(1.0, laughter_score)
                    emotion_counts["laughter"] += 1
                elif excitement_score > 0.5:
                    emotion_type = "excitement"
                    intensity = min(1.0, excitement_score)
                    emotion_counts["excitement"] += 1
                else:
                    emotion_type = "neutral"
                    intensity = 0.3
                    emotion_counts["neutral"] += 1
                
                if intensity > 0.4:  # Only record significant emotions
                    emotion_segments.append({
                        "index": i,
                        "emotion_type": emotion_type,
                        "intensity": float(intensity),
                        "duration_seconds": float(segment_duration)
                    })
            
            self.emotion_analysis = {
                "emotion_segments": emotion_segments,
                "emotion_distribution": emotion_counts
            }
            
            print(f"   Laughter segments: {emotion_counts['laughter']}")
            print(f"   Excitement segments: {emotion_counts['excitement']}")
            print(f"   Neutral segments: {emotion_counts['neutral']}")
            
        except Exception as e:
            print(f"   ⚠️ Warning: Emotion analysis error: {e}")
            self.emotion_analysis = {"error": str(e)}
    
    def _extract_pitch_contour(self, y: np.ndarray, sr: int) -> np.ndarray:
        """Extract pitch contour from audio segment."""
        try:
            # Try pyin first (more robust, but may not be available in all librosa versions)
            if hasattr(librosa, 'pyin'):
                try:
                    pitches, voiced_flag, voiced_probs = librosa.pyin(
                        y, 
                        fmin=librosa.note_to_hz('C2'),  # ~65 Hz
                        fmax=librosa.note_to_hz('C7')   # ~2093 Hz
                    )
                    # Filter out unvoiced segments
                    valid_pitches = pitches[~np.isnan(pitches)]
                    if len(valid_pitches) > 0:
                        return valid_pitches
                except:
                    pass  # Fall through to piptrack
        except:
            pass
        
        # Fallback to piptrack
        try:
            pitches, magnitudes = librosa.piptrack(y=y, sr=sr, threshold=0.1)
            pitch_values = []
            for t in range(pitches.shape[1]):
                index = magnitudes[:, t].argmax()
                pitch = pitches[index, t]
                if pitch > 0:
                    pitch_values.append(pitch)
            return np.array(pitch_values) if pitch_values else np.array([0.0])
        except:
            return np.array([0.0])
    
    def _determine_pitch_trajectory(self, pitch_contour: np.ndarray) -> str:
        """Determine pitch trajectory: rising, falling, or stable."""
        if len(pitch_contour) < 3:
            return "stable"
        
        # Split into thirds
        third = len(pitch_contour) // 3
        start_third = np.mean(pitch_contour[:third]) if third > 0 else 0
        end_third = np.mean(pitch_contour[-third:]) if third > 0 else 0
        
        if start_third == 0 or end_third == 0:
            return "stable"
        
        change_ratio = (end_third - start_third) / start_third
        
        if change_ratio > 0.1:  # More than 10% increase
            return "rising"
        elif change_ratio < -0.1:  # More than 10% decrease
            return "falling"
        else:
            return "stable"
    
    def _detect_laughter(self, y: np.ndarray, sr: int) -> float:
        """Detect laughter patterns in audio segment."""
        try:
            # Laughter characteristics: rapid pitch variations, high frequency content
            pitch_contour = self._extract_pitch_contour(y, sr)
            
            if len(pitch_contour) < 3:
                return 0.0
            
            # High pitch variation indicates laughter
            pitch_variation = np.std(pitch_contour) / np.mean(pitch_contour) if np.mean(pitch_contour) > 0 else 0
            
            # High frequency energy (laughter has more high-frequency content)
            spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
            high_freq_ratio = spectral_centroid / 2000.0  # Normalize
            
            # Combine features
            laughter_score = min(1.0, (pitch_variation * 0.5) + (high_freq_ratio * 0.3))
            return laughter_score
        except:
            return 0.0
    
    def _detect_excitement(self, y: np.ndarray, sr: int) -> float:
        """Detect excitement patterns in audio segment."""
        try:
            # Excitement characteristics: pitch spikes, high energy
            pitch_contour = self._extract_pitch_contour(y, sr)
            
            if len(pitch_contour) == 0:
                return 0.0
            
            # High average pitch indicates excitement
            avg_pitch = np.mean(pitch_contour)
            pitch_score = min(1.0, (avg_pitch - 150) / 100) if avg_pitch > 150 else 0.0
            
            # High energy indicates excitement
            rms = librosa.feature.rms(y=y)[0]
            energy_score = min(1.0, np.mean(rms) * 10)
            
            # Pitch spikes (sudden increases)
            if len(pitch_contour) > 2:
                pitch_changes = np.diff(pitch_contour)
                spike_score = min(1.0, np.max(np.abs(pitch_changes)) / 50.0) if len(pitch_changes) > 0 else 0.0
            else:
                spike_score = 0.0
            
            # Combine features
            excitement_score = (pitch_score * 0.3) + (energy_score * 0.4) + (spike_score * 0.3)
            return min(1.0, excitement_score)
        except:
            return 0.0


def main():
    """Main entry point for the script."""
    if len(sys.argv) < 2:
        print("Usage: python analyze_audio.py <audio_file_path> [output_json_path]")
        print("\nExample:")
        print("  python analyze_audio.py 'Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast.wav'")
        sys.exit(1)
    
    audio_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    try:
        # Run analysis
        analyzer = AudioAnalyzer(audio_path)
        results = analyzer.analyze()
        
        # Output results
        output_json = json.dumps(results, indent=2)
        
        if output_path:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w') as f:
                f.write(output_json)
            print(f"\n📄 Results saved to: {output_path}")
        else:
            # Default output location
            default_output = Path(audio_path).parent / f"{Path(audio_path).stem}_analysis.json"
            with open(default_output, 'w') as f:
                f.write(output_json)
            print(f"\n📄 Results saved to: {default_output}")
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 ANALYSIS SUMMARY")
        print("=" * 60)
        print(f"Audio Duration: {results['audio_properties'].get('duration', 0):.2f} seconds")
        print(f"Sample Rate: {results['audio_properties'].get('sample_rate', 0)} Hz")
        print(f"Average Pitch: {results['voice_characteristics'].get('average_pitch_hz', 0):.1f} Hz")
        print(f"Speech Rate: {results['voice_characteristics'].get('speech_rate_wpm', 0):.1f} WPM")
        
        # Pitch analysis summary
        if 'pitch_analysis' in results and 'script_opening' in results['pitch_analysis']:
            opening = results['pitch_analysis']['script_opening']
            closing = results['pitch_analysis'].get('script_closing', {})
            print(f"\n🎵 Pitch Analysis:")
            print(f"   Opening: {opening.get('start_pitch_hz', 0):.1f} Hz ({opening.get('pitch_trajectory', 'unknown')})")
            if closing:
                print(f"   Closing: {closing.get('end_pitch_hz', 0):.1f} Hz ({closing.get('pitch_trajectory', 'unknown')})")
        
        # Emotion analysis summary
        if 'emotion_analysis' in results and 'emotion_distribution' in results['emotion_analysis']:
            dist = results['emotion_analysis']['emotion_distribution']
            print(f"\n😊 Emotion Analysis:")
            print(f"   Laughter: {dist.get('laughter', 0)}, Excitement: {dist.get('excitement', 0)}, Neutral: {dist.get('neutral', 0)}")
        
        print(f"\n🎯 Recommended ElevenLabs Settings:")
        settings = results['recommended_elevenlabs_settings']
        for key, value in settings.items():
            print(f"   {key}: {value}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
