
# Link-to-Conversation Script Generation Guidelines
*(Conversation Designer Spec | Emotion-First | Expressive Audio Ready)*

---

## Purpose of This Document

This document defines **how a system should convert any article, blog, or news link into a natural, expressive, human-like conversational script**.

This is NOT a summarization guide.  
This is a **human sense-making conversation framework**.

---

## Core Principle

Humans do not:
- Read articles line by line
- Explain content cleanly
- Speak in complete thoughts

Humans:
- React
- Question
- Interrupt
- Emote
- Think out loud

Your system must simulate **two humans reading the content together and talking naturally**.

---

## High-Level Pipeline

Link  
↓  
Content Extraction  
↓  
Conversation-Worthy Chunking  
↓  
Human Reaction Mapping  
↓  
Conversation Beat Planning  
↓  
Expressive Script Rendering  

---

## 1. Content Extraction Rules

Extract only **conversation-worthy elements**, not full text.

Focus on:
- Key facts
- Claims or assertions
- Numbers or statistics
- Surprising events
- Conflicts or controversies
- Opinions (explicit or implicit)

Ignore:
- SEO fluff
- Formal intros and conclusions
- Repetitive background content

Guiding question:
> “Would two people stop and talk about this?”

---

## 2. Human-Style Content Chunking

Chunk content by **idea**, not paragraphs.

Each chunk should:
- Represent ONE idea or event
- Be discussable for 20–30 seconds
- Trigger a reaction or question

If a chunk does not trigger reaction → merge or drop it.

---

## 3. Human Reaction Mapping (CRITICAL)

For every chunk, define reactions BEFORE writing dialogue.

### Cognitive reaction (pick one)
- Obvious
- Confusing
- New
- Shocking
- Controversial

### Emotional reaction (pick one)
- Curious
- Surprised
- Skeptical
- Amused
- Concerned
- Impressed

Emotion selection must be intentional — not random.

---

## 4. Speaker Role Assignment per Chunk

Decide speaker behavior per chunk.

General logic:
- Speaker A introduces context
- Speaker B reacts emotionally
- Speaker B interrupts on confusion or surprise
- Speaker A clarifies or reframes

Avoid mechanical turn-taking.

---

## 5. Conversation Beat Planning

Before generating dialogue, plan beats.

Each chunk should have:
- Casual entry
- Initial reaction
- Clarification or interruption
- Emotional response
- Transition or pause

No chunk should jump straight to explanation.

---

## 6. Expressiveness Trigger Rules

Expressiveness must be **triggered**, not decorative.

### Add pauses when:
- Thought shifts
- Emotion changes
- Surprise lands
- Speaker searches for words

### Add breath when:
- Before opinions
- Before corrections
- Before emotional statements

### Add laughter when:
- Irony exists
- Situation is absurd
- Speaker self-reflects

Never laugh at:
- Tragedy
- Serious or sensitive topics

---

## 7. Pause Logic

Pauses represent thinking.

Use pauses:
- Before answering questions
- Before correcting oneself
- Before revealing key insight

Avoid pauses:
- Inside numbers
- Mid‑fact
- Randomly

---

## 8. Interruption & Overlap Logic

Interrupt only when:
- Confused
- Excited
- Strongly disagreeing
- Seeking clarification

Do NOT interrupt:
- Emotional statements
- Sensitive explanations

Overlaps should feel social, not technical.

---

## 9. Imperfection Rules (MANDATORY)

Every script MUST include:
- Unfinished sentences
- Self‑corrections
- Vague phrases (“kind of”, “you know”)
- Hesitation words

Perfect clarity is forbidden.

---

## 10. Ending Logic

Articles end cleanly. Conversations do not.

End conversations with:
- Reflection
- Open‑ended thoughts
- Casual remarks

Avoid:
- “In conclusion”
- “To summarize”
- Formal closures

---

## 11. Internal Validation (Silent Check)

Before final output, verify:
- Does this sound like two humans talking?
- Is there messiness?
- Are emotions earned, not forced?

If it sounds too clean — degrade it.

---

END OF FILE
