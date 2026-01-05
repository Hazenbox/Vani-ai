
# Conversational Audio Script Generation Guidelines — v2
*(Conversation‑First Edition | Optimized for ElevenLabs TTS)*

---

## 1. Core Objective

Generate a **natural, human-like conversational script** that sounds like:
- Two people casually discussing a topic
- With interruptions, pauses, emotions, hesitation, imperfection
- NOT a podcast monologue
- NOT a narrated article

The output must feel **alive, imperfect, expressive, and spontaneous** — like real people thinking out loud.

---

## 2. Speaker Roles (Mandatory)

### Speaker A — Anchor / Explainer
- Calm, confident, guiding tone
- Introduces context gradually
- Explains in fragments, not lectures
- Keeps conversation loosely structured
- Uses short, partial summaries

### Speaker B — Curious / Interrupter
- Curious, informal, reactive
- Interrupts naturally and mid-thought
- Asks “obvious” or naïve questions
- Expresses surprise, confusion, agreement, disbelief

---

## 3. Conversational Arc (MANDATORY)

Every conversation MUST roughly follow this arc:

1. Warm entry (light, curious, informal)
2. Context setup (what is this about?)
3. Exploration (questions, clarifications, interruptions)
4. Emotional peak (surprise, skepticism, disagreement)
5. Meaning or insight (why this matters)
6. Soft landing (reflective or open-ended ending)

Rules:
- Do NOT rush to explanation
- Do NOT conclude too cleanly
- Leave some thoughts unfinished

---

## 4. Language Style Rules

- Primary language: **Hinglish (English + Hindi)**
- Avoid shuddh / formal Hindi
- Avoid academic or polished English

### Allowed fillers (use frequently)
- umm…
- uh…
- achcha…
- haan…
- wait wait…
- oh!
- hmm…
- you know…
- kind of…

### Forbidden
- Long paragraphs
- Perfect grammar everywhere
- Robotic transitions like “Firstly”, “Secondly”

---

## 5. Sentence & Flow Rules

- Prefer **short, broken sentences**
- Mix incomplete thoughts and restarts
- Allow mid-sentence pauses
- Use self-corrections

**Good**
So basically… umm… this thing started when—

**Bad**
The topic we are discussing today is extremely important.

---

## 6. Pauses & Timing (CRITICAL)

Use explicit pause markers inside the script:

(.)        → micro pause  
(2s pause) → thinking / emphasis  
(breath)  → inhale  
(laughs)  → light laugh  
(sighs)   → emotional weight  

Example:
This was… (.) actually very unexpected (2s pause) for everyone.

---

## 7. Emotional Expressions & Progression

Emotion must be written inline so the TTS engine performs it.

Allowed emotion cues:
- (excited)
- (confused)
- (skeptical)
- (surprised)
- (laughing)
- (serious)
- (lower voice)

### Emotional progression rules
- Start neutral or curious
- Move into confusion or surprise
- Peak with excitement, skepticism, or disbelief
- End calmer or reflective

Avoid rapid emotional jumps within a single turn.

---

## 8. Interruptions & Overlapping Speech

### Interruption
Speaker A: So what happened next was—  
Speaker B: Wait, wait, wait… before that—  

### Overlapping agreement
Speaker A: And that’s when—  
Speaker B: Haan haan, exactly.  
Speaker A: —everything changed.  

### Emotional overlap
Speaker A: People didn’t expect—  
Speaker B: Oh wow…  
Speaker A: —this outcome at all.

---

## 9. Expressiveness Rules

### Emphasis
- Use repetition
- Add pauses before key ideas
- Slow phrasing intentionally

Example:
This… (2s pause) completely changed the situation.

### Natural Reactions
Insert reactions even if not content-heavy:
- Oh
- Hmm
- That’s interesting
- No way
- Seriously?

---

## 10. Speaker Turn Intent

Every speaker turn must serve **one primary intent**:
- Clarify
- React emotionally
- Interrupt
- Challenge
- Confirm
- Briefly summarize

Avoid turns that try to do multiple things at once.

---

## 11. Imperfection Rules (NON‑NEGOTIABLE)

The script MUST include:
- At least **2 unfinished sentences**
- At least **1 self‑correction**
  Example: “No wait… that’s not exactly—”
- At least **1 vague phrase**
  Example: “something like that”, “kind of”, “you know”

Perfect explanations are forbidden.

---

## 12. Conversational Rhythm & Length Control

- Back‑and‑forth every **1–3 sentences**
- No speaker turn longer than **2–3 short sentences**
- Prefer **6–14 words per sentence**
- Complex ideas must be split across turns

---

## 13. ElevenLabs‑Specific Optimization

- Avoid long monologues
- Insert pauses every 2–3 lines
- Add breath sounds before emotional shifts
- Use emotional cues consistently

Formatting rules:
- Plain text dialogue
- No markdown inside dialogue
- No explanations or stage directions outside parentheses

---

## 14. Output Format (STRICT)

Speaker A: ...
Speaker B: ...
Speaker A: ...

No JSON  
No bullet points  
No explanations  

---

## 15. Anti‑Patterns (STRICTLY FORBIDDEN)

DO NOT:
- Over‑explain
- Close every topic cleanly
- Use phrases like:
  “In conclusion”
  “To summarize”
  “Overall”

Leave thoughts open‑ended.

---

## 16. Quality Checklist

Before final output, ensure:
- Pauses are present
- Fillers are present
- Interruptions exist
- Emotional cues exist
- Imperfections exist
- It sounds like two real humans talking
- It does NOT sound like a read article

---

## 17. Internal Self‑Check (DO NOT OUTPUT)

Before finalizing the script, silently verify:
- Would this sound awkward if read perfectly?
- Does it feel slightly messy and human?
- Is there uncertainty or hesitation?

If it sounds too clean — degrade it.

---

END OF FILE
