# Hinglish Prompting Strategy (100 words)

Our approach to generating authentic Hinglish dialogue focuses on four pillars:

1. **Anti-pattern enforcement** – We explicitly ban templated phrases ("Arey Rahul, tune dekha?") and repetitive reactions ("Haan yaar, bilkul"), forcing unique openings for each topic.

2. **Content-driven variety** – The opener is chosen based on content type: surprising facts lead with hooks, technical topics start with questions, biographies begin with anecdotes.

3. **Sparing naturalism** – Fillers ('yaar', 'na?') are limited to 2-3 per script maximum. Many lines have zero fillers, mimicking how professionals actually speak.

4. **Quality self-verification** – The LLM checks its output against a checklist: unique opening, varied reactions, actual article facts, and balanced speaker contributions.

The two-host format (curious Rahul + expert Anjali) creates natural back-and-forth that sounds genuinely conversational, not templated.

---

## Implementation Details

### Prompt Engineering Techniques

1. **Few-shot Learning**
   - Provided 2 complete example scripts (AI topic, IPL topic)
   - Each example demonstrates: warm opening, fact-dense middle, reflective closing
   - Examples show authentic Hinglish code-mixing patterns

2. **Topic-Specific Templates**
   ```
   TECH/AI → "Yaar, honestly bata, yeh [topic] wala scene..."
   SPORTS → "Arey, jab bhi [league] ka topic uthta hai..."
   CELEBRITY → "Maine kal raat [name] ke highlights dekhe..."
   ```

3. **Emotion Mapping**
   - Surprise: "Baap re!", "Wait, seriously?"
   - Agreement: "Hundred percent!", "Bilkul sahi"
   - Humor: "Haha, relax!", "(laughs)"
   
4. **Quality Checklist** (LLM self-verifies)
   - ☑ Opening matches topic type
   - ☑ Uses specific facts (dates, numbers, names)
   - ☑ No repetitive reactions
   - ☑ Personal anecdotes included
   - ☑ Natural ending (not "subscribe karna")

### Key Success Factors

- **Temperature: 0.95** – High variability for natural conversation
- **JSON output mode** – Structured, parseable responses
- **Gemini 2.5 Flash primary** – Best for creative Hinglish generation
- **Groq/LLaMA fallback** – Ensures 100% uptime (rate limit protection)

### TTS Optimization

Text-to-speech preprocessing for ElevenLabs `eleven_multilingual_v2`:

- **Emotional markers** → Casual expressions
  - `(laughs)` → "haha", "hehe yaar" (randomized)
  - `(surprised)` → "arey", "arrey wah"
  
- **Numbers** → English words
  - "1975" → "nineteen seventy five" (year format)
  - "291" → "two ninety one"
  
- **Voice settings** (dynamic per sentence)
  - Rahul: Low stability (0.17-0.22), high style (0.68)
  - Anjali: Higher stability (0.22-0.27), moderate style (0.55)
  - Emotional content: Further reduces stability

### Example Output Quality

From our generated sample:

> **Rahul**: "Yaar Anjali, kal raat randomly kuch padh raha tha... something just blew my mind."
> 
> **Anjali**: "Kya yaar? Tell me tell me! You sound excited."
> 
> **Rahul**: "1975 mein pehla Cricket World Cup hua tha England mein. Sirf 8 teams thi!"
> 
> **Anjali**: "Wait, only 8? Ab toh 14 participate karte hain. That's massive growth yaar."

Notice:
- ✅ Natural code-mixing (not literal translation)
- ✅ Genuine curiosity in opening
- ✅ Emotional reaction after surprising fact ("Wait, only 8?")
- ✅ No filler overload (only 2 "yaar" in 4 lines)
