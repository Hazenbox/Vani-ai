import React, { useState, useRef, useEffect } from 'react';
import { generateAudioVersion } from '../services/comparisonService';
import { ElevenLabsClient } from 'elevenlabs';
import { ScriptPart, SegmentTiming } from '../types';
import { decodeAudio, decodeAudioDataToBuffer } from '../services/geminiService';
import { 
  Play, Pause, Volume2, VolumeX, BarChart3, TrendingUp, TrendingDown,
  Music, Activity, Zap, Loader2, ArrowLeft, Download, FileJson
} from 'lucide-react';
import { toast } from 'sonner';

interface AudioAnalysisConfig {
  recommended_elevenlabs_settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
    output_format: string;
    model_id: string;
    pause_duration_seconds: number;
  };
  pitch_analysis?: {
    script_opening?: {
      start_pitch_hz: number;
      pitch_trajectory: string;
      energy_level: number;
    };
    script_closing?: {
      end_pitch_hz: number;
      pitch_trajectory: string;
      energy_level: number;
    };
    per_dialogue?: Array<{
      index: number;
      start_pitch_hz: number;
      end_pitch_hz: number;
      trajectory: string;
      pitch_range: number;
    }>;
  };
  emotion_analysis?: {
    emotion_segments?: Array<{
      index: number;
      emotion_type: string;
      intensity: number;
    }>;
    emotion_distribution?: {
      laughter?: number;
      excitement?: number;
      neutral?: number;
    };
  };
}

interface TestComparisonProps {
  onBack: () => void;
}

