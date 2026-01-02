
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { generateScript, generateMultiSpeakerAudio, decodeAudio, decodeAudioDataToBuffer, improveScript } from './services/geminiService';
import { getAllLibraryItems, saveLibraryItem, deleteLibraryItem } from './services/db';
import { ConversationData, AppState, PipelineStep, LibraryItem, SegmentTiming, ScriptPart } from './types';
import { Visualizer } from './components/Visualizer';
import { MovingBorder } from './components/MovingBorder';
import { ScriptEditor } from './components/ScriptEditor';
import { VaniLogo } from './components/VaniLogo';
import { UrlInput } from './components/UrlInput';
import WaveformBackground from './components/WaveformBackground';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from './hooks/useKeyboardShortcuts';
import { Toaster, toast } from 'sonner';
import { 
  Play, Pause, RefreshCcw, Send, Volume2, ArrowLeft, 
  Terminal, Cpu, Save, BookOpen, Trash2, FastForward, 
  Rewind, Check, ExternalLink, Globe,
  Activity, ShieldAlert, Zap, History, Clock,
  AlertCircle, Keyboard, VolumeX, Volume1, Edit3, X, AudioLines, Plus, MoreHorizontal, Pencil
} from 'lucide-react';

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [data, setData] = useState<ConversationData | null>(null);
  const [currentAudioBase64, setCurrentAudioBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [progressValues, setProgressValues] = useState<Record<string, number>>({});
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const [segmentTimings, setSegmentTimings] = useState<SegmentTiming[]>([]);
  const [displayScript, setDisplayScript] = useState<ScriptPart[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (activeMenuId) setActiveMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenuId]);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  const transcriptRefs = useRef<(HTMLDivElement | null)[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { id: 'fetch', label: 'Analyzing source material', status: 'PENDING' },
    { id: 'reason', label: 'Writing Hinglish script', status: 'PENDING' },
    { id: 'synth', label: 'Synthesizing natural voices', status: 'PENDING' },
    { id: 'decode', label: 'Readying audio stream', status: 'PENDING' }
  ]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);

  const activeLineIndex = useMemo(() => {
    // Use segment timings for accurate sync
    if (segmentTimings.length > 0) {
      const activeSegment = segmentTimings.find(seg => {
        // Calculate proportional threshold based on segment duration
        const segmentDuration = seg.end - seg.start;
        const threshold = Math.max(0.05, segmentDuration * 0.05);
        // Highlight when currentTime is past the threshold, ensuring audio has actually started
        return currentTime > seg.start + threshold && currentTime < seg.end;
      });
      if (activeSegment) return activeSegment.index;
      // If past all segments, return last one
      if (currentTime >= segmentTimings[segmentTimings.length - 1]?.end) {
        return segmentTimings.length - 1;
      }
      return 0;
    }
    // Fallback to linear calculation if no timings
    if (!data || duration === 0) return -1;
    const progress = currentTime / duration;
    const index = Math.floor(progress * data.script.length);
    return Math.min(index, data.script.length - 1);
  }, [currentTime, segmentTimings, data, duration]);

  const alreadySaved = useMemo(() => {
    if (!data) return false;
    return library.some(item => item.data.sourceUrl === data.sourceUrl || item.data.title === data.title);
  }, [data, library]);

  const recentItems = useMemo(() => library.slice(0, 3), [library]);

  useEffect(() => {
    const loadLib = async () => {
      try {
        const items = await getAllLibraryItems();
        setLibrary(items);
      } catch (e) {
        console.error("Failed to load library from IndexedDB", e);
      }
    };
    loadLib();
  }, []);

  useEffect(() => {
    if (activeLineIndex !== -1 && transcriptRefs.current[activeLineIndex]) {
      transcriptRefs.current[activeLineIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeLineIndex]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(isMuted ? 0 : volume, audioContextRef.current?.currentTime || 0, 0.05);
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (sourceRef.current) {
      sourceRef.current.playbackRate.setTargetAtTime(playbackSpeed, audioContextRef.current?.currentTime || 0, 0.05);
    }
  }, [playbackSpeed]);

  useEffect(() => {
    if (!isPlaying || !analyserRef.current) {
      setAmplitude(0);
      return;
    }
    let frame: number;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const update = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setAmplitude(avg / 128.0);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);

  const updateStep = (id: string, status: PipelineStep['status']) => {
    setPipelineSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  };

  const startProgress = (id: string) => {
    let current = 0;
    const interval = setInterval(() => {
      const increment = current < 80 ? Math.random() * 8 : Math.random() * 2;
      current = Math.min(95, current + increment);
      setProgressValues(prev => ({ ...prev, [id]: Math.floor(current) }));
    }, 150);

    return {
      complete: () => {
        clearInterval(interval);
        setProgressValues(prev => ({ ...prev, [id]: 100 }));
      },
      fail: () => {
        clearInterval(interval);
      }
    };
  };

  const validateUrl = (input: string) => {
    if (!input) return false;
    try {
      new URL(input);
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleGenerate = async (targetUrl?: string) => {
    const activeUrl = targetUrl || url;
    if (!activeUrl) return;

    if (!validateUrl(activeUrl)) {
      setValidationError(true);
      setTimeout(() => setValidationError(false), 2000);
      return;
    }
    
    setError(null);
    setIsSaved(false);
    setIsGeneratingScript(true);
    setState(AppState.EDITING); // Go directly to EDITING state with loading overlay
    setPipelineSteps(s => s.map(item => ({ ...item, status: 'PENDING' })));
    setProgressValues({});

    try {
      // Start showing progress immediately
      updateStep('fetch', 'PROCESSING');
      const fetchPrg = startProgress('fetch');
      
      // Small delay to show the loading UI before starting heavy work
      await new Promise(r => setTimeout(r, 100));
      
      fetchPrg.complete();
      updateStep('fetch', 'DONE');

      updateStep('reason', 'PROCESSING');
      const reasonPrg = startProgress('reason');
      const scriptData = await generateScript(activeUrl);
      scriptData.sourceUrl = activeUrl; 
      reasonPrg.complete();
      setData(scriptData);
      updateStep('reason', 'DONE');
      
      // Show toast if Gemini failed and we used Groq fallback
      if (scriptData.modelUsed === 'groq') {
        toast.warning('Gemini unavailable, used Groq as fallback', {
          description: 'Script generated with LLaMA 3.3 70B instead',
          duration: 4000,
        });
      }

      // Save project immediately after script generation (without audio)
      const projectId = window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString();
      const newItem: LibraryItem = {
        id: projectId,
        data: scriptData,
        timestamp: Date.now()
      };
      
      await saveLibraryItem(newItem);
      setLibrary(prev => [newItem, ...prev]);
      setCurrentProjectId(projectId);

      // Script generation complete
      setIsGeneratingScript(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Pipeline sequence failed');
      setIsGeneratingScript(false);
      setState(AppState.ERROR);
    }
  };

  // Handle generating audio from edited script
  const handleGenerateAudio = async (script: ScriptPart[]) => {
    if (!data) return;
    
    setError(null);
    setIsGeneratingAudio(true);
    setAudioReady(false);

    try {
      const audioResult = await generateMultiSpeakerAudio(script);
      setCurrentAudioBase64(audioResult.audioBase64);
      setSegmentTimings(audioResult.segmentTimings);
      setDisplayScript(audioResult.cleanedScript);
      // Update data with the edited script
      setData(prev => prev ? { ...prev, script } : null);

      const audioBytes = decodeAudio(audioResult.audioBase64);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const buffer = await decodeAudioDataToBuffer(audioBytes, audioContextRef.current);
      currentBufferRef.current = buffer;
      setDuration(buffer.duration);
      
      // Update segment timings with actual audio duration if different
      if (audioResult.segmentTimings.length > 0) {
        const estimatedDuration = audioResult.segmentTimings[audioResult.segmentTimings.length - 1].end;
        const scaleFactor = buffer.duration / estimatedDuration;
        if (Math.abs(scaleFactor - 1) > 0.01) {
          const scaledTimings = audioResult.segmentTimings.map(seg => ({
            ...seg,
            start: seg.start * scaleFactor,
            end: seg.end * scaleFactor
          }));
          setSegmentTimings(scaledTimings);
        }
      }

      setIsGeneratingAudio(false);
      setAudioReady(true);
      playAudio(buffer);
      
      // Update existing project with audio (or create new if no current project)
      setTimeout(() => {
        if (data && audioResult.audioBase64) {
          const projectId = currentProjectId || (window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString());
          const item: LibraryItem = {
            id: projectId,
            data: { ...data, script },
            audioBase64: audioResult.audioBase64,
            timestamp: Date.now()
          };
          
          saveLibraryItem(item).then(() => {
            // Update existing item in library or add new
            setLibrary(prev => {
              const existingIndex = prev.findIndex(i => i.id === projectId);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = item;
                return updated;
              }
              return [item, ...prev];
            });
            setCurrentProjectId(projectId);
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
          }).catch(e => {
            console.error("Auto-save failed", e);
          });
        }
      }, 500);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Audio synthesis failed');
      setIsGeneratingAudio(false);
      setState(AppState.ERROR);
    }
  };

  // Handle improving script with feedback
  const handleImproveScript = async (script: ScriptPart[], feedback: string) => {
    if (!data) return;
    
    setIsImproving(true);
    try {
      const improvedData = await improveScript(script, feedback, data.title, data.sourceUrl);
      setData(improvedData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Script improvement failed');
    } finally {
      setIsImproving(false);
    }
  };

  // Handle going back from editor (clear project selection)
  const handleEditorBack = () => {
    clearEditor();
  };

  // Handle editing script from playing state
  const handleEditScript = () => {
    if (sourceRef.current) try { sourceRef.current.stop(); } catch(e) {}
    setIsPlaying(false);
    setState(AppState.EDITING);
  };

  // Handle stopping playback for editing (pause without changing state)
  const handleStopPlayback = () => {
    if (audioContextRef.current) {
      audioContextRef.current.suspend();
    }
    setIsPlaying(false);
  };

  const playAudio = (buffer: AudioBuffer, startTimeOffset = 0) => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch(e) {}
    }
    
    const ctx = audioContextRef.current!;
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyserRef.current = analyser;

    const gainNode = ctx.createGain();
    gainNode.gain.value = isMuted ? 0 : volume;
    gainNodeRef.current = gainNode;
    
    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    source.playbackRate.value = playbackSpeed;
    source.onended = () => {
      if (sourceRef.current === source) {
        setIsPlaying(false);
        setCurrentTime(buffer.duration);
      }
    };

    source.start(0, startTimeOffset);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    offsetRef.current = startTimeOffset;
    setIsPlaying(true);
  };

  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        if (audioContextRef.current) {
          const elapsed = (audioContextRef.current.currentTime - startTimeRef.current) * playbackSpeed;
          const current = offsetRef.current + elapsed;
          setCurrentTime(Math.min(current, duration));
        }
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration, playbackSpeed]);

  const togglePlay = () => {
    if (!audioContextRef.current || !currentBufferRef.current) return;
    if (isPlaying) {
      audioContextRef.current.suspend();
      setIsPlaying(false);
    } else {
      // Option B: Recreate audio source if needed (fixes volume issue on first play)
      // Recreate the audio chain if:
      // 1. No source exists (first play after generation)
      // 2. No gain node exists (audio chain not properly initialized)
      // 3. Context is suspended (browser autoplay policy - ensures gain is applied)
      const needsRecreation = !sourceRef.current || 
                              !gainNodeRef.current || 
                              audioContextRef.current.state === 'suspended';
      
      if (needsRecreation) {
        // Recreate audio chain from current position - ensures gain node is properly set
        playAudio(currentBufferRef.current, currentTime);
      } else {
        // Just resume existing audio
        audioContextRef.current.resume();
        setIsPlaying(true);
      }
    }
  };

  const seek = (seconds: number) => {
    if (!currentBufferRef.current) return;
    const newTime = Math.max(0, Math.min(duration, seconds));
    playAudio(currentBufferRef.current, newTime);
  };

  const handleSaveToLibrary = async () => {
    if (!data || !currentAudioBase64 || alreadySaved) return;
    try {
      const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : Date.now().toString();
      const item: LibraryItem = {
        id,
        data,
        audioBase64: currentAudioBase64,
        timestamp: Date.now()
      };
      
      await saveLibraryItem(item);
      setLibrary(prev => [item, ...prev]);
      
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (e) {
      console.error("Save failed", e);
      alert("System was unable to persist this session.");
    }
  };

  const handleDeleteLibraryItem = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await deleteLibraryItem(id);
      setLibrary(prev => prev.filter(i => i.id !== id));
      // If deleting current project, clear editor
      if (id === currentProjectId) {
        clearEditor();
      }
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    const itemToDelete = library.find(item => item.id === deleteConfirmId);
    if (itemToDelete) {
      await handleDeleteLibraryItem(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const loadFromLibrary = async (item: LibraryItem) => {
    // Stop any currently playing audio before switching projects
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch(e) {}
    }
    setIsPlaying(false);
    
    setData(item.data);
    setCurrentProjectId(item.id);
    setCurrentAudioBase64(item.audioBase64 || null);
    
    // Only setup audio if the project has audio
    if (item.audioBase64) {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioBytes = decodeAudio(item.audioBase64);
      const buffer = await decodeAudioDataToBuffer(audioBytes, audioContextRef.current);
      currentBufferRef.current = buffer;
      setDuration(buffer.duration);
      setCurrentTime(0);
      setAudioReady(true);
      // Don't auto-play when switching projects - user can click play
    } else {
      // No audio yet - reset audio state
      currentBufferRef.current = null;
      setDuration(0);
      setCurrentTime(0);
      setAudioReady(false);
    }
    
    setState(AppState.EDITING);
  };

  const reset = () => {
    if (sourceRef.current) try { sourceRef.current.stop(); } catch(e) {}
    clearEditor();
    setUrl('');
  };

  // Clear editor state (used when current library item is deleted)
  const clearEditor = () => {
    if (sourceRef.current) try { sourceRef.current.stop(); } catch(e) {}
    setData(null);
    setCurrentAudioBase64(null);
    setCurrentProjectId(null);
    currentBufferRef.current = null;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSegmentTimings([]);
    setDisplayScript([]);
    setAudioReady(false);
    setState(AppState.IDLE);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatRemainingTime = (seconds: number, total: number) => {
    const remaining = total - seconds;
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    return `-${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTranscriptClick = (index: number) => {
    if (duration === 0) return;
    // Use segment timings for accurate seeking
    if (segmentTimings.length > 0 && segmentTimings[index]) {
      seek(segmentTimings[index].start);
    } else if (data) {
      // Fallback to linear calculation
      const seekTime = (index / data.script.length) * duration;
      seek(seekTime);
    }
  };

  // Keyboard shortcuts handler
  const handleEscape = useCallback(() => {
    if (showShortcuts) {
      setShowShortcuts(false);
    } else if (state === AppState.PLAYING || state === AppState.ERROR) {
      reset();
    }
  }, [showShortcuts, state]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) setIsMuted(false);
  }, [isMuted]);

  // Enable keyboard shortcuts when playing
  useKeyboardShortcuts({
    isPlaying,
    onTogglePlay: togglePlay,
    onSeek: seek,
    onVolumeChange: handleVolumeChange,
    onMuteToggle: handleMuteToggle,
    onReset: reset,
    onEscape: handleEscape,
    currentTime,
    duration,
    volume,
    enabled: state === AppState.PLAYING
  });

  // Get volume icon based on level
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="h-screen relative flex flex-col overflow-hidden selection:bg-white/20 bg-[#0d0d0d]">
      <Toaster 
        theme="dark" 
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
          },
        }}
      />
      
      {/* Waveform background animation - only on homepage */}
      {data === null && (
        <div className="fixed inset-0 z-0 opacity-40 pointer-events-none">
          <WaveformBackground verticalPosition={0.55} />
        </div>
      )}
      
      <div className="fixed inset-0 pointer-events-none z-10">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,_rgba(255,255,255,0.01)_0%,_transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        <div className="absolute inset-0 bg-scanlines opacity-[0.02]" />
      </div>

      {/* Conditional Layout: Full-screen home OR Dashboard with sidebar */}
      {data === null ? (
        /* Full-screen Home Page - No sidebar */
        <main className="z-20 w-full max-w-4xl mx-auto flex-1 flex flex-col items-center justify-center" style={{ color: 'rgba(255, 255, 255, 0)' }}>
          {state === AppState.ERROR ? (
            /* Error View */
            <div className="flex-1 flex flex-col justify-center text-center space-y-6 pt-20 animate-in fade-in zoom-in-95 duration-700 ease-out">
              <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                <ShieldAlert size={24} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black uppercase tracking-widest text-red-400">Sequence Aborted</h2>
                <p className="text-white/40 text-sm max-w-sm mx-auto">{error}</p>
              </div>
              <button 
                onClick={reset}
                className="px-8 py-3 rounded-full bg-white text-black text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                Re-initialize Pipeline
              </button>
            </div>
          ) : (
            /* URL Input View - Centered full-screen */
            <div className="flex flex-col items-center space-y-6 relative w-full">
              <header className="text-center space-y-4">
                <h1 className="drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] flex justify-center">
                  <VaniLogo width={140} height={34} />
                </h1>
                <p className="text-white/40 text-xs md:text-sm max-w-xs mx-auto leading-relaxed font-light tracking-normal">
                  Neural Hinglish Conversation Engine
                </p>
              </header>

              <div className="relative w-full max-w-xl mx-auto">
                <UrlInput
                  value={url}
                  onChange={(value) => {
                    setUrl(value);
                    if (validationError) setValidationError(false);
                  }}
                  onSubmit={() => handleGenerate()}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
                  autoFocus
                  hasError={validationError}
                  showMovingBorder={false}
                />

                {validationError && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[9px] font-black uppercase px-4 py-2 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <AlertCircle size={12} /> Invalid source link provided
                  </div>
                )}

                {isInputFocused && recentItems.length > 0 && (
                  <div className="absolute top-[calc(100%+16px)] left-0 w-full bg-[#1a1a1a]/95 backdrop-blur-3xl border border-white/10 rounded-3xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 z-50 shadow-2xl">
                    <div className="px-6 py-3 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                      <span className="text-[9px] font-mono tracking-[0.2em] text-white/20 uppercase flex items-center gap-2"><History size={12} /> Neural Archive Access</span>
                    </div>
                    <div className="p-2">
                      {recentItems.map(item => (
                        <button
                          key={item.id}
                          onMouseDown={() => loadFromLibrary(item)}
                          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/5 rounded-2xl transition-all group text-left"
                        >
                          <div className="flex items-center gap-4 overflow-hidden">
                            <Clock size={14} className="text-white/10 group-hover:text-white/50" />
                            <span className="text-[12px] md:text-sm text-white/40 group-hover:text-white transition-colors truncate font-light tracking-tight">{item.data.title}</span>
                          </div>
                          <span className="text-[9px] font-mono text-white/5 group-hover:text-white/30 ml-4 shrink-0">LOAD_STREAM</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Test link at bottom right */}
              <a
                href="/test"
                className="fixed bottom-0 right-0 text-white/20 hover:text-white/40 transition-colors text-xs font-mono p-6 z-30"
                title="Audio Comparison Test"
              >
                /test
              </a>
            </div>
          )}
        </main>
      ) : (
        /* Dashboard Layout - Sidebar + Editor (when project selected) */
        <div className="z-20 w-full h-screen flex">
          {/* Left Sidebar - Only visible when editing */}
          <aside className="w-56 bg-[#0d0d0d] flex flex-col">
            <div className="flex-1 flex flex-col overflow-hidden py-3">
              {/* Logo */}
              <div className="px-5 h-10 flex items-center shrink-0 mb-4">
                <button 
                  onClick={reset}
                  className="flex items-center gap-3 opacity-80 hover:opacity-100 transition-opacity"
                  title="New project"
                >
                  <VaniLogo width={70} height={18} />
                </button>
              </div>

              {/* New Project Button */}
              <div className="px-2">
                <button
                  onClick={() => {
                    clearEditor();
                    setUrl('');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-white/70 hover:text-white hover:bg-white/[0.06] rounded-lg text-[13px]"
                >
                  <Plus size={16} strokeWidth={1.5} className="text-white/50" />
                  <span className="flex-1 text-left">New project</span>
                </button>
              </div>

              {/* Section Separator */}
              <div className="mx-3 my-3 border-t border-white/[0.06]" />

              {/* Projects List */}
              <div className="flex-1 overflow-y-auto px-2 custom-scrollbar">
                {library.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-3">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
                      <AudioLines size={16} className="text-white/20" />
                    </div>
                    <p className="text-white/40 text-[12px] font-medium text-center">No projects yet</p>
                    <p className="text-white/25 text-[11px] text-center mt-1">Create a new project to get started</p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {library.map((item) => {
                      const isCurrentProject = data && (
                        item.data.title === data.title || 
                        item.data.sourceUrl === data.sourceUrl ||
                        item.id === currentProjectId
                      );
                      
                      const isRenaming = renamingId === item.id;
                      
                      return (
                        <div 
                          key={item.id}
                          className={`group relative flex items-center rounded-lg ${
                            isCurrentProject 
                              ? 'bg-white/[0.08]' 
                              : 'hover:bg-white/[0.05]'
                          }`}
                        >
                          {isRenaming ? (
                            <div className="flex-1 flex items-center gap-2 px-3 py-1.5 min-w-0">
                              <AudioLines 
                                size={16} 
                                className="shrink-0 text-white/60"
                                strokeWidth={1.5}
                              />
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && renameValue.trim()) {
                                    // TODO: Implement rename in db service
                                    setRenamingId(null);
                                  }
                                  if (e.key === 'Escape') {
                                    setRenamingId(null);
                                  }
                                }}
                                onBlur={() => setRenamingId(null)}
                                autoFocus
                                className="flex-1 bg-transparent border border-white/20 rounded px-2 py-1 text-[13px] text-white focus:outline-none focus:border-white/40"
                              />
                            </div>
                          ) : (
                            <button 
                              onClick={() => loadFromLibrary(item)}
                              className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0"
                            >
                              <AudioLines 
                                size={16} 
                                className={`shrink-0 ${isCurrentProject ? 'text-white/60' : 'text-white/50'}`}
                                strokeWidth={1.5}
                              />
                              <span className={`flex-1 text-[13px] truncate transition-colors ${
                                isCurrentProject 
                                  ? 'text-white' 
                                  : 'text-white/70 group-hover:text-white'
                              }`}>
                                {item.data.title}
                              </span>
                            </button>
                          )}
                            
                          {!isRenaming && (
                            <div className="relative shrink-0">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(activeMenuId === item.id ? null : item.id);
                                }}
                                className={`p-1.5 mr-1 rounded transition-all ${
                                  activeMenuId === item.id 
                                    ? 'text-white/60 bg-white/[0.08]' 
                                    : 'text-transparent group-hover:text-white/40 hover:!text-white/60 hover:!bg-white/[0.08]'
                                }`}
                                title="More options"
                              >
                                <MoreHorizontal size={16} />
                              </button>

                              {activeMenuId === item.id && (
                                <div className="absolute right-0 top-full mt-1 w-36 bg-[#202020] border border-white/10 rounded-lg shadow-xl shadow-black/40 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      setRenamingId(item.id);
                                      setRenameValue(item.data.title);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                                  >
                                    <Pencil size={14} />
                                    Rename
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveMenuId(null);
                                      setDeleteConfirmId(item.id);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-400/80 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content Area - Script Editor */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {state === AppState.ERROR ? (
              /* Error View */
              <div className="flex-1 flex flex-col justify-center text-center space-y-6 px-8 animate-in fade-in zoom-in-95 duration-700 ease-out">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
                  <ShieldAlert size={24} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black uppercase tracking-widest text-red-400">Sequence Aborted</h2>
                  <p className="text-white/40 text-sm max-w-sm mx-auto">{error}</p>
                </div>
                <button 
                  onClick={reset}
                  className="px-8 py-3 rounded-full bg-white text-black text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all mx-auto"
                >
                  Re-initialize Pipeline
                </button>
              </div>
            ) : (
              <ScriptEditor
                data={data}
                onGenerateAudio={handleGenerateAudio}
                onImproveScript={handleImproveScript}
                onBack={handleEditorBack}
                libraryCount={library.length}
                isImproving={isImproving}
                // Script generation props
                isGeneratingScript={isGeneratingScript}
                pipelineSteps={pipelineSteps.filter(s => s.id === 'fetch' || s.id === 'reason')}
                progressValues={progressValues}
                // Audio playback props
                isGeneratingAudio={isGeneratingAudio}
                audioReady={audioReady}
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                volume={volume}
                isMuted={isMuted}
                amplitude={amplitude}
                segmentTimings={segmentTimings}
                isSaved={isSaved}
                alreadySaved={alreadySaved}
                onTogglePlay={togglePlay}
                onSeek={seek}
                onVolumeChange={handleVolumeChange}
                onMuteToggle={handleMuteToggle}
                onSave={handleSaveToLibrary}
                onStopPlayback={handleStopPlayback}
                // Library for script switching
                library={library}
                onLoadFromLibrary={loadFromLibrary}
                onGenerateFromUrl={handleGenerate}
                audioBase64={currentAudioBase64}
                onDeleteLibraryItem={(id) => handleDeleteLibraryItem(id)}
                onClearEditor={clearEditor}
              />
            )}
          </main>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-150"
            onClick={() => setDeleteConfirmId(null)}
          />
          
          {/* Modal */}
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] animate-in zoom-in-95 fade-in duration-200">
            <div className="bg-[#202020] border border-white/10 rounded-xl shadow-2xl p-6 w-[320px]">
              <h3 className="text-white text-[15px] font-medium mb-2">Delete podcast?</h3>
              <p className="text-white/50 text-[12px] mb-6 leading-relaxed">
                This will permanently remove the podcast from your library. This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                  <button 
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
              >
                  Cancel
                  </button>
                      <button 
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-[12px] text-white bg-red-500/80 hover:bg-red-500 rounded-lg transition-colors"
                >
                  Delete
                      </button>
                    </div>
                </div>
            </div>
        </>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        .font-mono-regular {
          font-family: 'Onest', sans-serif;
          font-weight: 400;
        }
        @keyframes scan {
          from { top: 0; }
          to { top: 100%; }
        }
        .animate-scan {
          animation: scan 4s linear infinite;
        }
        .bg-scanlines {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0) 50%,
            rgba(255, 255, 255, 0.05) 60%,
            rgba(255, 255, 255, 0.05) 100%
          );
        }
        .mask-gradient-b {
          mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
        }
        .mask-gradient-t {
          mask-image: linear-gradient(to top, black 0%, black 60%, transparent 100%);
          -webkit-mask-image: linear-gradient(to top, black 0%, black 60%, transparent 100%);
        }
      `}</style>
    </div>
  );
};

export default App;
