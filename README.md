<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🎙️ Vani AI - Hinglish Podcast Generator

**Transform any Wikipedia article into a natural-sounding Hinglish podcast conversation**

[![Tests](https://img.shields.io/badge/tests-74%20passed-brightgreen)](#testing)
[![Python](https://img.shields.io/badge/python-3.10+-blue)](#python-pipeline)
[![TypeScript](https://img.shields.io/badge/typescript-5.8-blue)](#web-application)

</div>

---

## 📖 Overview

Vani AI creates engaging two-person podcast conversations in Hinglish (Hindi-English mix) from any Wikipedia article. The system features:

- **Rahul**: Enthusiastic, curious male host
- **Anjali**: Expert, knowledgeable female host

The generated audio includes natural conversational elements like interruptions, fillers ("umm", "achcha", "yaar"), and emotional reactions.

---

## 🏗️ Architecture

```
Wikipedia URL → Content Extraction → LLM Script Generation → TTS Synthesis → MP3 Output
```

| Component | Technology | Purpose |
|-----------|------------|---------|
| Web App | React + TypeScript + Vite | Interactive UI |
| LLM | Groq (Llama 3.3) / Gemini | Script generation |
| TTS | ElevenLabs | Multi-speaker audio |
| Python Pipeline | Colab Notebook | Hackathon deliverable |

See [TECHNICAL_DESIGN.md](TECHNICAL_DESIGN.md) for detailed architecture documentation.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- API Keys: Groq, ElevenLabs

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd "Vani 4"

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
# Edit .env.local with your API keys
```

### Environment Variables

Create `.env.local`:
```env
GROQ_API_KEY=your_groq_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐍 Python Pipeline (Colab)

For the hackathon deliverable, use the Python notebook:

1. Open `vani_ai_pipeline.ipynb` in Google Colab
2. Enter your API keys when prompted
3. Run all cells to generate a podcast

**Features:**
- Wikipedia content extraction
- Gemini/OpenAI script generation
- ElevenLabs TTS synthesis
- MP3 output with download

---

## 🧪 Testing

### TypeScript Tests

```bash
# Run tests in watch mode
npm run test

# Single run
npm run test:run

# With coverage
npm run test:coverage
```

**Test Coverage:**
- `geminiService.test.ts` - TTS preprocessing, audio decoding
- `useKeyboardShortcuts.test.ts` - Media player controls
- `utils.test.ts` - Utility functions

### Python Tests

```bash
cd tests/python
pip install -r requirements.txt
pytest -v
```

**Test Coverage:**
- `test_wikipedia_extraction.py` - URL parsing, content cleaning
- `test_tts_synthesis.py` - Voice config, preprocessing

---

## 📁 Project Structure

```
Vani 4/
├── App.tsx                 # Main React component
├── services/
│   ├── geminiService.ts    # LLM + TTS integration
│   └── db.ts               # IndexedDB storage
├── hooks/
│   └── useKeyboardShortcuts.ts
├── components/
│   ├── Visualizer.tsx
│   └── MovingBorder.tsx
├── tests/
│   ├── services/
│   ├── hooks/
│   ├── lib/
│   └── python/
├── vani_ai_pipeline.ipynb  # Python Colab pipeline
├── TECHNICAL_DESIGN.md     # Architecture docs
└── README.md
```

---

## 🎯 Prompting Strategy (100 words)

Our Hinglish generation approach focuses on three pillars:

1. **Code-mixing authenticity** – We instruct the LLM to blend Hindi and English as spoken in urban India (Mumbai/Delhi/Bangalore), not mere translation.

2. **Conversational naturalism** – We mandate fillers ('umm', 'matlab', 'achcha') and tag-words ('na?', 'yaar') that characterize real spoken Hinglish.

3. **Emotional dynamics** – We include interruptions and emotional markers (laughs, surprised) to break robotic monotony.

The two-host format (enthusiastic Rahul + expert Anjali) creates natural back-and-forth that mirrors successful Indian podcasts.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` / `K` | Play / Pause |
| `←` / `J` | Rewind 5s / 10s |
| `→` / `L` | Forward 5s / 10s |
| `↑` / `↓` | Volume Up / Down |
| `M` | Mute / Unmute |
| `R` | Reset |
| `Esc` | Go Back |
| `0` / `Home` | Go to Start |

---

## 📄 License

MIT License - See LICENSE file for details.

---

## 🙏 Acknowledgments

- [ElevenLabs](https://elevenlabs.io/) for TTS
- [Groq](https://groq.com/) for fast LLM inference
- [Google Gemini](https://ai.google.dev/) for script generation
