# Documentation Structure

This directory contains all documentation for the Vani 4 Synthetic Radio Host project, organized by category for easy navigation.

## Directory Structure

### 📋 `/guidelines/`
**Prompting strategies and script writing rules**

Contains the core guidelines for generating high-quality Hinglish podcast scripts:
- `PROMPTING_STRATEGY.md` - LLM prompting techniques and best practices
- `script_synthesis_gemini.md` - Gemini-specific script generation strategies
- `conversation_script_guidelines.md` - General conversational script rules
- `conversational_audio_script_guidelines_v2.md` - Updated TTS-optimized script guidelines
- `PROJECT_POSITIONING.md` - Project vision and positioning

### 🎓 `/training/`
**Example scripts for LLM training**

Contains reference podcast scripts demonstrating correct formatting and conversational flow:
- `examples/` - Real script examples covering various topics (IPL, AI, personalities, etc.)
- Each script demonstrates proper Hinglish flow, TTS formatting, and emotional beats

### 🔧 `/implementation/`
**Technical design and feature documentation**

Implementation details and technical decisions:
- `TECHNICAL_DESIGN.md` - Overall system architecture
- `DIRECTOR_LAYER_IMPLEMENTATION.md` - Director layer approach (now archived)
- `DYNAMIC_VOICE_UPGRADE.md` - Voice settings and TTS optimization
- `PODCAST_MODE_IMPLEMENTATION_SUMMARY.md` - Podcast mode features
- `TTS_IMPROVEMENTS_SUMMARY.md` - Text-to-speech enhancements
- `STRICT_TTS_FIXES_COMPLETE.md` - Finalized TTS fixes
- `scripts_compare.md` - Script comparison analysis

### 🧪 `/testing/`
**Test guides and results**

Testing documentation and validation reports:
- `COLAB_TESTING_GUIDE.md` - Google Colab testing procedures
- `TTS_CLEANUP_TEST.md` - TTS cleanup validation tests
- `STRICT_COMMA_CLEANUP_TEST.md` - Comma cleanup pattern tests

## Quick Links

**New to the project?** Start here:
1. Read [`../README.md`](../README.md) - Project overview
2. Review [`guidelines/conversational_audio_script_guidelines_v2.md`](guidelines/conversational_audio_script_guidelines_v2.md) - Script rules
3. Check [`training/examples/`](training/examples/) - See examples

**Working on script generation?**
- [`guidelines/PROMPTING_STRATEGY.md`](guidelines/PROMPTING_STRATEGY.md)
- [`implementation/TTS_IMPROVEMENTS_SUMMARY.md`](implementation/TTS_IMPROVEMENTS_SUMMARY.md)

**Debugging TTS issues?**
- [`testing/TTS_CLEANUP_TEST.md`](testing/TTS_CLEANUP_TEST.md)
- [`implementation/STRICT_TTS_FIXES_COMPLETE.md`](implementation/STRICT_TTS_FIXES_COMPLETE.md)

## Contributing

When adding new documentation:
1. Place it in the appropriate subdirectory
2. Update this README with a link
3. Use clear, descriptive filenames
4. Follow existing markdown formatting conventions
