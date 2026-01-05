import React, { useRef, useEffect, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { EditableScriptPart } from '../types';

interface ScriptLineProps {
  line: EditableScriptPart;
  index: number;
  isSelected: boolean;
  isLocked?: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<EditableScriptPart>) => void;
  onDelete: () => void;
  onCursorPositionChange: (position: number) => void;
  onSeekToSegment?: (index: number) => void;
  audioReady?: boolean;
  showChips?: boolean; // Whether to show interactive marker chips (default: false)
  readOnly?: boolean; // Whether the line is read-only (default: false)
  showDelete?: boolean; // Whether to show delete button (default: true)
}

// Marker patterns to detect in text
const MARKER_PATTERNS = [
  { pattern: /\(\.\)/g, type: 'pause', label: 'Micro Pause' },
  { pattern: /\(pause\)/gi, type: 'pause', label: 'Pause' },
  { pattern: /\(breath\)/gi, type: 'pause', label: 'Breath' },
  { pattern: /\(mid\)/gi, type: 'pause', label: 'Mid' },
  { pattern: /\(laughs\)/gi, type: 'laughter', label: 'Laughs' },
  { pattern: /\(giggles\)/gi, type: 'laughter', label: 'Giggles' },
  { pattern: /\(chuckles\)/gi, type: 'laughter', label: 'Chuckles' },
  { pattern: /\(surprised\)/gi, type: 'emotion', label: 'Surprised' },
  { pattern: /\(excited\)/gi, type: 'emotion', label: 'Excited' },
  { pattern: /\(confused\)/gi, type: 'emotion', label: 'Confused' },
  { pattern: /\(skeptical\)/gi, type: 'emotion', label: 'Skeptical' },
  { pattern: /\(serious\)/gi, type: 'emotion', label: 'Serious' },
  { pattern: /\(thinking\)/gi, type: 'emotion', label: 'Thinking' },
  { pattern: /\(sighs\)/gi, type: 'emotion', label: 'Sighs' },
  { pattern: /\(happy\)/gi, type: 'emotion', label: 'Happy' },
  { pattern: /\(impressed\)/gi, type: 'emotion', label: 'Impressed' },
  { pattern: /\(sad\)/gi, type: 'emotion', label: 'Sad' },
  { pattern: /\(curious\)/gi, type: 'emotion', label: 'Curious' },
];

