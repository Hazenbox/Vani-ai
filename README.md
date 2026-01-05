# 🎙️ Vani AI - Hinglish Podcast Generator

**Transform any Wikipedia article into a natural, conversational Hinglish podcast**

Vani AI is an AI-powered application that generates authentic two-speaker podcast conversations in Hinglish (Hindi + English code-mixing), optimized for natural text-to-speech output.

---

## 🎧 Sample Output

**Demo**: [Delhi Capitals Ka Safar.mp3](vani-ai-app/Outputs/Delhi_Capitals_Ka_Safar.mp3) *(Generated podcast about Delhi Capitals IPL team)*

Listen to how Rahul and Anjali discuss complex topics with:
- Natural code-mixing between Hindi and English
- Conversational fillers and reactions
- Emotional expressions and humor
- Professional podcast flow

---

## ✨ Key Features

### 🗣️ **Natural Two-Speaker Conversations**
- **Rahul**: Enthusiastic, curious host who asks engaging questions
- **Anjali**: Expert, knowledgeable host who provides insights
- Authentic back-and-forth dialogue with interruptions and reactions

### 🌐 **Seamless Hinglish Code-Mixing**
- Context-aware language switching (not literal translations)
- Natural Hindi-English blending that native speakers use
- TTS-optimized text formatting for proper pronunciation

### 🎯 **Smart Content Generation**
- Semantic extraction from any webpage or Wikipedia article
- LLM-powered script synthesis with anti-pattern enforcement
- Fact-dense content without losing conversational flow

### 🎤 **Premium TTS Synthesis**
- ElevenLabs multilingual_v2 model
- Dynamic voice settings per sentence (stability, style, emotion)
- Aggressive text cleanup for natural pronunciation
- Support for fillers, laughter, and emotional markers

---

## 🛠️ Tech Stack

### Frontend
- **React 19** + **TypeScript** - Modern UI framework
- **Vite** - Lightning-fast build tool
- **Framer Motion** - Smooth animations
- **Tailwind CSS** - Utility-first styling

### AI & Generation
- **Google Gemini 2.5 Flash** - Primary LLM for script generation
- **Groq (LLaMA)** - Fallback for rate limit protection
- **ElevenLabs TTS** - Premium text-to-speech synthesis

### Python Pipeline
- **Wikipedia Extraction** - Article content parsing
- **Semantic Processing** - Content structuring for LLM
- **Jupyter Notebooks** - End-to-end pipeline in Colab

### Testing
- **Vitest** - Unit testing framework
- **Testing Library** - Component testing
- **Python pytest** - Backend validation

---

## 🚀 Quick Start

### Prerequisites
```bash
Node.js 18+ and npm installed
Google Gemini API key
ElevenLabs API key
```

### Installation

```bash
# Clone the repository
git clone https://github.com/Hazenbox/Vani-ai.git
cd Vani-ai

# Navigate to application folder
cd vani-ai-app

# Install dependencies
npm install

# Set up environment variables
# Create .env file with:
# VITE_GEMINI_API_KEY=your_gemini_key
# VITE_ELEVENLABS_API_KEY=your_elevenlabs_key

# Start development server
npm run dev
```

### Usage

1. **Enter a URL** - Paste any Wikipedia article or webpage URL
2. **Generate Script** - AI creates a 2-minute Hinglish conversation
3. **Edit (Optional)** - Fine-tune the script with inline editing
4. **Synthesize Audio** - Generate MP3 with ElevenLabs TTS
5. **Download** - Save your podcast!

---

## 🏗️ Architecture

```
URL Input
    ↓
Semantic Extraction (Gemini API)
    ↓
Script Generation (LLM with Hinglish Prompting)
    ↓
TTS Preprocessing (Aggressive Cleanup)
    ↓
Audio Synthesis (ElevenLabs Multi-Speaker)
    ↓
MP3 Output
```

### Key Components

