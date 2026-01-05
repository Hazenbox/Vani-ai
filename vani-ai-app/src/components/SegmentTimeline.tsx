import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Play, Pause, SkipBack, SkipForward, Minus, Plus, Sparkles, Loader2, Download, RotateCcw } from 'lucide-react';
import { EditableScriptPart, SegmentTiming } from '../types';

interface SegmentTimelineProps {
  script: EditableScriptPart[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  // Audio playback props (optional - for when audio is ready)
  audioReady?: boolean;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  onTogglePlay?: () => void;
  onSeek?: (time: number) => void;
  // Generate audio callback (shown when audio not ready)
  onGenerateAudio?: () => void;
  isGeneratingAudio?: boolean;
  // Download callback
  onDownload?: () => void;
  // Segment timings (actual audio timings when available)
  segmentTimings?: SegmentTiming[];
}

// Calculate estimated duration based on character count
// Average speaking rate: ~15 characters per second for Hinglish
const CHARS_PER_SECOND = 15;

const calculateDuration = (text: string): number => {
  // Remove marker patterns from count as they won't be spoken
  const cleanText = text.replace(/\([^)]*\)/g, '').trim();
  const chars = cleanText.length;
  return Math.max(0.5, chars / CHARS_PER_SECOND); // Minimum 0.5s per segment
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Smooth zoom range
const MIN_ZOOM = 20;
const MAX_ZOOM = 100;
const DEFAULT_ZOOM = 40;

// Segment styling
const MIN_SEGMENT_WIDTH = 60;
const MIN_SEGMENT_GAP = 4;

export const SegmentTimeline: React.FC<SegmentTimelineProps> = ({
  script,
  selectedIndex,
  onSelect,
  audioReady = false,
  isPlaying = false,
  currentTime = 0,
  duration = 0,
  onTogglePlay,
  onSeek,
  onGenerateAudio,
  isGeneratingAudio = false,
  onDownload,
  segmentTimings = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  
  const [pixelsPerSecond, setPixelsPerSecond] = useState(DEFAULT_ZOOM);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate durations for all segments
  const segmentDurations = useMemo(() => {
    return script.map(line => calculateDuration(line.text));
  }, [script]);

  // Calculate cumulative time for each segment start
  // Use actual segmentTimings if available, otherwise estimate
  const segmentStartTimes = useMemo(() => {
    if (segmentTimings.length > 0 && audioReady) {
      // Use actual timings from audio
      return segmentTimings.map(timing => timing.start);
    }
    // Fallback to estimated times
    const times: number[] = [];
    let cumulative = 0;
    segmentDurations.forEach(dur => {
      times.push(cumulative);
      cumulative += dur;
    });
    return times;
  }, [segmentDurations, segmentTimings, audioReady]);

  // Total duration - use actual duration if available, otherwise estimate
  const totalDuration = useMemo(() => {
    if (duration > 0 && audioReady) {
      return duration;
    }
    return segmentDurations.reduce((sum, d) => sum + d, 0);
  }, [segmentDurations, duration, audioReady]);

  // Calculate segment widths and positions accounting for minimum width constraints
  const segmentLayout = useMemo(() => {
    const layout: { left: number; width: number }[] = [];
    let currentLeft = MIN_SEGMENT_GAP / 2;
    
    segmentDurations.forEach((segDur) => {
      const calculatedWidth = segDur * pixelsPerSecond;
      const width = Math.max(calculatedWidth, MIN_SEGMENT_WIDTH);
      
      layout.push({ left: currentLeft, width });
      currentLeft += width + MIN_SEGMENT_GAP;
    });
    
    return layout;
  }, [segmentDurations, pixelsPerSecond]);

  // Calculate total width needed for all segments with minimum widths enforced
  const layoutTotalWidth = useMemo(() => {
    if (segmentLayout.length === 0) return 800;
    const lastSegment = segmentLayout[segmentLayout.length - 1];
    return Math.max(lastSegment.left + lastSegment.width + MIN_SEGMENT_GAP, 800);
  }, [segmentLayout]);

  // Generate time markers for the ruler
  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    const interval = totalDuration > 60 ? 15 : 5;
    for (let t = 0; t <= totalDuration + interval; t += interval) {
      markers.push(t);
    }
    return markers;
  }, [totalDuration]);