// Punctuation patterns to detect in text (for visual pills)
// Order matters: longer patterns first to avoid partial matches
const PUNCTUATION_PATTERNS = [
  { pattern: /\.\.\. /g, type: 'pause', label: 'Pause' }, // Ellipsis first (longer)
  { pattern: /— /g, type: 'interrupt', label: 'Interrupt' }, // Em dash
  { pattern: / (hahaha|ahahaha|hehe yaar|hah arrey|hmm let me think|kya baat hai|amazing yaar|arrey wah|wah wah|kya baat|awesome yaar|arey yaar|kya matlab|wait what|samjha nahi|I don't know yaar|you know) /gi, type: 'expression', label: 'Expression' }, // Multi-word expressions first
  { pattern: / (hah|hehe|hihi|hehehe|tee-hee|heh|heh heh|hmph|arey|oho|kya|arre|haww|wah|hmm|ummm|achcha|matlab|nice|bahut badhiya|mast|ohh|hmm interesting|zabardast|hmm sad|hain|dekho|haah|uff|khair|uh|um|actually|like|I mean|well|so) /gi, type: 'expression', label: 'Expression' }, // Single-word expressions
  { pattern: /, /g, type: 'micro_pause', label: 'Micro Pause' }, // Comma last (most common, avoid false matches)
];

// Replacement options for markers
const REPLACEMENT_OPTIONS = {
  pause: ['(.)', '(pause)', '(breath)', '(mid)'],
  laughter: ['(laughs)', '(giggles)', '(chuckles)'],
  emotion: ['(surprised)', '(excited)', '(confused)', '(skeptical)', '(serious)', '(thinking)', '(sighs)', '(happy)', '(impressed)', '(sad)', '(curious)'],
};

// Get marker type colors
const getMarkerColor = (type: string) => {
  switch (type) {
    case 'pause': return 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20';
    case 'laughter': return 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20';
    case 'emotion': return 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20';
    default: return 'bg-white/10 text-white/60 border-white/20';
  }
};

// Get punctuation type colors (different from markers)
const getPunctuationColor = (type: string) => {
  switch (type) {
    case 'micro_pause': return 'bg-blue-500/20 text-blue-300 border-blue-400/30';
    case 'pause': return 'bg-purple-500/20 text-purple-300 border-purple-400/30';
    case 'interrupt': return 'bg-orange-500/20 text-orange-300 border-orange-400/30';
    case 'expression': return 'bg-green-500/20 text-green-300 border-green-400/30';
    default: return 'bg-white/10 text-white/60 border-white/20';
  }
};

// Get marker text color for view mode (colored inline text, not chips)
const getMarkerTextColor = (type: string) => {
  switch (type) {
    case 'pause': return 'text-purple-400';
    case 'laughter': return 'text-amber-400';
    case 'emotion': return 'text-cyan-400';
    default: return 'text-white/60';
  }
};

// Get punctuation text color for view mode (colored inline text, not chips)
const getPunctuationTextColor = (type: string) => {
  switch (type) {
    case 'micro_pause': return 'text-blue-400';
    case 'pause': return 'text-purple-400';
    case 'interrupt': return 'text-orange-400';
    case 'expression': return 'text-green-400';
    default: return 'text-white/60';
  }
};

// Punctuation chip component (non-editable, visual only)
interface PunctuationChipProps {
  punctuation: string;
  type: string;
  label: string;
}

const PunctuationChip: React.FC<PunctuationChipProps> = ({ punctuation, type, label }) => {
  // Get display text based on punctuation
  const getDisplayText = () => {
    if (punctuation === ', ') return 'Micro';
    if (punctuation === '... ') return 'Pause';
    if (punctuation === '— ') return 'Interrupt';
    // For expressions, show first word
    const match = punctuation.match(/ ([\w]+)/);
    return match ? match[1] : 'Expr';
  };

  return (
    <span 
      className={`inline-flex items-center mx-1 px-1.5 py-0.5 text-[10px] font-medium rounded border transition-all ${getPunctuationColor(type)}`}
      title={label}
    >
      {getDisplayText()}
    </span>
  );
};

interface MarkerChipProps {
  marker: string;
  type: string;
  onReplace: (newMarker: string) => void;
  onDelete: () => void;
}

const MarkerChip: React.FC<MarkerChipProps> = ({ marker, type, onReplace, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const displayLabel = marker.replace(/[()]/g, '');
  const options = REPLACEMENT_OPTIONS[type as keyof typeof REPLACEMENT_OPTIONS] || [];

  return (
    <span className="relative inline-block mx-1" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border transition-all cursor-pointer ${getMarkerColor(type)}`}
      >
        {displayLabel}
        <ChevronDown size={10} className={`transition-transform ${showMenu ? 'rotate-180' : ''}`} />
      </button>

      {showMenu && (
        <div className="absolute top-full left-0 mt-1 bg-[#202020] border border-white/10 rounded-lg shadow-xl z-[100] min-w-[120px] py-1 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/30 border-b border-white/5">
            Replace with
          </div>
          <div className="max-h-40 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onReplace(opt);
                  setShowMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${opt === marker ? 'text-white' : 'text-white/70'}`}
              >
                {opt.replace(/[()]/g, '')}
              </button>
            ))}
          </div>
          <div className="border-t border-white/5 mt-1 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </span>
  );
};