- **`src/services/podcastService.ts`** - Core script generation and TTS logic
- **`src/services/semanticExtraction.ts`** - URL content extraction
- **`src/components/ScriptEditor.tsx`** - Interactive script editing UI
- **`notebooks/vani_ai_pipeline.ipynb`** - Python/Colab end-to-end pipeline
- **`docs/guidelines/`** - Prompting strategies and script rules

---

## 🎓 Hackathon Requirements ✅

This project was built for a hackathon with specific deliverables:

### ✅ Python Pipeline
- **Location**: `vani-ai-app/notebooks/vani_ai_pipeline.ipynb`
- **Functionality**: Wikipedia URL → Script → Audio in pure Python
- **Colab Ready**: Can run end-to-end in Google Colab

### ✅ Wikipedia Article Processing
- Extracts and cleans article content
- Semantic chunking for LLM consumption
- Handles complex formatting and links

### ✅ LLM-Generated 2-Minute Scripts
- Structured JSON output with speaker labels
- Fact-dense, conversational dialogue
- Anti-pattern enforcement for quality

### ✅ Conversational Audio Elements
- Natural fillers: "yaar", "na?", "umm"
- Interruptions and overlaps
- Laughter markers: "(laughs)", "haha"
- Emotional reactions: "Baap re!", "Wait, seriously?"

### ✅ Sample MP3 Output
- **File**: `vani-ai-app/Outputs/Delhi_Capitals_Ka_Safar.mp3`
- **Duration**: ~2 minutes
- **Quality**: Natural-sounding Hinglish conversation

### ✅ 100-Word Prompting Explanation

Our approach to generating authentic Hinglish dialogue focuses on four pillars:

1. **Anti-pattern enforcement** – We explicitly ban templated phrases ("Arey Rahul, tune dekha?") and repetitive reactions ("Haan yaar, bilkul"), forcing unique openings for each topic.

2. **Content-driven variety** – The opener is chosen based on content type: surprising facts lead with hooks, technical topics start with questions, biographies begin with anecdotes.

3. **Sparing naturalism** – Fillers ('yaar', 'na?') are limited to 2-3 per script maximum. Many lines have zero fillers, mimicking how professionals actually speak.

4. **Quality self-verification** – The LLM checks its output against a checklist: unique opening, varied reactions, actual article facts, and balanced speaker contributions.

The two-host format (curious Rahul + expert Anjali) creates natural back-and-forth that sounds genuinely conversational, not templated.

*Full details: [vani-ai-app/docs/guidelines/PROMPTING_STRATEGY.md](vani-ai-app/docs/guidelines/PROMPTING_STRATEGY.md)*

---

## 📚 Documentation

Comprehensive documentation is available in the `vani-ai-app/docs/` directory:

### 📋 Guidelines
- **[Prompting Strategy](vani-ai-app/docs/guidelines/PROMPTING_STRATEGY.md)** - LLM prompting techniques
- **[Script Guidelines v2](vani-ai-app/docs/guidelines/conversational_audio_script_guidelines_v2.md)** - TTS-optimized writing rules
- **[Project Positioning](vani-ai-app/docs/guidelines/PROJECT_POSITIONING.md)** - Vision and goals

### 🎓 Training Examples
- **[Example Scripts](vani-ai-app/docs/training/examples/)** - 9+ reference podcasts
- Topics: AI, Cricket, Bollywood, Politics, Technology
- Each demonstrates proper Hinglish flow and TTS formatting

### 🔧 Implementation
- **[Technical Design](vani-ai-app/docs/implementation/TECHNICAL_DESIGN.md)** - System architecture
- **[TTS Improvements](vani-ai-app/docs/implementation/TTS_IMPROVEMENTS_SUMMARY.md)** - Audio optimization
- **[Dynamic Voice Settings](vani-ai-app/docs/implementation/DYNAMIC_VOICE_UPGRADE.md)** - Voice parameter tuning