  const totalWidth = layoutTotalWidth;

  // Update playhead position when selected index changes (but don't snap)
  useEffect(() => {
    if (!isDragging && segmentLayout[selectedIndex]) {
      // Set playhead to the left edge of the selected segment
      setPlayheadPosition(segmentLayout[selectedIndex].left);
    }
  }, [selectedIndex, segmentLayout, isDragging]);

  // Smooth zoom controls
  const handleZoomIn = () => {
    setPixelsPerSecond(prev => Math.min(MAX_ZOOM, prev + 10));
  };

  const handleZoomOut = () => {
    setPixelsPerSecond(prev => Math.max(MIN_ZOOM, prev - 10));
  };

  const handleZoomSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPixelsPerSecond(Number(e.target.value));
  };

  // Smooth draggable playhead handlers - continuous movement
  const handlePlayheadDrag = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollLeft;
    const clampedX = Math.max(0, Math.min(totalWidth, x));
    
    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      setPlayheadPosition(clampedX);
    });

    // Find and select the segment at this position
    for (let i = segmentLayout.length - 1; i >= 0; i--) {
      const seg = segmentLayout[i];
      if (clampedX >= seg.left) {
        if (i !== selectedIndex) {
          onSelect(i);
        }
        break;
      }
    }

    // If audio is ready, seek to the dragged position
    if (audioReady && totalDuration > 0 && onSeek) {
      const seekTime = (clampedX / totalWidth) * totalDuration;
      const clampedTime = Math.max(0, Math.min(totalDuration, seekTime));
      onSeek(clampedTime);
    }
  }, [totalWidth, segmentLayout, selectedIndex, onSelect, audioReady, totalDuration, onSeek]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handlePlayheadDrag(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handlePlayheadDrag(e);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Re-enable text selection when drag ends
      document.body.style.userSelect = '';
    };

    if (isDragging) {
      // Disable text selection during drag
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Cleanup: ensure text selection is re-enabled
      document.body.style.userSelect = '';
    };
  }, [isDragging, handlePlayheadDrag]);

  // Auto-scroll to selected segment
  useEffect(() => {
    if (selectedRef.current && containerRef.current && !audioReady) {
      const container = containerRef.current;
      const selected = selectedRef.current;
      
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      
      if (selectedRect.left < containerRect.left || selectedRect.right > containerRect.right) {
        selected.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [selectedIndex, audioReady]);

  // Auto-scroll timeline to follow playhead when audio is playing
  useEffect(() => {
    if (!audioReady || !isPlaying || !containerRef.current || duration === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const playheadX = currentTime * (totalWidth / duration);
    
    // Keep playhead roughly in the center-left portion of the view
    const targetScrollLeft = playheadX - containerWidth * 0.3;
    
    // Only scroll if playhead is moving out of view
    const currentScrollLeft = container.scrollLeft;
    const viewStart = currentScrollLeft;
    const viewEnd = currentScrollLeft + containerWidth;
    
    if (playheadX < viewStart + 50 || playheadX > viewEnd - 100) {
      container.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth',
      });
    }
  }, [currentTime, audioReady, isPlaying, duration, totalWidth]);

  // Sync selected segment with audio playback
  useEffect(() => {
    if (!audioReady || !isPlaying || totalDuration === 0) return;
    
    // Find which segment the current time falls into
    // Use actual segment timings if available
    if (segmentTimings.length > 0) {
      for (let i = segmentTimings.length - 1; i >= 0; i--) {
        const timing = segmentTimings[i];
        if (currentTime >= timing.start && currentTime < timing.end) {
          if (i !== selectedIndex) {
            onSelect(i);
          }
          break;
        }
      }
    } else {
      // Fallback to estimated times
      for (let i = segmentStartTimes.length - 1; i >= 0; i--) {
        const segStart = segmentStartTimes[i];
        const segEnd = i < segmentStartTimes.length - 1 
          ? segmentStartTimes[i + 1] 
          : totalDuration;
        
        if (currentTime >= segStart && currentTime < segEnd) {
          if (i !== selectedIndex) {
            onSelect(i);
          }
          break;
        }
      }
    }
  }, [currentTime, audioReady, isPlaying, totalDuration, segmentStartTimes, segmentTimings, selectedIndex, onSelect]);

  const truncateText = (text: string, maxLength: number = 30) => {
    const cleanText = text.replace(/\([^)]*\)/g, '').trim();
    if (cleanText.length <= maxLength) return cleanText;
    return cleanText.substring(0, maxLength) + '...';
  };

  // Playhead position based on actual audio time when playing, or segment position when editing
  const effectivePlayheadTime = audioReady ? currentTime : playheadPosition;
  const effectiveDuration = audioReady ? duration : totalDuration;

  return (
    <div className="bg-[#141414] border-t border-white/10 flex flex-col">
      {/* Top Control Bar - Audio Controls + Zoom */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06] bg-[#141414]">
        {/* Left: Timer display + Replay */}
        <div className="flex items-center gap-2 w-[160px]">
          <span className="text-[11px] font-mono text-white/50">
            {formatTime(currentTime)} / {formatTime(effectiveDuration)}
          </span>
          {audioReady && (
            <button
              onClick={() => onSeek?.(0)}
              className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-colors"
              title="Replay from start"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>

        {/* Center: Playback controls or Generate Audio button */}
        <div className="flex items-center gap-3">
          {audioReady ? (
            <>
              {/* Skip back */}
              <button
                onClick={() => onSeek?.(Math.max(0, currentTime - 10))}
                className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-colors"
                title="Skip back 10s"
              >
                <SkipBack size={14} />
              </button>

              {/* Play/Pause */}
              <button
                onClick={onTogglePlay}
                className="w-10 h-10 flex items-center justify-center bg-white hover:bg-white/90 text-black rounded-full transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>

              {/* Skip forward */}
              <button
                onClick={() => onSeek?.(Math.min(duration, currentTime + 10))}
                className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-colors"
                title="Skip forward 10s"
              >
                <SkipForward size={14} />
              </button>
            </>
          ) : (
            /* Generate Audio button when audio is not ready */
            <button
              onClick={onGenerateAudio}
              disabled={isGeneratingAudio}
              className="flex items-center gap-2 px-5 py-1.5 bg-lime-500 hover:bg-lime-400 disabled:bg-lime-500/50 text-black disabled:text-black/60 text-[12px] font-medium rounded-full transition-all disabled:cursor-not-allowed"
              title="Generate audio from script"
            >
              {isGeneratingAudio ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Generate Audio</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Right: Download + Zoom controls */}
        <div className="flex items-center gap-2 w-[160px] justify-end">
          {/* Download button */}
          {audioReady && onDownload && (
            <button
              onClick={onDownload}
              className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] rounded-full transition-colors"
              title="Download MP3"
            >
              <Download size={14} />
            </button>
          )}
          
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              disabled={pixelsPerSecond <= MIN_ZOOM}
              className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed rounded-full transition-colors"
              title="Zoom out"
            >
              <Minus size={14} />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              value={pixelsPerSecond}
              onChange={handleZoomSlider}
              className="w-14 h-0.5 bg-[#3f3f46] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <button
              onClick={handleZoomIn}
              disabled={pixelsPerSecond >= MAX_ZOOM}
              className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed rounded-full transition-colors"
              title="Zoom in"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Timeline */}
      <div
        ref={containerRef}
        className="h-14 overflow-x-auto overflow-y-hidden custom-scrollbar-horizontal"
      >
        <div 
          ref={trackRef}
          style={{ width: totalWidth, minWidth: '100%' }} 
          className="h-full flex flex-col cursor-crosshair relative"
          onMouseDown={handleMouseDown}
        >
          {/* Timestamp Ruler */}
          <div className="h-4 relative flex-shrink-0 bg-[#1a1a1a]/50">
            {timeMarkers.map((time) => (
              <div
                key={time}
                className="absolute top-0 h-full flex flex-col items-center"
                style={{ left: (time / totalDuration) * totalWidth }}
              >
                <div className="h-1.5 w-px bg-white/20" />
                <span className="text-[8px] font-mono text-white/30 mt-0.5">
                  {formatTime(time)}
                </span>
              </div>
            ))}
            
          </div>

          {/* Segments Track */}
          <div className="flex-1 relative px-1">
            {/* Playhead Marker - single unified playhead */}
            <div 
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{ left: (audioReady && totalDuration > 0 ? currentTime * (totalWidth / totalDuration) : playheadPosition) }}
            >
              {/* Triangle head pointing down */}
              <div 
                className="absolute -top-4 left-1/2 -translate-x-1/2"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '8px solid #ffffff',
                }}
              />
              {/* Vertical line */}
              <div className="absolute -top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-white" />
              {/* Time tooltip when dragging */}
              {isDragging && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-black text-[8px] font-mono font-medium px-1.5 py-0.5 rounded whitespace-nowrap">
                  Segment {selectedIndex + 1}
                </div>
              )}
            </div>

            {/* Segment blocks with zebra pattern */}
            {script.map((line, index) => {
              const isSelected = index === selectedIndex;
              const isRahul = line.speaker === 'Rahul';
              const { left, width } = segmentLayout[index] || { left: 0, width: MIN_SEGMENT_WIDTH };

              // Stripe pattern background
              const stripeColor = isRahul ? 'rgba(163, 230, 53, 0.06)' : 'rgba(167, 139, 250, 0.06)';
              const stripePattern = `repeating-linear-gradient(
                -45deg,
                transparent,
                transparent 3px,
                ${stripeColor} 3px,
                ${stripeColor} 6px
              )`;

              return (
                <button
                  key={line.id}
                  ref={isSelected ? selectedRef : null}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(index);
                    // Seek audio to this segment's start time
                    if (audioReady && onSeek && segmentStartTimes[index] !== undefined) {
                      onSeek(segmentStartTimes[index]);
                    }
                  }}
                  className={`absolute top-0.5 bottom-0.5 rounded border transition-all duration-150 flex items-center overflow-hidden ${
                    isSelected
                      ? isRahul
                        ? 'bg-lime-500/15 border-lime-500/40'
                        : 'bg-violet-500/15 border-violet-500/40'
                      : isRahul
                        ? 'border-lime-500/20 hover:bg-lime-500/10 hover:border-lime-500/30'
                        : 'border-violet-500/20 hover:bg-violet-500/10 hover:border-violet-500/30'
                  }`}
                  style={{
                    left,
                    width,
                    backgroundImage: stripePattern,
                  }}
                >
                  {/* Speaker indicator bar */}
                  <div
                    className={`w-0.5 h-full absolute left-0 top-0 ${
                      isRahul ? 'bg-lime-400' : 'bg-violet-400'
                    }`}
                  />

                  {/* Text preview */}
                  <div className="flex-1 flex items-center px-2 ml-1">
                  <span
                      className={`text-[9px] font-light truncate ${
                        isSelected ? 'text-white' : 'text-white/50'
                    }`}
                  >
                      {truncateText(line.text, Math.floor(width / 5))}
                  </span>
                  </div>
                </button>
              );
            })}

            {/* Empty state */}
            {script.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-white/20 text-xs">
                No segments
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar-horizontal::-webkit-scrollbar {
          height: 4px;
        }
        .custom-scrollbar-horizontal::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar-horizontal::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar-horizontal::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
};

export default SegmentTimeline;