export const TestComparison: React.FC<TestComparisonProps> = ({ onBack }) => {
  const [script, setScript] = useState<ScriptPart[]>([]);
  const [analysisConfig, setAnalysisConfig] = useState<AudioAnalysisConfig | null>(null);
  const [versionA, setVersionA] = useState<{ audioBase64: string; settingsUsed: any[] } | null>(null);
  const [versionB, setVersionB] = useState<{ audioBase64: string; settingsUsed: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingVersion, setLoadingVersion] = useState<'A' | 'B' | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<'A' | 'B' | null>(null);
  
  const [isPlayingA, setIsPlayingA] = useState(false);
  const [isPlayingB, setIsPlayingB] = useState(false);
  const [currentTimeA, setCurrentTimeA] = useState(0);
  const [currentTimeB, setCurrentTimeB] = useState(0);
  const [durationA, setDurationA] = useState(0);
  const [durationB, setDurationB] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioContextRefA = useRef<AudioContext | null>(null);
  const audioContextRefB = useRef<AudioContext | null>(null);
  const sourceRefA = useRef<AudioBufferSourceNode | null>(null);
  const sourceRefB = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRefA = useRef<GainNode | null>(null);
  const gainNodeRefB = useRef<GainNode | null>(null);
  const currentBufferRefA = useRef<AudioBuffer | null>(null);
  const currentBufferRefB = useRef<AudioBuffer | null>(null);
  const startTimeRefA = useRef<number>(0);
  const startTimeRefB = useRef<number>(0);
  const offsetRefA = useRef<number>(0);
  const offsetRefB = useRef<number>(0);
  const animationFrameRefA = useRef<number | null>(null);
  const animationFrameRefB = useRef<number | null>(null);

  useEffect(() => {
    // Load default script and analysis config
    loadDefaultData();
    
    // Cleanup audio contexts on unmount
    return () => {
      if (audioContextRefA.current) {
        audioContextRefA.current.close();
      }
      if (audioContextRefB.current) {
        audioContextRefB.current.close();
      }
      if (animationFrameRefA.current) {
        cancelAnimationFrame(animationFrameRefA.current);
      }
      if (animationFrameRefB.current) {
        cancelAnimationFrame(animationFrameRefB.current);
      }
    };
  }, []);

  const loadDefaultData = async () => {
    try {
      // Try multiple paths for script
      const scriptPaths = [
        '/Script training/The_Mumbai_Indians_Story_script.md',
        './Script training/The_Mumbai_Indians_Story_script.md',
        '../Script training/The_Mumbai_Indians_Story_script.md'
      ];
      
      for (const scriptPath of scriptPaths) {
        try {
          const scriptResponse = await fetch(scriptPath);
          if (scriptResponse.ok) {
            const scriptText = await scriptResponse.text();
            const parsed = parseMarkdownScript(scriptText);
            setScript(parsed);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Try multiple paths for analysis config
      const analysisPaths = [
        '/Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json',
        './Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json',
        '../Script training/IPL__The_Billion_Dollar_Cricket_Festival_podcast_analysis.json'
      ];
      
      for (const analysisPath of analysisPaths) {
        try {
          const analysisResponse = await fetch(analysisPath);
          if (analysisResponse.ok) {
            const config = await analysisResponse.json();
            setAnalysisConfig(config);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!script.length) {
        toast.info('Script not found. You can still generate audio by providing a script manually.');
      }
      if (!analysisConfig) {
        toast.info('Analysis config not found. Version B will use default settings.');
      }
    } catch (error) {
      console.error('Error loading default data:', error);
      toast.error('Failed to load default script or analysis config. You can still generate audio manually.');
    }
  };

  const parseMarkdownScript = (content: string): ScriptPart[] => {
    const pattern = /\*\*(Rahul|Anjali)\*\*:\s*(.+?)(?=\n\*\*|\Z)/gs;
    const matches = Array.from(content.matchAll(pattern));
    return matches.map(([, speaker, text]) => ({
      speaker: speaker as 'Rahul' | 'Anjali',
      text: text.trim()
    }));
  };

  const handleGenerateVersion = async (version: 'A' | 'B') => {
    if (!script.length) {
      toast.error('Please load a script first');
      return;
    }

    setLoadingVersion(version);
    setLoading(true);

    try {
      const apiKey = import.meta.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        toast.error('ElevenLabs API key not found');
        return;
      }

      const elevenlabs = new ElevenLabsClient({ apiKey });
      const result = await generateAudioVersion(script, version, analysisConfig, elevenlabs);

      if (version === 'A') {
        setVersionA(result);
        await loadAudioBuffer(result.audioBase64, 'A');
      } else {
        setVersionB(result);
        await loadAudioBuffer(result.audioBase64, 'B');
      }

      toast.success(`Version ${version} generated successfully!`);
    } catch (error: any) {
      console.error(`Error generating version ${version}:`, error);
      toast.error(`Failed to generate version ${version}: ${error.message}`);
    } finally {
      setLoadingVersion(null);
      setLoading(false);
    }
  };

  const loadAudioBuffer = async (audioBase64: string, version: 'A' | 'B') => {
    try {
      const audioBytes = decodeAudio(audioBase64);
      const ctx = version === 'A' 
        ? (audioContextRefA.current || new AudioContext())
        : (audioContextRefB.current || new AudioContext());
      
      if (version === 'A') {
        audioContextRefA.current = ctx;
      } else {
        audioContextRefB.current = ctx;
      }

      const buffer = await decodeAudioDataToBuffer(audioBytes, ctx);
      
      if (version === 'A') {
        currentBufferRefA.current = buffer;
        setDurationA(buffer.duration);
      } else {
        currentBufferRefB.current = buffer;
        setDurationB(buffer.duration);
      }
    } catch (error) {
      console.error(`Error loading audio buffer for version ${version}:`, error);
    }
  };

  const togglePlay = (version: 'A' | 'B') => {
    if (version === 'A') {
      if (isPlayingA) {
        pauseAudio('A');
      } else {
        playAudio('A');
      }
    } else {
      if (isPlayingB) {
        pauseAudio('B');
      } else {
        playAudio('B');
      }
    }
  };

  const playAudio = (version: 'A' | 'B') => {
    const ctx = version === 'A' ? audioContextRefA.current : audioContextRefB.current;
    const buffer = version === 'A' ? currentBufferRefA.current : currentBufferRefB.current;
    const sourceRef = version === 'A' ? sourceRefA : sourceRefB;
    const gainNodeRef = version === 'A' ? gainNodeRefA : gainNodeRefB;
    const startTimeRef = version === 'A' ? startTimeRefA : startTimeRefB;
    const offsetRef = version === 'A' ? offsetRefA : offsetRefB;
    const setIsPlaying = version === 'A' ? setIsPlayingA : setIsPlayingB;
    const setCurrentTime = version === 'A' ? setCurrentTimeA : setCurrentTimeB;
    const animationFrameRef = version === 'A' ? animationFrameRefA : animationFrameRefB;

    if (!ctx || !buffer) return;

    // Stop existing source
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.value = isMuted ? 0 : volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceRef.current = source;
    gainNodeRef.current = gainNode;

    const currentOffset = offsetRef.current;
    source.start(0, currentOffset);
    
    startTimeRef.current = ctx.currentTime - currentOffset;
    setIsPlaying(true);

    const updateTime = () => {
      if (ctx && startTimeRef.current) {
        const elapsed = ctx.currentTime - startTimeRef.current;
        setCurrentTime(Math.min(elapsed, buffer.duration));
        
        if (elapsed < buffer.duration) {
          animationFrameRef.current = requestAnimationFrame(updateTime);
        } else {
          setIsPlaying(false);
          offsetRef.current = 0;
        }
      }
    };
    updateTime();
  };

  const pauseAudio = (version: 'A' | 'B') => {
    const sourceRef = version === 'A' ? sourceRefA : sourceRefB;
    const ctx = version === 'A' ? audioContextRefA.current : audioContextRefB.current;
    const offsetRef = version === 'A' ? offsetRefA : offsetRefB;
    const currentTime = version === 'A' ? currentTimeA : currentTimeB;
    const setIsPlaying = version === 'A' ? setIsPlayingA : setIsPlayingB;
    const animationFrameRef = version === 'A' ? animationFrameRefA : animationFrameRefB;

    if (sourceRef.current && ctx) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      offsetRef.current = currentTime;
      setIsPlaying(false);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadAudio = (version: 'A' | 'B') => {
    const audioBase64 = version === 'A' ? versionA?.audioBase64 : versionB?.audioBase64;
    if (!audioBase64) return;

    const audioBytes = decodeAudio(audioBase64);
    const blob = new Blob([audioBytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `version_${version.toLowerCase()}.mp3`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#0a0a0a] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-3xl font-bold">Audio Comparison Test</h1>
          </div>
        </div>

        {/* Script Info */}
        <div className="bg-white/5 rounded-2xl p-6 mb-6 border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-2">Test Script</h2>
              <p className="text-white/60">{script.length} dialogues loaded</p>
            </div>
            {analysisConfig && (
              <div className="text-right">
                <p className="text-sm text-white/40 mb-1">Analysis Config</p>
                <p className="text-sm font-mono text-white/80">Loaded</p>
              </div>
            )}
          </div>
        </div>

        {/* Version Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Version A */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold mb-1">Version A (Default)</h3>
                <p className="text-sm text-white/60">Flat settings - current behavior</p>
              </div>
              {versionA && (
                <button
                  onClick={() => downloadAudio('A')}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Download size={18} />
                </button>
              )}
            </div>

            {!versionA ? (
              <button
                onClick={() => handleGenerateVersion('A')}
                disabled={loading && loadingVersion !== 'A'}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && loadingVersion === 'A' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Music size={18} />
                    Generate Version A
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                {/* Audio Controls */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => togglePlay('A')}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    {isPlayingA ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                      <span>{formatTime(currentTimeA)}</span>
                      <span>{formatTime(durationA)}</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${(currentTimeA / durationA) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </div>

                {/* Metrics */}
                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <BarChart3 size={16} />
                    Settings Applied
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-white/60">Stability:</span>
                      <span className="ml-2 font-mono">0.35</span>
                    </div>
                    <div>
                      <span className="text-white/60">Style:</span>
                      <span className="ml-2 font-mono">0.55</span>
                    </div>
                    <div>
                      <span className="text-white/60">Similarity:</span>
                      <span className="ml-2 font-mono">0.75</span>
                    </div>
                    <div>
                      <span className="text-white/60">Duration:</span>
                      <span className="ml-2 font-mono">{formatTime(durationA)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Version B */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold mb-1">Version B (Analysis-Based)</h3>
                <p className="text-sm text-white/60">Dynamic settings with pitch variations</p>
              </div>
              {versionB && (
                <button
                  onClick={() => downloadAudio('B')}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Download size={18} />
                </button>
              )}
            </div>

            {!versionB ? (
              <button
                onClick={() => handleGenerateVersion('B')}
                disabled={loading && loadingVersion !== 'B' || !analysisConfig}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && loadingVersion === 'B' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Generate Version B
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                {/* Audio Controls */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => togglePlay('B')}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    {isPlayingB ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                      <span>{formatTime(currentTimeB)}</span>
                      <span>{formatTime(durationB)}</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all"
                        style={{ width: `${(currentTimeB / durationB) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </div>

                {/* Metrics */}
                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Activity size={16} />
                    Dynamic Settings Applied
                  </h4>
                  {versionB.settingsUsed.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-white/60 mb-2">
                        First dialogue: Stability {versionB.settingsUsed[0].settings.stability.toFixed(2)}, 
                        Style {versionB.settingsUsed[0].settings.style.toFixed(2)}
                      </div>
                      {analysisConfig?.pitch_analysis?.script_opening && (
                        <div className="flex items-center gap-2 text-xs">
                          <TrendingUp size={12} className="text-green-400" />
                          <span className="text-white/80">
                            Opening: {analysisConfig.pitch_analysis.script_opening.pitch_trajectory} 
                            ({analysisConfig.pitch_analysis.script_opening.start_pitch_hz.toFixed(1)} Hz)
                          </span>
                        </div>
                      )}
                      {analysisConfig?.pitch_analysis?.script_closing && (
                        <div className="flex items-center gap-2 text-xs">
                          <TrendingDown size={12} className="text-red-400" />
                          <span className="text-white/80">
                            Closing: {analysisConfig.pitch_analysis.script_closing.pitch_trajectory} 
                            ({analysisConfig.pitch_analysis.script_closing.end_pitch_hz.toFixed(1)} Hz)
                          </span>
                        </div>
                      )}
                      {analysisConfig?.emotion_analysis?.emotion_distribution && (
                        <div className="text-xs text-white/60 mt-2">
                          Emotions: {analysisConfig.emotion_analysis.emotion_distribution.laughter || 0} laughter, 
                          {analysisConfig.emotion_analysis.emotion_distribution.excitement || 0} excitement
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Metrics View */}
        {(versionA || versionB) && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FileJson size={20} />
              Detailed Metrics
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {versionA && (
                <div>
                  <h4 className="font-semibold mb-3 text-blue-400">Version A Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Total Dialogues:</span>
                      <span className="font-mono">{script.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Duration:</span>
                      <span className="font-mono">{formatTime(durationA)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Settings Applied:</span>
                      <span className="font-mono">Constant</span>
                    </div>
                  </div>
                </div>
              )}
              
              {versionB && analysisConfig && (
                <div>
                  <h4 className="font-semibold mb-3 text-purple-400">Version B Metrics</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Total Dialogues:</span>
                      <span className="font-mono">{script.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Duration:</span>
                      <span className="font-mono">{formatTime(durationB)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Pitch Variations:</span>
                      <span className="font-mono">
                        {analysisConfig.pitch_analysis?.per_dialogue?.length || 0} segments
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Emotion Segments:</span>
                      <span className="font-mono">
                        {analysisConfig.emotion_analysis?.emotion_segments?.length || 0}
                      </span>
                    </div>
                    {versionA && (
                      <div className="flex justify-between pt-2 border-t border-white/10">
                        <span className="text-white/60">Duration Diff:</span>
                        <span className={`font-mono ${durationB > durationA ? 'text-green-400' : 'text-red-400'}`}>
                          {durationB > durationA ? '+' : ''}{(durationB - durationA).toFixed(2)}s
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
