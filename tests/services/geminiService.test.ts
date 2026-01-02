/**
 * Unit Tests for geminiService.ts
 * 
 * Tests the core functions for:
 * - Text cleaning for TTS (emotion marker replacement)
 * - Audio decoding (base64 operations)
 * - Script validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  cleanTextForTTS, 
  decodeAudio, 
  EMOTION_EXPRESSIONS,
  pickRandom 
} from '../../services/geminiService';
import type { ScriptPart, ConversationData } from '../../types';

// ============================================
// cleanTextForTTS Tests
// ============================================
describe('cleanTextForTTS', () => {
  describe('Emotion marker replacement', () => {
    it('should replace (laughs) with a laughter expression', () => {
      const input = '(laughs) That was funny!';
      const result = cleanTextForTTS(input);
      
      // Should contain one of the laughter expressions
      const hasLaughter = EMOTION_EXPRESSIONS.laughs.some(expr => 
        result.includes(expr)
      );
      expect(hasLaughter).toBe(true);
      expect(result).toContain('That was funny!');
      expect(result).not.toContain('(laughs)');
    });

    it('should replace (giggles) with a giggle expression', () => {
      const input = '(giggles) Hehe so cute!';
      const result = cleanTextForTTS(input);
      
      const hasGiggle = EMOTION_EXPRESSIONS.giggles.some(expr => 
        result.includes(expr)
      );
      expect(hasGiggle).toBe(true);
      expect(result).not.toContain('(giggles)');
    });

    it('should replace (surprised) with a surprise expression', () => {
      const input = '(surprised) Kya?! Really?';
      const result = cleanTextForTTS(input);
      
      const hasSurprise = EMOTION_EXPRESSIONS.surprised.some(expr => 
        result.includes(expr)
      );
      expect(hasSurprise).toBe(true);
      expect(result).not.toContain('(surprised)');
    });

    it('should replace (thinking) with a thinking expression', () => {
      const input = '(thinking) Let me see...';
      const result = cleanTextForTTS(input);
      
      const hasThinking = EMOTION_EXPRESSIONS.thinking.some(expr => 
        result.includes(expr)
      );
      expect(hasThinking).toBe(true);
      expect(result).not.toContain('(thinking)');
    });

    it('should replace (excited) with an excitement expression', () => {
      const input = '(excited) This is amazing!';
      const result = cleanTextForTTS(input);
      
      const hasExcited = EMOTION_EXPRESSIONS.excited.some(expr => 
        result.includes(expr)
      );
      expect(hasExcited).toBe(true);
      expect(result).not.toContain('(excited)');
    });

    it('should handle multiple emotion markers in same text', () => {
      const input = '(laughs) Yaar, (surprised) that was unexpected!';
      const result = cleanTextForTTS(input);
      
      expect(result).not.toContain('(laughs)');
      expect(result).not.toContain('(surprised)');
      expect(result).toContain('that was unexpected!');
    });

    it('should be case-insensitive for emotion markers', () => {
      const inputs = ['(LAUGHS) Ha!', '(Laughs) Ha!', '(lAuGhS) Ha!'];
      
      inputs.forEach(input => {
        const result = cleanTextForTTS(input);
        expect(result).not.toContain('(');
        expect(result).not.toContain(')');
      });
    });
  });

  describe('Parenthetical marker removal', () => {
    it('should remove unknown parenthetical markers', () => {
      const input = '(sighs) This is so boring (yawns)';
      const result = cleanTextForTTS(input);
      
      expect(result).not.toContain('(sighs)');
      expect(result).not.toContain('(yawns)');
      expect(result).toContain('This is so boring');
    });

    it('should remove empty parentheticals', () => {
      const input = 'Hello () world';
      const result = cleanTextForTTS(input);
      
      expect(result).not.toContain('()');
      expect(result).toContain('Hello');
      expect(result).toContain('world');
    });
  });

  describe('Whitespace normalization', () => {
    it('should normalize multiple spaces to single space', () => {
      const input = 'Hello    there    friend';
      const result = cleanTextForTTS(input);
      
      expect(result).toBe('Hello there friend');
    });

    it('should trim leading and trailing whitespace', () => {
      const input = '   Hello world   ';
      const result = cleanTextForTTS(input);
      
      expect(result).toBe('Hello world');
    });

    it('should handle newlines and tabs', () => {
      const input = 'Hello\n\tthere\n\nfriend';
      const result = cleanTextForTTS(input);
      
      expect(result).toBe('Hello there friend');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = cleanTextForTTS('');
      expect(result).toBe('');
    });

    it('should handle text with no markers', () => {
      const input = 'Yaar, Mumbai Indians ka naam aate hi trophies yaad aa jaate hain';
      const result = cleanTextForTTS(input);
      
      expect(result).toBe(input);
    });

    it('should handle Hinglish text correctly', () => {
      const input = 'Achcha matlab basically what happened was...';
      const result = cleanTextForTTS(input);
      
      expect(result).toBe(input);
    });
  });
});

// ============================================
// decodeAudio Tests
// ============================================
describe('decodeAudio', () => {
  it('should decode base64 string to Uint8Array', () => {
    // "Hello" in base64
    const base64 = btoa('Hello');
    const result = decodeAudio(base64);
    
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(5);
    
    // Verify content
    const decoded = String.fromCharCode(...result);
    expect(decoded).toBe('Hello');
  });

  it('should handle empty base64 string', () => {
    const base64 = btoa('');
    const result = decodeAudio(base64);
    
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it('should correctly decode binary data', () => {
    // Create some binary data
    const binaryData = new Uint8Array([0, 1, 127, 128, 255]);
    const binaryString = String.fromCharCode(...binaryData);
    const base64 = btoa(binaryString);
    
    const result = decodeAudio(base64);
    
    expect(result.length).toBe(5);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(1);
    expect(result[2]).toBe(127);
    expect(result[3]).toBe(128);
    expect(result[4]).toBe(255);
  });

  it('should handle longer audio-like data', () => {
    // Simulate MP3-like data (random bytes)
    const audioData = new Uint8Array(1000);
    for (let i = 0; i < audioData.length; i++) {
      audioData[i] = i % 256;
    }
    
    const binaryString = String.fromCharCode(...audioData);
    const base64 = btoa(binaryString);
    
    const result = decodeAudio(base64);
    
    expect(result.length).toBe(1000);
    expect(result[0]).toBe(0);
    expect(result[255]).toBe(255);
    expect(result[256]).toBe(0);
  });
});

// ============================================
// pickRandom Tests
// ============================================
describe('pickRandom', () => {
  it('should return an element from the array', () => {
    const arr = ['a', 'b', 'c'];
    const result = pickRandom(arr);
    
    expect(arr).toContain(result);
  });

  it('should handle single-element array', () => {
    const arr = ['only'];
    const result = pickRandom(arr);
    
    expect(result).toBe('only');
  });

  it('should return different values over multiple calls (randomness)', () => {
    const arr = ['a', 'b', 'c', 'd', 'e'];
    const results = new Set<string>();
    
    // Run 50 times to check for variation
    for (let i = 0; i < 50; i++) {
      results.add(pickRandom(arr));
    }
    
    // Should have picked at least 2 different values
    expect(results.size).toBeGreaterThanOrEqual(2);
  });
});

// ============================================
// EMOTION_EXPRESSIONS Tests
// ============================================
describe('EMOTION_EXPRESSIONS', () => {
  it('should have all required emotion categories', () => {
    const requiredCategories = [
      'laughs', 'giggles', 'chuckles', 'surprised', 
      'excited', 'thinking', 'happy', 'curious', 
      'impressed', 'sad', 'confused'
    ];
    
    requiredCategories.forEach(category => {
      expect(EMOTION_EXPRESSIONS).toHaveProperty(category);
      expect(Array.isArray(EMOTION_EXPRESSIONS[category as keyof typeof EMOTION_EXPRESSIONS])).toBe(true);
      expect(EMOTION_EXPRESSIONS[category as keyof typeof EMOTION_EXPRESSIONS].length).toBeGreaterThan(0);
    });
  });

  it('should have Hinglish expressions in key categories', () => {
    // Verify Hinglish flavor exists
    const allExpressions = Object.values(EMOTION_EXPRESSIONS).flat();
    
    const hinglishWords = ['yaar', 'achcha', 'arrey', 'wah', 'matlab', 'haan', 'kya'];
    const hasHinglish = allExpressions.some(expr => 
      hinglishWords.some(word => expr.toLowerCase().includes(word))
    );
    
    expect(hasHinglish).toBe(true);
  });
});

// ============================================
// Script Validation Tests
// ============================================
describe('Script Validation', () => {
  const validScript: ConversationData = {
    title: 'Mumbai Indians Ka Kahaani',
    script: [
      { speaker: 'Rahul', text: 'Arey yaar, tune dekha?' },
      { speaker: 'Anjali', text: 'Haan haan, bohot interesting hai!' },
      { speaker: 'Rahul', text: '(laughs) Sahi bola!' },
    ]
  };

  it('should accept valid script structure', () => {
    expect(validScript.title).toBeTruthy();
    expect(validScript.script.length).toBeGreaterThan(0);
    expect(validScript.script.every(s => s.speaker && s.text)).toBe(true);
  });

  it('should only allow Rahul or Anjali as speakers', () => {
    const validSpeakers = ['Rahul', 'Anjali'];
    
    validScript.script.forEach(line => {
      expect(validSpeakers).toContain(line.speaker);
    });
  });

  it('should require non-empty text for each line', () => {
    validScript.script.forEach(line => {
      expect(line.text.trim().length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// Pause Marker Tests (v2 Guidelines)
// ============================================
describe('Pause marker handling', () => {
  it('should convert micro-pause (.) to ellipsis', () => {
    const input = 'So basically (.) what happened was';
    const result = cleanTextForTTS(input);
    expect(result).toContain('...');
    expect(result).not.toContain('(.)');
  });

  it('should convert (pause) to ellipsis', () => {
    const input = 'Wait (pause) let me think';
    const result = cleanTextForTTS(input);
    expect(result).toContain('...');
    expect(result).not.toContain('(pause)');
  });

  it('should convert (breath) to ellipsis', () => {
    const input = '(breath) Okay so the thing is';
    const result = cleanTextForTTS(input);
    expect(result).toContain('...');
    expect(result).not.toContain('(breath)');
  });

  it('should handle multiple pauses in one line', () => {
    const input = 'So (.) basically (pause) what I meant was (.) you know';
    const result = cleanTextForTTS(input);
    expect(result).not.toContain('(.)');
    expect(result).not.toContain('(pause)');
    // Should have ellipses but not excessive
    expect(result.match(/\.\.\./g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('should normalize multiple consecutive ellipses', () => {
    const input = 'So... (.) ... what';
    const result = cleanTextForTTS(input);
    // Should not have more than 3 dots in a row
    expect(result).not.toMatch(/\.{4,}/);
  });
});

// ============================================
// New Emotion Markers Tests (v2 Guidelines)
// ============================================
describe('New emotion markers from v2 guidelines', () => {
  it('should handle (sighs) marker', () => {
    const input = '(sighs) Dekho time will tell';
    const result = cleanTextForTTS(input);
    expect(result).not.toContain('(sighs)');
    expect(result).toContain('Dekho time will tell');
  });

  it('should handle (skeptical) marker', () => {
    const input = "(skeptical) I'm not sure about that";
    const result = cleanTextForTTS(input);
    expect(result).not.toContain('(skeptical)');
  });

  it('should handle (serious) marker', () => {
    const input = '(serious) This is important';
    const result = cleanTextForTTS(input);
    expect(result).not.toContain('(serious)');
    expect(result).toContain('This is important');
  });

  it('should handle (lower voice) marker', () => {
    const input = '(lower voice) Between you and me';
    const result = cleanTextForTTS(input);
    expect(result).not.toContain('(lower voice)');
    expect(result).toContain('Between you and me');
  });
});

// ============================================
// Integration-style Tests (TTS preprocessing)
// ============================================
describe('TTS Preprocessing Integration', () => {
  it('should process a full script line with multiple features', () => {
    const complexInput = '  (excited)  Yaar   (laughs) this is   amazing  na?  ';
    const result = cleanTextForTTS(complexInput);
    
    // Should have normalized whitespace
    expect(result).not.toMatch(/\s{2,}/);
    
    // Should not have parenthetical markers
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
    
    // Should preserve Hinglish content
    expect(result).toContain('amazing');
    expect(result).toContain('na?');
  });

  it('should handle typical podcast script lines', () => {
    const testLines = [
      { input: '(surprised) Kya?! Seriously?', shouldContain: 'Seriously?' },
      { input: 'Matlab basically what happened was—', shouldContain: 'Matlab basically' },
      { input: '(laughs) Haan yaar, I know right', shouldContain: 'I know right' },
      { input: 'Achcha chalo, baad mein baat karte hain', shouldContain: 'Achcha chalo' },
    ];
    
    testLines.forEach(({ input, shouldContain }) => {
      const result = cleanTextForTTS(input);
      expect(result).toContain(shouldContain);
    });
  });
});