// Render text with inline editable content and marker chips
const TextWithMarkers: React.FC<{
  text: string;
  onChange: (newText: string) => void;
  onCursorChange: (pos: number) => void;
  isSelected: boolean;
  isLocked?: boolean;
  onSelect: () => void;
  showChips?: boolean; // Whether to show interactive chips (default: false, show plain text)
  readOnly?: boolean; // Whether the text is read-only (default: false)
}> = ({ text, onChange, onCursorChange, isSelected, isLocked = false, onSelect, showChips = false, readOnly = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [text]);

  // Focus textarea when line is selected
  useEffect(() => {
    if (isSelected && textareaRef.current && !isFocused) {
      // Don't auto-focus to prevent keyboard appearing unexpectedly
    }
  }, [isSelected, isFocused]);

  const handleReplaceMarker = (oldMarker: string, markerStartIndex: number, newMarker: string) => {
    const before = text.slice(0, markerStartIndex);
    const after = text.slice(markerStartIndex + oldMarker.length);
    onChange(before + newMarker + after);
  };

  const handleDeleteMarker = (marker: string, markerStartIndex: number) => {
    const before = text.slice(0, markerStartIndex);
    const after = text.slice(markerStartIndex + marker.length);
    const newText = (before + after).replace(/\s+/g, ' ').trim();
    onChange(newText);
  };

  // Parse text into segments (text, markers, and punctuation)
  const parseSegments = () => {
    if (!text || text.length === 0) {
      return [{ text: '', isMarker: false, isPunctuation: false, startIndex: 0 }];
    }

    const items: { match: string; index: number; type: string; isMarker: boolean; label: string; endIndex: number }[] = [];
    
    // Find all markers - use matchAll for better reliability
    MARKER_PATTERNS.forEach(({ pattern, type, label }) => {
      // Ensure pattern has 'g' flag for matchAll
      const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
      const regex = new RegExp(pattern.source, flags);
      try {
        const matches = Array.from(text.matchAll(regex));
        matches.forEach((match) => {
          if (match.index !== undefined) {
            items.push({ 
              match: match[0], 
              index: match.index, 
              type, 
              isMarker: true, 
              label,
              endIndex: match.index + match[0].length
            });
          }
        });
      } catch (e) {
        // Fallback to exec if matchAll fails (shouldn't happen with 'g' flag)
        let match;
        while ((match = regex.exec(text)) !== null) {
          if (match.index !== undefined) {
            items.push({ 
              match: match[0], 
              index: match.index, 
              type, 
              isMarker: true, 
              label,
              endIndex: match.index + match[0].length
            });
          }
        }
      }
    });

    // Find all punctuation patterns - use matchAll for better reliability
    PUNCTUATION_PATTERNS.forEach(({ pattern, type, label }) => {
      // Ensure pattern has 'g' flag for matchAll
      const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
      const regex = new RegExp(pattern.source, flags);
      try {
        const matches = Array.from(text.matchAll(regex));
        matches.forEach((match) => {
          if (match.index !== undefined) {
            items.push({ 
              match: match[0], 
              index: match.index, 
              type, 
              isMarker: false, 
              label,
              endIndex: match.index + match[0].length
            });
          }
        });
      } catch (e) {
        // Fallback to exec if matchAll fails (shouldn't happen with 'g' flag)
        let match;
        while ((match = regex.exec(text)) !== null) {
          if (match.index !== undefined) {
            items.push({ 
              match: match[0], 
              index: match.index, 
              type, 
              isMarker: false, 
              label,
              endIndex: match.index + match[0].length
            });
          }
        }
      }
    });

    // Sort by index, then by length (longer matches first if same start position)
    items.sort((a, b) => {
      if (a.index !== b.index) {
        return a.index - b.index;
      }
      // If same start position, prefer longer matches
      return b.match.length - a.match.length;
    });

    // Remove overlapping items - keep the first (longest) match at each position
    const filteredItems: typeof items = [];
    items.forEach((item) => {
      const overlaps = filteredItems.some(existing => 
        item.index < existing.endIndex && item.endIndex > existing.index
      );
      if (!overlaps) {
        filteredItems.push(item);
      }
    });

    const segments: { text: string; isMarker: boolean; isPunctuation: boolean; type?: string; label?: string; startIndex: number }[] = [];
    let lastIndex = 0;

    filteredItems.forEach((item) => {
      // Add text before item
      if (item.index > lastIndex) {
        segments.push({ 
          text: text.slice(lastIndex, item.index), 
          isMarker: false,
          isPunctuation: false,
          startIndex: lastIndex 
        });
      }
      
      // Add marker or punctuation
      segments.push({ 
        text: item.match, 
        isMarker: item.isMarker,
        isPunctuation: !item.isMarker,
        type: item.type,
        label: item.label,
        startIndex: item.index 
      });

      lastIndex = Math.max(lastIndex, item.endIndex);
    });

    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({ 
        text: text.slice(lastIndex), 
        isMarker: false,
        isPunctuation: false,
        startIndex: lastIndex 
      });
    }

    // Handle empty segments array
    if (segments.length === 0) {
      return [{ text, isMarker: false, isPunctuation: false, startIndex: 0 }];
    }

    return segments;
  };

  // Check for markers - ensure we find all matches
  const hasMarkers = MARKER_PATTERNS.some(({ pattern }) => {
    // Ensure pattern has 'g' flag for matchAll
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const regex = new RegExp(pattern.source, flags);
    try {
      const matches = Array.from(text.matchAll(regex));
      return matches.length > 0;
    } catch (e) {
      // Fallback to test if matchAll fails (shouldn't happen with 'g' flag)
      return regex.test(text);
    }
  });

  // Check for punctuation - ensure we find all matches
  const hasPunctuation = PUNCTUATION_PATTERNS.some(({ pattern }) => {
    // Ensure pattern has 'g' flag for matchAll
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const regex = new RegExp(pattern.source, flags);
    try {
      const matches = Array.from(text.matchAll(regex));
      return matches.length > 0;
    } catch (e) {
      // Fallback to test if matchAll fails (shouldn't happen with 'g' flag)
      return regex.test(text);
    }
  });

  const segments = parseSegments();
  const hasVisualElements = hasMarkers || hasPunctuation;

  // Render view mode: colored text spans (not chips) - shown when line is NOT selected
  const renderColoredTextDisplay = () => {
    if (!hasVisualElements) return null;

    return (
      <div 
        className="text-white/80 text-sm leading-relaxed font-light cursor-pointer"
        onClick={() => {
          onSelect();
          textareaRef.current?.focus();
        }}
      >
        {segments.map((segment, i) => {
          if (segment.isMarker) {
            // Render as colored inline text
            return (
              <span 
                key={`marker-text-${i}-${segment.startIndex}`}
                className={`${getMarkerTextColor(segment.type || 'pause')} font-normal`}
              >
                {segment.text}
              </span>
            );
          }
          
          if (segment.isPunctuation) {
            // Render as colored inline text
            return (
              <span 
                key={`punct-text-${i}-${segment.startIndex}`}
                className={`${getPunctuationTextColor(segment.type || 'expression')}`}
              >
                {segment.text}
              </span>
            );
          }
          
          return <span key={`text-${i}-${segment.startIndex}`}>{segment.text}</span>;
        })}
      </div>
    );
  };

  // Render edit mode: interactive chips - shown when line IS selected but not focused
  const renderChipDisplay = () => {
    if (!hasVisualElements) return null;

    return (
      <div className="text-white/80 text-sm leading-relaxed font-light cursor-text">
        {segments.map((segment, i) => {
          if (segment.isMarker) {
            return (
              <MarkerChip
                key={`marker-${i}-${segment.startIndex}`}
                marker={segment.text}
                type={segment.type || 'pause'}
                onReplace={(newMarker) => handleReplaceMarker(segment.text, segment.startIndex, newMarker)}
                onDelete={() => handleDeleteMarker(segment.text, segment.startIndex)}
              />
            );
          }
          
          if (segment.isPunctuation) {
            return (
              <PunctuationChip
                key={`punct-${i}-${segment.startIndex}`}
                punctuation={segment.text}
                type={segment.type || 'expression'}
                label={segment.label || 'Expression'}
              />
            );
          }
          
          // Plain text spans - make them clickable to focus textarea
          return (
            <span 
              key={`text-${i}-${segment.startIndex}`}
              onClick={(e) => {
                if (!isLocked && textareaRef.current) {
                  e.stopPropagation();
                  textareaRef.current.focus();
                  // Approximate cursor position
                  const clickX = e.clientX;
                  const rect = textareaRef.current.getBoundingClientRect();
                  const relativeX = clickX - rect.left;
                  const charWidth = 7;
                  const approximatePosition = Math.floor(relativeX / charWidth);
                  textareaRef.current.setSelectionRange(approximatePosition, approximatePosition);
                }
              }}
              className="cursor-text"
            >
              {segment.text}
            </span>
          );
        })}
      </div>
    );
  };

  // Determine which display mode to use:
  // - Not selected: show colored text (view mode)
  // - Selected + not focused: show chips (if enabled) or colored text (if disabled)
  // - Selected + focused: show textarea (typing mode)
  const showColoredText = hasVisualElements && (!isSelected || !showChips);
  const showChipsDisplay = hasVisualElements && isSelected && !isFocused && showChips;
  const showTextarea = !hasVisualElements || isFocused;

  return (
    <div ref={containerRef} className="relative">
      {/* Textarea for editing - always present, hidden when showing visual elements */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => !isLocked && !readOnly && onChange(e.target.value)}
        onFocus={() => {
          if (!isLocked && !readOnly) {
            setIsFocused(true);
          }
          onSelect();
        }}
        onBlur={() => setIsFocused(false)}
        onSelect={() => {
          if (textareaRef.current) {
            onCursorChange(textareaRef.current.selectionStart);
          }
        }}
        onKeyUp={() => {
          if (textareaRef.current) {
            onCursorChange(textareaRef.current.selectionStart);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        readOnly={isLocked || readOnly}
        placeholder="Enter dialogue text..."
        className={`w-full bg-transparent text-white/80 text-sm leading-relaxed resize-none focus:outline-none placeholder:text-white/20 font-light ${
          !showTextarea ? 'opacity-0 absolute inset-0' : ''
        } ${isLocked || readOnly ? 'cursor-default' : ''} ${showChipsDisplay ? 'z-0' : ''}`}
        rows={1}
      />
      
      {/* View mode: colored text - shown when NOT selected OR when chips are disabled */}
      {showColoredText && (
        <div className="relative z-10">
          {renderColoredTextDisplay()}
        </div>
      )}
      
      {/* Edit mode: interactive chips - shown when selected but not typing AND chips are enabled */}
      {showChipsDisplay && (
        <div className="relative z-10">
          {renderChipDisplay()}
        </div>
      )}
    </div>
  );
};

export const ScriptLine: React.FC<ScriptLineProps> = ({
  line,
  index,
  isSelected,
  isLocked = false,
  onSelect,
  onUpdate,
  onDelete,
  onCursorPositionChange,
  onSeekToSegment,
  audioReady = false,
  showChips = false,
  readOnly = false,
  showDelete = true,
}) => {
  const handleSpeakerToggle = () => {
    if (isLocked || readOnly) return;
    onUpdate({
      speaker: line.speaker === 'Rahul' ? 'Anjali' : 'Rahul',
    });
  };

  const handleLineClick = () => {
    onSelect();
    // If audio is ready, seek to this segment
    if (audioReady && onSeekToSegment) {
      onSeekToSegment(index);
    }
  };

  const speakerColor = line.speaker === 'Rahul' ? 'text-lime-400' : 'text-violet-400';

  return (
    <div
      onClick={handleLineClick}
      className={`group relative py-3 px-4 rounded-lg transition-all duration-150 ${audioReady ? 'cursor-pointer' : 'cursor-text'} border ${
        isSelected 
          ? 'bg-white/[0.03] border-white/[0.08]' 
          : 'border-transparent hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Speaker indicator dot */}
        <div className="pt-2">
          <div 
            className={`w-2 h-2 rounded-full ${
              line.speaker === 'Rahul' ? 'bg-lime-400' : 'bg-violet-400'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          {/* Speaker Label */}
          <div className="flex items-center justify-between mb-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSpeakerToggle();
              }}
              className={`text-[11px] font-normal ${speakerColor} hover:opacity-100 transition-opacity`}
              title="Click to toggle speaker"
            >
              {line.speaker}
            </button>

            {/* Delete Button */}
            {!isLocked && !readOnly && showDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 opacity-0 group-hover:opacity-40 hover:opacity-100 hover:text-red-400 transition-all duration-150 rounded"
                title="Delete line"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Text Content */}
          <TextWithMarkers
            text={line.text}
            onChange={(newText) => onUpdate({ text: newText })}
            onCursorChange={onCursorPositionChange}
            isSelected={isSelected}
            isLocked={isLocked}
            onSelect={onSelect}
            showChips={showChips}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
};

export default ScriptLine;
