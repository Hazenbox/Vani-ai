# Migration Notes: Archived Services

This document explains why the director and semantic service approaches were archived and how their features were integrated into the main `podcastService.ts`.

## Background

During development, three parallel approaches were explored for podcast script generation:

1. **Main approach** (`geminiService.ts` → now `podcastService.ts`)
2. **Director approach** (`geminiService.director.ts`) - Added quality validation layer
3. **Semantic approach** (`geminiService.semantic.ts`) - Focused on semantic extraction

## Why Archive?

### Consolidation Benefits
- **Reduced complexity**: Single service file instead of three variants
- **Easier maintenance**: One codebase to update instead of keeping three in sync
- **Clearer architecture**: New developers don't face decision paralysis
- **Best-of-all-worlds**: Main service now incorporates insights from all approaches

### What Was Kept

Features from archived services that were integrated into `podcastService.ts`:

#### From Director Approach
✓ **TTS cleanup patterns** - Aggressive comma removal, proper noun fixes
✓ **Year pronunciation logic** - Selective conversion for natural English pronunciation
✓ **Quality validation principles** - Emotional beat rules, fact-reaction patterns

#### From Semantic Approach
✓ **Semantic extraction strategies** - Fact-first conversation flow
✓ **Prompt engineering techniques** - Anti-patterns, TTS formatting rules
✓ **Natural speech patterns** - Micro-interruptions, thinking noise

## Migration Guide

### If You Need Features from Archived Services

**Step 1: Check Current Implementation First**

The feature you need likely already exists in `services/podcastService.ts`. Search for:
- TTS cleanup: `cleanTextForTTS()` function
- Script generation: `generateScript()` function  
- Quality validation: Check the `HINGLISH_PROMPT` constant
- Audio synthesis: `generateMultiSpeakerAudio()` function

**Step 2: Review Archived Code**

If the feature genuinely doesn't exist:
1. Open the archived service file
2. Locate the specific function/logic
3. Understand dependencies and context

**Step 3: Extract Selectively**

Don't copy entire files. Instead:
```typescript
// ❌ BAD: Copy entire archived service
import { everything } from '../../archive/services/geminiService.director';

// ✓ GOOD: Extract specific logic and adapt
function myNewFeature() {
  // Adapted logic from archived service
  // Modified to work with current architecture
}
```

**Step 4: Test Integration**

- Run `npm run build` to check for TypeScript errors
- Run `npm test` to verify functionality
- Test with actual audio generation
- Verify TTS output quality

## Key Differences

### Director Service vs Current
| Feature | Director Approach | Current (`podcastService`) |
|---------|------------------|---------------------------|
| Quality validation | Separate director layer | Integrated in prompt |
| TTS cleanup | Post-generation function | Combined prompt + cleanup |
| Voice settings | Dynamic per-turn | Fixed podcast mode |

### Semantic Service vs Current
| Feature | Semantic Approach | Current (`podcastService`) |
|---------|------------------|---------------------------|
| Prompting | Multiple strategies | Single consolidated prompt |
| Fact extraction | Semantic-first | Fact-first with emotions |
| Script structure | Flexible | Strict emotional beats |

## Common Questions

### Q: Can I use both director and main service?
**A:** No. They overlap significantly and would conflict. Use `podcastService.ts` only.

### Q: The director service has a feature I need. Should I switch back?
**A:** No. Extract the specific feature and integrate it into `podcastService.ts`.

### Q: Why not keep all three as options?
**A:** Maintenance burden, complexity, and confusion for new developers. One excellent service beats three mediocre ones.

### Q: What if I discover a bug in archived code?
**A:** Document it but don't fix it. Focus on the active service. The archived code is for reference only.

## Timeline

- **November 2025**: Initial `geminiService.ts` created
- **December 2025**: Director and semantic variants explored
- **January 2026**: Consolidated into single `podcastService.ts`
- **January 2026**: Archived deprecated variants

## Related Documentation

- [`../../docs/implementation/PODCAST_MODE_IMPLEMENTATION_SUMMARY.md`](../../docs/implementation/PODCAST_MODE_IMPLEMENTATION_SUMMARY.md)
- [`../../docs/implementation/TTS_IMPROVEMENTS_SUMMARY.md`](../../docs/implementation/TTS_IMPROVEMENTS_SUMMARY.md)
- [`../../docs/implementation/TECHNICAL_DESIGN.md`](../../docs/implementation/TECHNICAL_DESIGN.md)

## Contact

Questions about migration? Review the current implementation first, then consult with the development team.
