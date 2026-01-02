# Archive

This directory contains deprecated code and approaches that are no longer actively used in the project but are preserved for historical reference.

## Why Archive?

Code is archived (not deleted) when:
- A better implementation approach has been adopted
- The feature is no longer needed but may be referenced later
- The code contains valuable insights for future development
- Historical context is important for understanding the project evolution

## Contents

### `/services/`
**Deprecated service implementations**

Contains alternative implementations of the podcast generation service that were explored but ultimately not adopted as the primary approach:

#### `geminiService.director.ts`
- **Purpose**: Director-based approach to script generation with enhanced quality analysis
- **Deprecated**: January 2026
- **Reason**: Consolidated into main `podcastService.ts` for simpler architecture
- **Key Features**:
  - Director layer for script quality validation
  - Advanced quality scoring system
  - Additional prosody enhancements

#### `geminiService.semantic.ts`
- **Purpose**: Semantic-focused approach to script generation
- **Deprecated**: January 2026
- **Reason**: Merged improvements into main `podcastService.ts`
- **Key Features**:
  - Semantic extraction focus
  - Alternative prompt strategies
  - Different TTS optimization approach

## Migration Notes

If you need features from archived services:

1. **Review the archived code** - Understand the specific feature you need
2. **Check current implementation** - The feature may already exist in `services/podcastService.ts`
3. **Extract selectively** - Copy only the specific functions/logic needed
4. **Test thoroughly** - Ensure integration doesn't break existing functionality

See [`services/MIGRATION_NOTES.md`](services/MIGRATION_NOTES.md) for detailed migration guidance.

## Current Active Service

The active podcast generation service is now:
- **`/services/podcastService.ts`** (formerly `geminiService.ts`)

This consolidated service combines the best features from all previous approaches while maintaining a clean, maintainable codebase.

## Questions?

If you're unsure whether to use archived code:
1. Check if the feature exists in the current implementation
2. Review the migration notes
3. Consult with the team before extracting archived code