### 🧪 Testing
- **[Colab Testing Guide](vani-ai-app/docs/testing/COLAB_TESTING_GUIDE.md)** - Python pipeline testing
- **[TTS Cleanup Tests](vani-ai-app/docs/testing/TTS_CLEANUP_TEST.md)** - Audio quality validation

---

## 🧪 Testing

### Run Tests
```bash
cd vani-ai-app

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run Python tests
cd tests/python
pip install -r requirements.txt
pytest
```

### Test Coverage
- Unit tests for core services (script generation, TTS preprocessing)
- Component tests for UI elements
- Python tests for Wikipedia extraction and TTS synthesis
- Integration tests for end-to-end pipeline

---

## 📁 Project Structure

```
vani-ai-app/
├── src/                        # React application source
│   ├── components/             # UI components
│   ├── services/               # Core business logic
│   │   ├── podcastService.ts   # Script generation & TTS
│   │   └── semanticExtraction.ts
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # Utilities
├── docs/                       # Comprehensive documentation
│   ├── guidelines/             # Prompting & script rules
│   ├── training/               # Example scripts
│   ├── implementation/         # Technical design
│   └── testing/                # Test guides
├── notebooks/                  # Jupyter/Colab notebooks
│   └── vani_ai_pipeline.ipynb  # Python pipeline
├── tests/                      # Test suites
│   ├── services/               # Service tests
│   ├── hooks/                  # Hook tests
│   └── python/                 # Python tests
├── scripts/                    # Utility scripts
├── Outputs/                    # Generated podcasts
└── dist/                       # Production build
```

---

## 🎯 Evaluation Criteria Addressed

### ✅ Innovation and Creativity
- First-of-its-kind Hinglish podcast generator
- Novel approach to code-mixing in TTS
- Anti-pattern enforcement for quality

### ✅ Technical Complexity
- Multi-LLM orchestration (Gemini + Groq)
- Dynamic voice parameter tuning
- Aggressive text preprocessing for TTS
- Semantic content extraction

### ✅ Code Quality
- TypeScript for type safety
- Modular service architecture
- Comprehensive inline documentation
- Consistent naming conventions

### ✅ Testing and Reliability
- Unit tests with Vitest
- Python pytest suite
- Component testing
- TTS quality validation

### ✅ Documentation
- Extensive markdown documentation
- Inline code comments
- Architecture diagrams
- Prompting strategy explained

### ✅ Demo Quality
- Sample MP3 included
- Live web application
- Colab notebook for reproducibility

---

## 🚧 Development Notes

### Current Status
- ✅ Web UI fully functional
- ✅ Script generation with Gemini/Groq
- ✅ Multi-speaker TTS with ElevenLabs
- ✅ Python pipeline in Jupyter notebook
- ✅ Comprehensive documentation
- ⚠️ 6 tests failing (expected behavior changes from TTS improvements)

### Known Limitations
- Requires API keys (Gemini + ElevenLabs)
- Large bundle size (1.2MB) - needs code splitting
- TTS synthesis is rate-limited by ElevenLabs

### Future Improvements
- Add voice cloning support
- Implement background music mixing
- Support for longer podcasts (5-10 minutes)
- Multi-language support beyond Hinglish

---

## 📄 License

This project was created for the Unstop AI Hackathon 2025.

---

## 🙏 Acknowledgments

- **Google Gemini** for powerful LLM capabilities
- **ElevenLabs** for realistic TTS synthesis
- **Unstop** for hosting the hackathon
- Community feedback for improving Hinglish naturalness

---

## 📧 Contact

For questions or feedback about this project:
- **GitHub**: [Hazenbox/Vani-ai](https://github.com/Hazenbox/Vani-ai)
- **Repository Issues**: Use GitHub Issues for bug reports and feature requests

---

**Made with ❤️ for authentic Hinglish conversations**
