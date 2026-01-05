import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Plus, RotateCcw, Loader2, Edit3, RefreshCcw, Copy, Check, Pencil } from 'lucide-react';
import { ConversationData, EditableScriptPart, ScriptPart, SegmentTiming, LibraryItem, PipelineStep } from '../types';
import { EmotionPalette } from './EmotionPalette';
import { ScriptLine } from './ScriptLine';
import { SegmentTimeline } from './SegmentTimeline';
import { EditPanel } from './EditPanel';
import { cleanTextForTTS } from '../services/podcastService';

// Maximum number of history states to keep
const MAX_HISTORY_SIZE = 50;

// Delayed tooltip component
const DelayedTooltip: React.FC<{
  text: string;
  delay?: number;
  children: React.ReactNode;
}> = ({ text, delay = 500, children }) => {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = window.setTimeout(() => {
      setShow(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShow(false);
  };

  return (
    <div className="relative inline-flex" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-medium text-white bg-[#1a1a1a] border border-white/10 rounded shadow-lg whitespace-nowrap animate-in fade-in zoom-in-95 duration-150 z-50">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#1a1a1a]" />
        </div>
      )}
    </div>
  );
};

interface ScriptEditorProps {
  data: ConversationData | null;
  onGenerateAudio: (script: ScriptPart[]) => void;
  onImproveScript: (script: ScriptPart[], feedback: string) => Promise<void>;
  onBack: () => void;
  onOpenLibrary?: () => void;
  libraryCount?: number;
  isImproving: boolean;
  // Script generation props (initial loading)
  isGeneratingScript?: boolean;
  pipelineSteps?: PipelineStep[];
  progressValues?: Record<string, number>;
  // Audio playback props
  isGeneratingAudio?: boolean;
  audioReady?: boolean;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  isMuted?: boolean;
  amplitude?: number;
  segmentTimings?: SegmentTiming[];
  isSaved?: boolean;
  alreadySaved?: boolean;
  onTogglePlay?: () => void;
  onSeek?: (time: number) => void;
  onVolumeChange?: (volume: number) => void;
  onMuteToggle?: () => void;
  onSave?: () => void;
  onStopPlayback?: () => void;
  // Library for script switching
  library?: LibraryItem[];
  onLoadFromLibrary?: (item: LibraryItem) => void;
  // Generate from URL callback
  onGenerateFromUrl?: (url: string) => void;
  // Audio data for download
  audioBase64?: string | null;
  // Delete library item
  onDeleteLibraryItem?: (id: string) => void;
  // Clear editor when current script is deleted
  onClearEditor?: () => void;
}

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Time formatting helper
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Convert ScriptPart[] to EditableScriptPart[]
const toEditable = (script: ScriptPart[]): EditableScriptPart[] =>
  script.map((part) => ({
    ...part,
    id: generateId(),
  }));

// Convert EditableScriptPart[] back to ScriptPart[]
const fromEditable = (script: EditableScriptPart[]): ScriptPart[] =>
  script.map(({ id, ...rest }) => rest);


export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  data,
  onGenerateAudio,
  onImproveScript,
  onBack,
  onOpenLibrary,
  libraryCount = 0,
  isImproving,
  // Script generation props
  isGeneratingScript = false,
  pipelineSteps = [],
  progressValues = {},
  // Audio props
  isGeneratingAudio = false,
  audioReady = false,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  volume = 1,
  isMuted = false,
  amplitude = 0,
  segmentTimings = [],
  isSaved = false,
  alreadySaved = false,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onSave,
  onStopPlayback,
  // Library props
  library = [],
  onLoadFromLibrary,
  onGenerateFromUrl,
  audioBase64 = null,
  onDeleteLibraryItem,
  onClearEditor,
}) => {
  const [editableScript, setEditableScript] = useState<EditableScriptPart[]>(
    () => data ? toEditable(data.script) : []
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [urlValue, setUrlValue] = useState(data?.sourceUrl || '');
  
  // Script is locked when audio is playing
  const isLocked = audioReady && isPlaying;
  
  // Copy to clipboard state
  const [copied, setCopied] = useState(false);
  
  // Edit panel state
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  
  // Raw text view state
  const [showRawText, setShowRawText] = useState(false);

  // Undo/Redo history
  const [history, setHistory] = useState<EditableScriptPart[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());


  // Update script when data changes (after improvement)
  useEffect(() => {
    if (!data) return;
    const newScript = toEditable(data.script);
    setEditableScript(newScript);
    // Reset history when data changes externally
    setHistory([newScript]);
    setHistoryIndex(0);
  }, [data?.script]);

  // Sync URL value when data changes
  useEffect(() => {
    if (data?.sourceUrl) {
      setUrlValue(data.sourceUrl);
    }
  }, [data?.sourceUrl]);

  // Track changes for undo/redo (only when not triggered by undo/redo)
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    
    // Don't add to history if script is the same as current history state
    if (history[historyIndex] && JSON.stringify(editableScript) === JSON.stringify(history[historyIndex])) {
      return;
    }

    // Add current state to history, removing any future states after current index
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(editableScript);
      // Limit history size
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_SIZE - 1));
  }, [editableScript]);

  // Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const previousState = history[historyIndex - 1];
      setEditableScript(previousState);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const nextState = history[historyIndex + 1];
      setEditableScript(nextState);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex]);

  // Can undo/redo checks
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl + Z (undo) or Cmd/Ctrl + Shift + Z (redo)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      
      if (modifier && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      
      // Also support Cmd/Ctrl + Y for redo (Windows style)
      if (modifier && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Handle inserting pause/emotion marker at cursor position
  const handleInsertMarker = useCallback(
    (marker: string) => {
      if (selectedIndex < 0 || selectedIndex >= editableScript.length) return;

      const selectedLine = editableScript[selectedIndex];
      const currentText = selectedLine.text;
      
      // Insert marker at cursor position, or at end if no cursor position
      let newText: string;
      if (cursorPosition !== null && cursorPosition <= currentText.length) {
        const before = currentText.slice(0, cursorPosition);
        const after = currentText.slice(cursorPosition);
        newText = `${before}${marker}${after}`;
        // Update cursor position to be after the inserted marker
        setCursorPosition(cursorPosition + marker.length);
      } else {
        // Fallback: append to end
        newText = currentText.trim() ? `${currentText.trim()} ${marker}` : marker;
        setCursorPosition(newText.length);
      }

      setEditableScript((prev) =>
        prev.map((line, i) =>
          i === selectedIndex ? { ...line, text: newText } : line
        )
      );
    },
    [selectedIndex, editableScript, cursorPosition]
  );

  // Handle updating a script line
  const handleUpdateLine = useCallback(
    (index: number, updates: Partial<EditableScriptPart>) => {
      setEditableScript((prev) =>
        prev.map((line, i) => (i === index ? { ...line, ...updates } : line))
      );
    },
    []
  );

  // Handle deleting a script line
  const handleDeleteLine = useCallback(
    (index: number) => {
      if (editableScript.length <= 1) return; // Keep at least one line

      setEditableScript((prev) => prev.filter((_, i) => i !== index));

      // Adjust selection if needed
      if (selectedIndex >= index && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      }
    },
    [editableScript.length, selectedIndex]
  );

  // Handle adding a new line
  const handleAddLine = useCallback(() => {
    const lastLine = editableScript[editableScript.length - 1];
    const newSpeaker = lastLine?.speaker === 'Rahul' ? 'Anjali' : 'Rahul';

    const newLine: EditableScriptPart = {
      id: generateId(),
      speaker: newSpeaker,
      text: '',
    };

    setEditableScript((prev) => [...prev, newLine]);
    setSelectedIndex(editableScript.length);

    // Scroll to bottom
    setTimeout(() => {
      editorContainerRef.current?.scrollTo({
        top: editorContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  }, [editableScript]);

  // Handle generating audio
  const handleGenerate = useCallback(() => {
    onGenerateAudio(fromEditable(editableScript));
  }, [editableScript, onGenerateAudio]);

  // Handle resetting to original
  const handleReset = useCallback(() => {
    if (!data) return;
    setEditableScript(toEditable(data.script));
    setSelectedIndex(0);
  }, [data?.script]);


  // Handle downloading audio as MP3
  const handleDownload = useCallback(() => {
    if (!audioBase64 || !data) return;
    
    // Convert base64 to blob
    const byteCharacters = atob(audioBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'audio/mpeg' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Generate filename from title
    const sanitizedTitle = data.title
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    link.download = `${sanitizedTitle || 'vani_podcast'}.mp3`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [audioBase64, data]);

  // Handle copying script to clipboard
  const handleCopyScript = useCallback(() => {
    const scriptText = editableScript
      .map((line) => `${line.speaker}: ${line.text}`)
      .join('\n\n');
    
    navigator.clipboard.writeText(scriptText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [editableScript]);

  // Check if script has been edited (compare with original)
  const isEdited = useMemo(() => {
    if (!data) return false;
    if (editableScript.length !== data.script.length) return true;
    return editableScript.some((line, i) => 
      line.text !== data.script[i].text || line.speaker !== data.script[i].speaker
    );
  }, [editableScript, data?.script]);

  // Handle saving from EditPanel
  const handleSaveFromEditPanel = useCallback((newScript: EditableScriptPart[]) => {
    setEditableScript(newScript);
  }, []);

  // Reset cursor position when selected line changes
  useEffect(() => {
    // Set cursor to end of text when selecting a new line
    const selectedLine = editableScript[selectedIndex];
    if (selectedLine) {
      setCursorPosition(selectedLine.text.length);
    }
  }, [selectedIndex]);

  // Scroll to selected line when selection changes
  useEffect(() => {
    const selectedLine = editableScript[selectedIndex];
    if (!selectedLine) return;

    const lineElement = lineRefs.current.get(selectedLine.id);
    if (lineElement) {
      lineElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [selectedIndex, editableScript]);

  // Active line based on audio playback
  const activeLineIndex = useMemo(() => {
    if (!audioReady || !isPlaying) return -1;
    if (segmentTimings.length > 0) {
      // Find the segment that contains the current time
      // Remove threshold delay for immediate highlighting
      const activeSegment = segmentTimings.find(seg => {
        // Use small epsilon (0.01s) to handle edge cases, but no delay threshold
        return currentTime >= seg.start - 0.01 && currentTime < seg.end;
      });
      if (activeSegment) return activeSegment.index;
      // If past all segments, return last one
      if (currentTime >= segmentTimings[segmentTimings.length - 1]?.end) {
        return segmentTimings.length - 1;
      }
      // If before first segment, return first one
      if (currentTime < segmentTimings[0]?.start) {
        return 0;
      }
    }
    return -1;
  }, [currentTime, segmentTimings, audioReady, isPlaying]);

  // Get current step info for loading display
  const currentStep = pipelineSteps.find(s => s.status === 'PROCESSING');
  const completedSteps = pipelineSteps.filter(s => s.status === 'DONE').length;
  const totalSteps = pipelineSteps.length;
  
  // Calculate percentage completed based on completed steps
  // Each step represents ~33% (1/3), add small increment when step is processing
  const basePercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const processingBonus = currentStep ? 5 : 0; // Add 5% when a step is actively processing
  const progressPercentage = Math.min(Math.round(basePercentage + processingBonus), 100);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Loading Overlay for Script Generation - Simple Style */}
      {isGeneratingScript && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#171717]/95 backdrop-blur-sm">
          <div className="w-full max-w-md mx-6">
            <div className="bg-[#171717] border border-white/[0.06] rounded-xl p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                <h3 className="text-white/90 text-[15px] font-medium">Generating script</h3>
                <span className="text-white/60 text-[13px] font-medium">{progressPercentage}%</span>
              </div>

              {/* Steps List */}
              <div className="space-y-3">
                {pipelineSteps.map((step, i) => {
                  const isActive = step.status === 'PROCESSING';
                  const isDone = step.status === 'DONE';
                  const isPending = step.status === 'PENDING';
                  
                  return (
                    <div key={step.id} className="flex items-center gap-3">
                      {/* Status Icon */}
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        {isDone && (
                          <div className="w-4 h-4 rounded-full bg-lime-500 flex items-center justify-center">
                            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        {isActive && (
                          <Loader2 size={16} className="text-lime-500 animate-spin" strokeWidth={2} />
                        )}
                        {isPending && (
                          <div className="w-4 h-4 rounded-full border-2 border-white/20"></div>
                        )}
                      </div>
                      
                      {/* Step Label */}
                      <span className={`text-[13px] ${
                        isDone ? 'text-white/60' : 
                        isActive ? 'text-white/90' : 
                        'text-white/40'
                      }`}>
                        {step.label}...
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden my-2 mr-2 bg-[#171717] rounded-xl border border-white/[0.06]">
          <>
          {/* Toolbar: URL + Reset */}
          <div className="px-3 py-2 border-b border-white/[0.06] flex items-center">
            {/* Left: Script title in sentence case - fixed width for balance */}
            <div className="w-[280px] shrink-0">
              {data?.title && (
                <span className="text-sm text-white/70 truncate block" title={data.title}>
                  {data.title.charAt(0).toUpperCase() + data.title.slice(1).toLowerCase()}
                </span>
              )}
            </div>
            
            {/* Center: URL bar with Generate button */}
            <div className="flex-1 flex justify-center items-center gap-3">
              <div className="relative max-w-[280px] w-full group">
                <input 
                  type="text"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && urlValue !== data?.sourceUrl && urlValue.trim()) {
                      onGenerateFromUrl?.(urlValue);
                    }
                  }}
                  className="w-full text-[11px] text-white/40 hover:text-white/60 focus:text-white bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] rounded-full px-4 py-1.5 text-left outline-none transition-all placeholder:text-white/25"
                  title="Source URL"
                  placeholder="Enter URL to generate new script..."
                />
              </div>
              {urlValue && urlValue !== data?.sourceUrl && (
                <button
                  onClick={() => onGenerateFromUrl?.(urlValue)}
                  className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium text-white hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-full transition-all whitespace-nowrap"
                  title="Generate new script from URL"
                >
                  Generate
                </button>
              )}
            </div>

            {/* Right: Raw Text Toggle, Edit Script, Save & Regenerate, Download, Reset - fixed width for balance */}
            <div className="w-[280px] shrink-0 flex items-center justify-end gap-2">
              {/* Raw Text Toggle */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-white/50">Raw Text</span>
                <button
                  onClick={() => setShowRawText(!showRawText)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-lime-400/50 ${
                    showRawText ? 'bg-lime-400' : 'bg-white/20'
                  }`}
                  role="switch"
                  aria-checked={showRawText}
                  title="Toggle raw text view (shows exact text sent to API)"
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 transform rounded-full transition-transform duration-200 ${
                      showRawText ? 'translate-x-4 bg-black' : 'translate-x-0.5 bg-white'
                    }`}
                  />
                </button>
              </div>

              {/* Edit Script button - always visible when script exists */}
              <button
                onClick={() => setIsEditPanelOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-all whitespace-nowrap"
                title="Open advanced script editor"
              >
                <Pencil size={12} />
                Edit Script
              </button>

              {/* Save & Regenerate button - shown when audio is ready and script is edited */}
              {audioReady && isEdited && (
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-all whitespace-nowrap"
                  title="Regenerate audio with changes"
                >
                  <RefreshCcw size={12} />
                  Regenerate
                </button>
              )}

              {/* Reset button */}
              {isEdited && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-all whitespace-nowrap"
                >
                  <RotateCcw size={12} />
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Script Lines - Full Width */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Script Lines */}
            <div
              ref={editorContainerRef}
              className="flex-1 overflow-y-auto px-8 py-8"
            >
              {showRawText ? (
                // Raw Text View - shows exact text sent to API
                <div className="max-w-[700px] w-full mx-auto">
                  <div className="bg-black/20 rounded-lg p-6 border border-white/[0.06]">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider mb-4 font-medium">
                      Raw Text (Sent to Audio API)
                    </div>
                    <div className="space-y-4 text-white/80 text-[15px] leading-relaxed font-mono">
                      {editableScript.map((line, index) => {
                        const rawText = cleanTextForTTS(line.text);
                        return (
                          <div key={line.id} className="group">
                            <div className="text-[11px] text-white/40 mb-1 font-sans">
                              {line.speaker}
                            </div>
                            <div className="text-white/80 whitespace-pre-wrap">
                              {rawText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                // Normal View - shows colored markers
                <div className="max-w-[700px] w-full space-y-1 mx-auto">
                  {editableScript.map((line, index) => (
                    <div
                      key={line.id}
                      ref={(el) => {
                        if (el) lineRefs.current.set(line.id, el);
                      }}
                    >
                      <ScriptLine
                        line={line}
                        index={index}
                        isSelected={index === selectedIndex}
                        isLocked={isLocked}
                        onSelect={() => setSelectedIndex(index)}
                        onUpdate={(updates) => handleUpdateLine(index, updates)}
                        onDelete={() => handleDeleteLine(index)}
                        onCursorPositionChange={(position) => setCursorPosition(position)}
                        onSeekToSegment={(index) => {
                          if (audioReady && segmentTimings.length > 0 && onSeek) {
                            const timing = segmentTimings[index];
                            if (timing) {
                              onSeek(timing.start);
                            }
                          }
                        }}
                        audioReady={audioReady}
                        showChips={false}
                        readOnly={true}
                        showDelete={false}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Timeline at bottom */}
          <SegmentTimeline
            script={editableScript}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            audioReady={audioReady}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            onTogglePlay={onTogglePlay}
            onSeek={onSeek}
            onGenerateAudio={handleGenerate}
            isGeneratingAudio={isGeneratingAudio}
            onDownload={handleDownload}
            segmentTimings={segmentTimings}
          />
          </>
        </main>

      {/* Edit Panel */}
      <EditPanel
        isOpen={isEditPanelOpen}
        onClose={() => setIsEditPanelOpen(false)}
        script={editableScript}
        onSave={handleSaveFromEditPanel}
      />

      <style>{`
        aside::-webkit-scrollbar {
          width: 4px;
        }
        aside::-webkit-scrollbar-track {
          background: transparent;
        }
        aside::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        aside::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        main > div::-webkit-scrollbar {
          width: 6px;
        }
        main > div::-webkit-scrollbar-track {
          background: transparent;
        }
        main > div::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        main > div::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};

export default ScriptEditor;
