import React, { useRef, useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import { Button } from "@/components/ui/button";
import { AgapitaLogo } from '../components/AgapitaLogo';
import { Point, PDollarPlusRecognizer } from '../../algorithm/pdollarplus';
import { shouldUseSiglipFallback } from '../lib/sketchRouting';
import {
  Eraser,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  LogOut,
  MousePointer2,
  Image as ImageIcon,
  Settings,
  Trash2,
  PlusCircle,
  Droplets,
  UserCircle,
  Tv,
  Stethoscope,
  Utensils,
  Wind,
  Moon,
  Accessibility,
  Home,
  Maximize,
  Minimize,
  Volume2,
  Activity,
  ChevronRight,
  Undo2,
  X
} from 'lucide-react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';

interface PatientDashboardProps {
  user: { username: string; token: string };
  onLogout: () => void;
}

type Mode = 'sketch' | 'processing' | 'confirming' | 'result' | 'records' | 'configure' | 'environment';

const ICON_MAP: Record<string, any> = {
  'WATER': Droplets,
  'DRINK': Droplets,
  'NURSE': UserCircle,
  'MEDICINE': Stethoscope,
  'PILLS': Stethoscope,
  'TV': Tv,
  'TELEVISION': Tv,
  'FOOD': Utensils,
  'EAT': Utensils,
  'WINDOW': Wind,
  'BATHROOM': Accessibility,
  'TOILET': Accessibility,
  'SLEEP': Moon,
  'LIGHTS': Moon,
};

const getIconForTag = (tag: string) => {
  const normalized = tag?.toUpperCase().trim() || '';
  return ICON_MAP[normalized] || AlertCircle;
};

interface StoryboardFrame {
  image: string;        // Base64 PNG data URL
  tag: string | null;   // VLM-resolved tag (null = still processing)
  isProcessing: boolean;
}

interface TelemetryData {
  model: string;
  startTime: number | null;
  pipelineTime: number | null;
  ttsTime: number | null;
  altTime: number | null;
  tag?: string;
}

const TelemetryHUD: React.FC<{ telemetry: TelemetryData }> = ({ telemetry }) => {
  const [liveTime, setLiveTime] = useState<number>(0);

  useEffect(() => {
    if (telemetry.startTime !== null && telemetry.pipelineTime === null) {
      let animationFrameId: number;
      const updateTime = () => {
        setLiveTime((performance.now() - telemetry.startTime!) / 1000);
        animationFrameId = requestAnimationFrame(updateTime);
      };
      animationFrameId = requestAnimationFrame(updateTime);
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [telemetry.startTime, telemetry.pipelineTime]);

  const displayPipelineTime = telemetry.pipelineTime !== null
    ? (telemetry.pipelineTime + (telemetry.ttsTime || 0))
    : liveTime;

  return (
    <div className="absolute top-20 left-6 z-50 pointer-events-none flex flex-col items-start gap-2 animate-in fade-in slide-in-from-left-4 duration-500">
      <div className="bg-zinc-950/80 backdrop-blur-md border border-zinc-800/50 shadow-2xl rounded-2xl p-4 text-left min-w-[220px]">
        <div className="flex items-center justify-start gap-2 mb-3">
          <div className={`z-[999] w-2 h-2 rounded-full ${telemetry.pipelineTime === null ? 'bg-amber-500' : 'bg-green-500'} animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]`}></div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
            {telemetry.pipelineTime === null ? 'Processing...' : 'Telemetry Live'}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Model</span>
            <span className="text-xs text-brand-300 font-mono bg-brand-900/30 px-2 py-0.5 rounded-md">{telemetry.model}</span>
          </div>
          <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Pipeline</span>
            <span className="text-sm text-zinc-200 font-mono font-medium">
              {displayPipelineTime.toFixed(2)}s
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Alternatives</span>
            <span className="text-sm text-zinc-200 font-mono font-medium">
              {telemetry.altTime ? telemetry.altTime.toFixed(2) + 's' : (telemetry.pipelineTime === null ? '--' : 'Loading...')}
            </span>
          </div>
          {telemetry.tag && (
            <div className="flex justify-between items-center border-t border-zinc-800/50 pt-2 mt-2">
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Tag</span>
              <span className="text-sm text-brand-300 font-mono bg-brand-900/30 px-2 py-0.5 rounded-md truncate max-w-[120px]">{telemetry.tag}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const cropCanvasToBoundingBox = (canvas: HTMLCanvasElement): string | null => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const padding = 20;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;

  const tempCanvas = document.createElement('canvas');
  // Match SigLIP2 native resolution (384x384) to skip PyTorch upscaling overhead
  const targetSize = 384;
  tempCanvas.width = targetSize;
  tempCanvas.height = targetSize;

  const tempCtx = tempCanvas.getContext('2d');
  if (tempCtx) {
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, targetSize, targetSize);

    const scale = Math.min(targetSize / croppedWidth, targetSize / croppedHeight);
    const drawWidth = croppedWidth * scale;
    const drawHeight = croppedHeight * scale;
    const offsetX = (targetSize - drawWidth) / 2;
    const offsetY = (targetSize - drawHeight) / 2;

    tempCtx.drawImage(canvas, minX, minY, croppedWidth, croppedHeight, offsetX, offsetY, drawWidth, drawHeight);
    return tempCanvas.toDataURL('image/png');
  }

  return null;
};

const PatientDashboard: React.FC<PatientDashboardProps> = ({ user, onLogout }) => {
  const [mode, setMode] = useState<Mode>('sketch');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isIdle, setIsIdle] = useState(true);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [showAnimation, setShowAnimation] = useState(true);
  const [options, setOptions] = useState<string[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [intent, setIntent] = useState<string | null>(null);
  const [streamedText, setStreamedText] = useState<string>('');
  const [streamedWords, setStreamedWords] = useState<string[]>([]);
  const [displayedWordCount, setDisplayedWordCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [patientRecords, setPatientRecords] = useState<string[]>([]);
  const [originalSketch, setOriginalSketch] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);

  const recognizerRef = useRef(new PDollarPlusRecognizer());
  const pointsRef = useRef<Point[]>([]);
  const currentStrokeId = useRef(0);

  useEffect(() => {
    let textToDisplay = streamedText;
    if (streamedText.trimStart().startsWith('{')) {
      const match = streamedText.match(/"intent"\s*:\s*"([^"]*)/);
      textToDisplay = match ? match[1] : '';
    }
    const words = textToDisplay.split(/\s+/).filter(Boolean);
    setStreamedWords(words);
  }, [streamedText]);

  useEffect(() => {
    if (displayedWordCount < streamedWords.length) {
      const timer = setTimeout(() => {
        setDisplayedWordCount(prev => prev + 1);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [streamedWords.length, displayedWordCount]);

  useEffect(() => {
    if (intent && streamedWords.length === 0) {
      const words = intent.split(/\s+/).filter(Boolean);
      setStreamedWords(words);
      setDisplayedWordCount(words.length);
    } else if (intent && displayedWordCount === streamedWords.length) {
      const words = intent.split(/\s+/).filter(Boolean);
      setStreamedWords(words);
      setDisplayedWordCount(words.length);
    }
  }, [intent, streamedWords.length, displayedWordCount]);

  // ── Multi-Sketch Storyboard State ────────────────────────────────────────
  const [storyboard, setStoryboard] = useState<StoryboardFrame[]>([]);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoAdvance');
    return saved === 'true';
  });
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyboardRequestIdRef = useRef<number>(0);

  useEffect(() => {
    localStorage.setItem('autoAdvance', autoAdvance.toString());
  }, [autoAdvance]);
  // ─────────────────────────────────────────────────────────────────────────

  const [showTelemetry, setShowTelemetry] = useState<boolean>(() => {
    const saved = localStorage.getItem('showTelemetry');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('showTelemetry', showTelemetry.toString());
  }, [showTelemetry]);

  // Predictive background fetching states
  const siglipDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRequestIdRef = useRef<number | null>(null);
  const hasEverDrawnRef = useRef<boolean>(false);
  const [backgroundResult, setBackgroundResult] = useState<{
    intent: string;
    options: string[];
    original_sketch: string;
    isRawTag?: boolean;
  } | null>(null);
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const preloadedAudioRef = useRef<HTMLAudioElement | null>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isLandscape, setIsLandscape] = useState(
    window.innerWidth > window.innerHeight && window.innerWidth < 1024
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      const w = window.innerWidth;
      const h = window.innerHeight;

      setIsMobile(w < 1024);
      setIsLandscape(w > h && w < 1024);
    };
    const handleFsChange = () => {
      const doc = window.document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement));
    };
    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const doc = window.document as any;
    const docEl = doc.documentElement;
    const requestFullScreen = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    const cancelFullScreen = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;

    if (!isFullscreen) {
      if (requestFullScreen) {
        const promise = requestFullScreen.call(docEl);
        if (promise && promise.catch) promise.catch(() => { });
      } else {
        setIsFullscreen(true); // Fallback for iOS Safari
      }
    } else {
      if (cancelFullScreen) {
        cancelFullScreen.call(doc);
      } else {
        setIsFullscreen(false); // Fallback for iOS Safari
      }
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Configure panel state
  const [newEntry, setNewEntry] = useState('');
  const [configRecords, setConfigRecords] = useState<{ id: number; content: string }[]>([]);
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [activeVlm, setActiveVlm] = useState('llava');
  const [thinkMode, setThinkMode] = useState(false);
  const [vlmStatus, setVlmStatus] = useState<'idle' | 'saved'>('idle');
  const [ttsMode, setTtsMode] = useState<'none' | 'web_speech' | 'kokoro'>(() => {
    const saved = localStorage.getItem('ttsMode');
    return (saved as any) || 'web_speech';
  });

  const lastSpokenRef = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem('ttsMode', ttsMode);
  }, [ttsMode]);

  const playSpeech = (text: string) => {
    if (ttsMode === 'none') return;
    if (ttsMode === 'web_speech') {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } else if (ttsMode === 'kokoro') {
      try {
        const audioUrl = `${SERVER_URL}/api/patient/tts?text=${encodeURIComponent(text)}`;
        if (preloadedAudioRef.current && preloadedAudioRef.current.src === audioUrl) {
          preloadedAudioRef.current.play().catch(e => console.error("Error playing preloaded Kokoro audio:", e));
        } else {
          const audio = new Audio(audioUrl);
          audio.play().catch(e => console.error("Error playing Kokoro audio:", e));
        }
      } catch (err) {
        console.error("Failed to play Kokoro TTS:", err);
      }
    }
  };

  useEffect(() => {
    if (mode === 'confirming' && intent) {
      if (lastSpokenRef.current !== intent) {
        lastSpokenRef.current = intent;
        const t = setTimeout(() => {
          playSpeech(intent);
        }, 300);
        return () => clearTimeout(t);
      }
    } else if (mode !== 'confirming') {
      lastSpokenRef.current = null;
      if (ttsMode === 'web_speech') {
        window.speechSynthesis.cancel();
      }
    }
  }, [mode, intent, ttsMode]);

  const [mockTime, setMockTime] = useState('');
  const [useRealTime, setUseRealTime] = useState(true);

  const loadActiveVlm = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/config/models`);
      if (res.ok) {
        const data = await res.json();
        setActiveVlm(data.vlm_model || 'llava');
        setThinkMode(data.think_mode || false);
        if (data.mock_time) {
          setMockTime(data.mock_time);
          setUseRealTime(false);
        } else {
          setUseRealTime(true);
        }
      }
    } catch { }
  }, []);

  const handleUpdateVlm = async (newVlm: string) => {
    setActiveVlm(newVlm);
    try {
      await fetch(`${SERVER_URL}/api/admin/config/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlm_model: newVlm })
      });
    } catch { }
  };

  const handleUpdateTime = async (time: string, isReal: boolean) => {
    try {
      await fetch(`${SERVER_URL}/api/admin/config/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mock_time: time, use_real_time: isReal })
      });
    } catch { }
  };

  useEffect(() => {
    loadActiveVlm();
  }, [loadActiveVlm]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    socketRef.current = io(SERVER_URL, {
      auth: { token: user.token }
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      socketRef.current.emit('request_records', {});
    });

    socketRef.current.on('connect_error', (err: any) => {
      console.error('Socket connection error:', err);
      onLogout();
    });

    socketRef.current.on('stream_chunk', (data: any) => {
      setStreamedText(prev => prev + data.chunk);
    });

    socketRef.current.on('interpretation_received', (data: any) => {
      setIntent(data.intent);
      setOptions(data.options || []);
      setIsLoadingOptions(!data.options || data.options.length === 0);
      setOriginalSketch(data.original_sketch);
      setMode('confirming');

      const tel = data.telemetry;
      if (tel) {
        setTelemetry(prev => ({
          model: tel.model,
          startTime: prev?.startTime || performance.now(),
          pipelineTime: tel.pipeline_time_s,
          ttsTime: null,
          altTime: prev?.altTime || null
        }));
      }

      if (data.intent && localStorage.getItem('ttsMode') === 'kokoro') {
        const audioUrl = `${SERVER_URL}/api/patient/tts?text=${encodeURIComponent(data.intent)}`;
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';
        const ttsStart = performance.now();
        audio.addEventListener('canplaythrough', () => {
          const ttsLoad = (performance.now() - ttsStart) / 1000;
          setTelemetry(prev => prev ? { ...prev, ttsTime: ttsLoad } : prev);
        });
        audio.load();
        preloadedAudioRef.current = audio;
      } else {
        setTelemetry(prev => prev ? { ...prev, ttsTime: 0 } : prev);
      }
    });

    socketRef.current.on('background_interpretation_received', (data: any) => {
      if (currentRequestIdRef.current !== data.request_id) {
        return; // Ignore stale responses from previous strokes
      }
      setIsBackgroundProcessing(false);
      setBackgroundResult({
        intent: data.intent,
        options: data.options || [],
        original_sketch: data.original_sketch
      });
      setIsLoadingOptions(!data.options || data.options.length === 0);

      const tel = data.telemetry;
      if (tel) {
        setTelemetry(prev => ({
          model: tel.model,
          startTime: prev?.startTime || performance.now(),
          pipelineTime: tel.pipeline_time_s,
          ttsTime: null,
          altTime: prev?.altTime || null
        }));
      }

      // Preload TTS in the background
      if (data.intent && localStorage.getItem('ttsMode') === 'kokoro') {
        const audioUrl = `${SERVER_URL}/api/patient/tts?text=${encodeURIComponent(data.intent)}`;
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';
        const ttsStart = performance.now();
        audio.addEventListener('canplaythrough', () => {
          const ttsLoad = (performance.now() - ttsStart) / 1000;
          setTelemetry(prev => prev ? { ...prev, ttsTime: ttsLoad } : prev);
        });
        audio.load();
        preloadedAudioRef.current = audio;
      } else {
        setTelemetry(prev => prev ? { ...prev, ttsTime: 0 } : prev);
      }

      setMode(currentMode => {
        if (currentMode === 'processing') {
          // User already clicked submit, transition instantly
          setIntent(data.intent);
          setOptions(data.options || []);
          setOriginalSketch(data.original_sketch);
          setIsLoadingOptions(!data.options || data.options.length === 0);
          return 'confirming';
        }
        return currentMode;
      });
    });

    socketRef.current.on('interpretation_dispatched', (data: any) => {
      setIntent(data.intent);
      setMode('result');
    });

    socketRef.current.on('options_received', (data: any) => {
      setOptions(data.options);
      setIsLoadingOptions(false);
      setBackgroundResult(prev => prev ? { ...prev, options: data.options } : null);
      if (data.telemetry && data.telemetry.alt_time_s !== undefined) {
        setTelemetry(prev => prev ? { ...prev, altTime: data.telemetry.alt_time_s } : prev);
      }
    });

    socketRef.current.on('records_update', (data: any) => {
      setPatientRecords(data.records);
    });

    socketRef.current.on('background_error', (data: any) => {
      setIsBackgroundProcessing(false);
      setError(data.message);
      setMode('sketch');
    });

    // ── Storyboard per-frame VLM responses ──────────────────────────────
    socketRef.current.on('frame_interpreted', (data: any) => {
      const { tag, frame_index } = data;
      setStoryboard(prev => prev.map((frame, i) =>
        i === frame_index ? { ...frame, tag, isProcessing: false } : frame
      ));
    });

    socketRef.current.on('frame_error', (data: any) => {
      const { frame_index } = data;
      setStoryboard(prev => prev.map((frame, i) =>
        i === frame_index ? { ...frame, tag: 'unknown', isProcessing: false } : frame
      ));
    });
    // ────────────────────────────────────────────────────────────────────

    socketRef.current.on('error', (data: any) => {
      setError(data.message);
      setMode('sketch');
      if (data.message && (data.message.includes('Unauthorized') || data.message.includes('token') || data.message.includes('expired'))) {
        onLogout();
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [user.token, onLogout]);

  // ── Configure Panel API calls ─────────────────────────────────────────────
  const loadConfigRecords = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/patient/records`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        setConfigRecords(await res.json());
      } else if (res.status === 401 || res.status === 403) {
        onLogout();
      }
    } catch { }
  }, [user.token, onLogout]);

  const handleSaveRecord = async () => {
    if (!newEntry.trim()) return;
    setConfigStatus('saving');
    try {
      const contentToSave = mode === 'environment' ? `[Room Environment] ${newEntry.trim()}` : newEntry.trim();
      const res = await fetch(`${SERVER_URL}/api/patient/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ content: contentToSave })
      });
      if (res.ok) {
        setNewEntry('');
        setConfigStatus('saved');
        await loadConfigRecords();
        setTimeout(() => setConfigStatus('idle'), 2000);
      } else {
        if (res.status === 401 || res.status === 403) {
          onLogout();
        }
        setConfigStatus('error');
      }
    } catch {
      setConfigStatus('error');
    }
  };

  const handleDeleteRecord = async (id: number) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/patient/records/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        await loadConfigRecords();
      } else if (res.status === 401 || res.status === 403) {
        onLogout();
      }
    } catch { }
  };

  useEffect(() => {
    if (mode === 'configure' || mode === 'environment') loadConfigRecords();
  }, [mode, loadConfigRecords]);
  // ─────────────────────────────────────────────────────────────────────────

  // Canvas Drawing Logic
  const resetDebounce = () => {
    if (siglipDebounceTimerRef.current) {
      clearTimeout(siglipDebounceTimerRef.current);
      siglipDebounceTimerRef.current = null;
    }
    if (uiDebounceTimerRef.current) {
      clearTimeout(uiDebounceTimerRef.current);
      uiDebounceTimerRef.current = null;
    }
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setBackgroundResult(null);
    setHasSubmitted(false);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    resetDebounce();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setIsIdle(false);

    currentStrokeId.current += 1;
    pointsRef.current.push(new Point(x, y, currentStrokeId.current));
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;

    if (!hasEverDrawnRef.current) {
      hasEverDrawnRef.current = true;
      setHasDrawn(true);
      setShowAnimation(false);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    resetDebounce();

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();

    pointsRef.current.push(new Point(x, y, currentStrokeId.current));
  };

  const handleBackgroundInterpret = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const pixelData = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
    const isBlank = !pixelData?.some(p => p !== 0);
    if (isBlank) return;

    const dataUrl = cropCanvasToBoundingBox(canvas);
    if (!dataUrl) return;

    setIsBackgroundProcessing(true);
    setTelemetry({
      model: `${activeVlm}${thinkMode ? ' + think' : ''}`,
      startTime: performance.now(),
      pipelineTime: null,
      ttsTime: null,
      altTime: null
    });

    const reqId = Date.now();
    currentRequestIdRef.current = reqId;

    socketRef.current.emit('process_sketch_background', {
      image: dataUrl,
      patient_id: user.username,
      request_id: reqId
    });
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (siglipDebounceTimerRef.current) clearTimeout(siglipDebounceTimerRef.current);

    let pdollarScore: number | null = null;
    if (pointsRef.current.length > 0) {
      // P-Dollar Plus is synchronous and intentionally has zero debounce.
      const result = recognizerRef.current.Recognize(pointsRef.current);
      pdollarScore = result.Score;
      if (!shouldUseSiglipFallback(pdollarScore)) {
        currentRequestIdRef.current = null; // Invalidate any stale SigLIP responses
        setIsBackgroundProcessing(false);
        const canvas = canvasRef.current;
        const dataUrl = canvas ? cropCanvasToBoundingBox(canvas) : null;
        setBackgroundResult({
          intent: result.Name,
          options: [],
          original_sketch: dataUrl || '',
          isRawTag: true
        });
        setTelemetry({
          model: `$P+ Local`,
          startTime: performance.now(),
          pipelineTime: 0,
          ttsTime: 0,
          altTime: 0,
          tag: result.Name
        });
      }
    }

    if (shouldUseSiglipFallback(pdollarScore) && hasEverDrawnRef.current) {
      siglipDebounceTimerRef.current = setTimeout(() => {
        handleBackgroundInterpret();
      }, 1500); // 1.5s debounce for SigLIP
    }

    if (uiDebounceTimerRef.current) clearTimeout(uiDebounceTimerRef.current);
    uiDebounceTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 100); // Quick 100ms debounce for UI animation

    // Auto-advance: if enabled and we have drawn, start auto-capture timer
    if (autoAdvance && hasEverDrawnRef.current && storyboard.length < 4) {
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = setTimeout(() => {
        captureFrameToStoryboard();
      }, 1500);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    pointsRef.current = [];
    currentStrokeId.current = 0;
    hasEverDrawnRef.current = false;
    resetDebounce();
    setIsIdle(true);
    setHasDrawn(false);
    setMode('sketch');
    setError(null);
    setIntent(null);
    setStreamedText('');
    setStreamedWords([]);
    setDisplayedWordCount(0);
    setOptions([]);
    setIsLoadingOptions(false);
    setOriginalSketch(null);
    preloadedAudioRef.current = null;
    setStoryboard([]);
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  };

  // ── Storyboard: Capture current canvas as a new frame ──────────────────
  const captureFrameToStoryboard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const isBlank = !hasEverDrawnRef.current;
    if (isBlank) return;

    const ctx = canvas.getContext('2d');
    if (storyboard.length >= 4) {
      setError('Maximum 4 frames reached. Submit or clear to continue.');
      return;
    }

    const dataUrl = cropCanvasToBoundingBox(canvas);
    if (!dataUrl) return;

    const frameIndex = storyboard.length;
    const reqId = Date.now();
    storyboardRequestIdRef.current = reqId;

    let pPlusTag = null;
    if (pointsRef.current.length > 0) {
      const result = recognizerRef.current.Recognize(pointsRef.current);
      if (result.Score >= 0.2) {
        pPlusTag = result.Name;
      }
    }

    if (pPlusTag) {
      setStoryboard(prev => [...prev, { image: dataUrl, tag: pPlusTag, isProcessing: false }]);
    } else {
      // Add frame to storyboard
      setStoryboard(prev => [...prev, { image: dataUrl, tag: null, isProcessing: true }]);

      // Fire eager per-frame VLM interpretation
      socketRef.current.emit('process_frame', {
        image: dataUrl,
        frame_index: frameIndex,
        request_id: reqId
      });
    }

    // Clear canvas for next drawing
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    pointsRef.current = [];
    currentStrokeId.current = 0;
    hasEverDrawnRef.current = false;
    setHasDrawn(false);
    setShowAnimation(false);
    setIsIdle(true);
    resetDebounce();
    setBackgroundResult(null);
  };

  const handleUndoLastFrame = () => {
    if (storyboard.length === 0) return;

    const lastFrame = storyboard[storyboard.length - 1];
    setStoryboard(prev => prev.slice(0, -1));

    // Restore the last frame's image onto the active canvas
    const canvas = canvasRef.current;
    if (canvas && lastFrame.image) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          hasEverDrawnRef.current = true;
          setHasDrawn(true);
        };
        img.src = lastFrame.image;
      }
    }
  };

  const handleRemoveFrame = (index: number) => {
    setStoryboard(prev => prev.filter((_, i) => i !== index));
  };
  // ─────────────────────────────────────────────────────────────────────────

  const handleInterpret = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cancel any pending auto-advance or background debounce timers
    resetDebounce();

    // Check if canvas is blank using the reliable ref
    const isBlank = !hasEverDrawnRef.current;

    // If both storyboard is empty AND canvas is blank, throw error immediately
    if (storyboard.length === 0 && isBlank) {
      setError("Please draw something first");
      return;
    }

    // ── MULTI-SKETCH STORYBOARD SUBMIT ──────────────────────────────────
    if (storyboard.length > 0) {

      // Include current canvas as final frame if it's not blank
      let finalStoryboard = [...storyboard];
      if (!isBlank) {
        const currentDataUrl = cropCanvasToBoundingBox(canvas) || canvas.toDataURL();
        const frameIndex = finalStoryboard.length;
        const reqId = Date.now();

        // Add as processing frame and fire VLM for it
        finalStoryboard.push({ image: currentDataUrl, tag: null, isProcessing: true });
        setStoryboard(prev => [...prev, { image: currentDataUrl, tag: null, isProcessing: true }]);

        socketRef.current.emit('process_frame', {
          image: currentDataUrl,
          frame_index: frameIndex,
          request_id: reqId
        });
      }

      // Wait for all frames to have tags resolved
      const unresolvedFrames = finalStoryboard.filter(f => f.isProcessing);
      if (unresolvedFrames.length > 0) {
        // Some frames still processing — show processing state and wait
        setMode('confirming');
        setStreamedText('');
        setStreamedWords([]);
        setDisplayedWordCount(0);
        setTelemetry({
          model: `${activeVlm}${thinkMode ? ' + think' : ''}`,
          startTime: performance.now(),
          pipelineTime: null,
          ttsTime: null,
          altTime: null
        });
        // Poll until all frames resolved, then re-trigger
        const checkInterval = setInterval(() => {
          setStoryboard(currentSb => {
            const stillProcessing = currentSb.some(f => f.isProcessing);
            if (!stillProcessing) {
              clearInterval(checkInterval);
              // All resolved — fire storyboard submission
              const tags = currentSb.map(f => f.tag || 'unknown');
              const images = currentSb.map(f => f.image);
              socketRef.current.emit('process_storyboard', {
                tags,
                images,
                patient_id: user.username
              });
            }
            return currentSb;
          });
        }, 200);
        return;
      }

      // All tags already resolved — submit immediately
      const tags = finalStoryboard.map(f => f.tag || 'unknown');
      const images = finalStoryboard.map(f => f.image);

      setMode('confirming');
      setStreamedText('');
      setStreamedWords([]);
      setDisplayedWordCount(0);
      setTelemetry({
        model: `${activeVlm}${thinkMode ? ' + think' : ''}`,
        startTime: performance.now(),
        pipelineTime: null,
        ttsTime: null,
        altTime: null
      });

      socketRef.current.emit('process_storyboard', {
        tags,
        images,
        patient_id: user.username
      });
      return;
    }
    // ── END MULTI-SKETCH ────────────────────────────────────────────────

    // ── SINGLE-SKETCH (original behavior) ──────────────────────────────

    if (backgroundResult) {
      if (backgroundResult.isRawTag) {
        setMode('processing');
        setStreamedText('');
        setStreamedWords([]);
        setTelemetry({
          model: `${activeVlm}${thinkMode ? ' + think' : ''}`,
          startTime: performance.now(),
          pipelineTime: null,
          ttsTime: null,
          altTime: null
        });
        socketRef.current.emit('pinpoint_selection', {
          tag: backgroundResult.intent,
          patient_id: user.username,
          original_sketch: backgroundResult.original_sketch
        });
        return;
      }

      // Magic zero-latency illusion for fully expanded SigLIP responses
      setIntent(backgroundResult.intent);
      setOptions(backgroundResult.options || []);
      setIsLoadingOptions(!backgroundResult.options || backgroundResult.options.length === 0);
      setOriginalSketch(backgroundResult.original_sketch);
      setMode('confirming');
      return;
    }

    const dataUrl = cropCanvasToBoundingBox(canvas) || canvas.toDataURL();

    if (pointsRef.current.length > 0) {
      const result = recognizerRef.current.Recognize(pointsRef.current);
      if (result.Score >= 0.2) {
        setMode('processing');
        setStreamedText('');
        setStreamedWords([]);
        setTelemetry({
          model: `${activeVlm}${thinkMode ? ' + think' : ''}`,
          startTime: performance.now(),
          pipelineTime: null,
          ttsTime: null,
          altTime: null
        });
        socketRef.current.emit('pinpoint_selection', {
          tag: result.Name,
          patient_id: user.username,
          original_sketch: dataUrl
        });
        return;
      }
    }

    setMode('confirming');
    setStreamedText('');
    setStreamedWords([]);
    setDisplayedWordCount(0);
    setTelemetry({
      model: `${activeVlm}${thinkMode ? ' + think' : ''}`,
      startTime: performance.now(),
      pipelineTime: null,
      ttsTime: null,
      altTime: null
    });

    if (isBackgroundProcessing) {
      // Background task is running, wait for the socket event
      setHasSubmitted(true);
      return;
    }


    setOriginalSketch(dataUrl);
    socketRef.current.emit('process_sketch', {
      image: dataUrl,
      patient_id: user.username
    });
  };

  const handleSelectOption = (tag: string) => {
    setMode('processing');
    socketRef.current.emit('pinpoint_selection', {
      tag,
      patient_id: user.username,
      original_sketch: originalSketch
    });
  };

  const handleSendInterpretation = () => {
    if (!intent) return;
    socketRef.current.emit('send_interpretation', {
      intent,
      patient_id: user.username,
      image: originalSketch
    });
  };

  const renderContent = () => {
    switch (mode) {
      case 'sketch':
        return (
          <div className="absolute inset-0 bg-white/50 dark:bg-black/20 canvas-dots">
            {/* ── Storyboard Thumbnail Strip ──────────────────────────── */}
            {storyboard.length > 0 && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-5 py-3 rounded-2xl shadow-xl border border-zinc-200/50 dark:border-zinc-800/50 animate-in fade-in slide-in-from-top-4 duration-500">
                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mr-2">Sentence</span>
                {storyboard.map((frame, idx) => (
                  <div key={idx} className="relative group animate-in fade-in slide-in-from-right-4 duration-300" style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className={`w-16 h-16 rounded-xl border-2 overflow-hidden bg-white dark:bg-zinc-950 shadow-sm transition-all ${frame.isProcessing ? 'border-amber-400 animate-pulse' : frame.tag === 'unknown' ? 'border-red-300' : 'border-brand-400'
                      }`}>
                      <img src={frame.image} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                    </div>
                    {/* Tag label */}
                    <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                      {frame.isProcessing ? (
                        <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                        </span>
                      ) : (
                        <span className={`text-[10px] font-bold ${frame.tag === 'unknown' ? 'text-red-400' : 'text-brand-600 dark:text-brand-400'}`}>
                          {frame.tag || '?'}
                        </span>
                      )}
                    </div>
                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveFrame(idx)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    {/* Connector arrow */}
                    {idx < storyboard.length - 1 && (
                      <div className="absolute top-1/2 -right-3 -translate-y-1/2 text-zinc-300 dark:text-zinc-600">
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                ))}
                {/* Show "+" indicator if room for more frames */}
                {storyboard.length < 4 && (
                  <div className="w-16 h-16 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <span className="text-xs font-bold">{storyboard.length + 1}</span>
                  </div>
                )}
              </div>
            )}
            {/* ── End Thumbnail Strip ─────────────────────────────────── */}

            <canvas
              ref={canvasRef}
              width={windowSize.width}
              height={windowSize.height}
              className="w-full h-full cursor-crosshair touch-none"
              onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={endDrawing} onMouseLeave={endDrawing}
              onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
              onTouchMove={(e) => { e.preventDefault(); draw(e); }}
              onTouchEnd={endDrawing}
            />

            {showAnimation && storyboard.length === 0 && (
              <>
                <div className="absolute inset-0 md:right-[25vw] lg:right-0 pointer-events-none flex flex-col items-center justify-center opacity-30 dark:opacity-20 transition-opacity duration-700 delay-100">
                  <svg className="w-[70vh] h-[70vh] max-w-[90vw]" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Star */}
                    <path
                      d="M100,20 L125,90 L200,90 L140,135 L160,200 L100,160 L40,200 L60,135 L0,90 L75,90 Z"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-0 animate-scribble-1 text-brand-500 dark:text-brand-400"
                      pathLength="100"
                      strokeDasharray="100"
                    />
                    {/* Stickman */}
                    <path
                      d="M50,180 L100,120 L150,180 L100,120 L100,60 L50,80 L100,60 L150,80 L100,60 A25,25 0 0,1 100,10 A25,25 0 0,1 100,60"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-0 animate-scribble-2 text-brand-500 dark:text-brand-400"
                      pathLength="100"
                      strokeDasharray="100"
                    />
                    {/* Circle */}
                    <path
                      d="M100,20 A80,80 0 1,1 99.9,20 Z"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-0 animate-scribble-3 text-brand-500 dark:text-brand-400"
                      pathLength="100"
                      strokeDasharray="100"
                    />
                  </svg>
                </div>
                <AgapitaLogo
                  className="absolute inset-0 md:right-[25vw] lg:right-0 m-auto opacity-0 animate-logo-fade w-full h-full md:w-[65%] md:h-[65%] lg:w-full lg:h-full object-contain p-12 drop-shadow-2xl pointer-events-none"
                />
              </>
            )}
            {error && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-medium shadow-sm z-50 animate-in fade-in slide-in-from-top-4" style={{ top: storyboard.length > 0 ? '6rem' : '1.5rem' }}>
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 'confirming':
        return (
          <div className="w-[80vw] h-full flex flex-col items-center justify-center p-6 md:p-12 z-10 relative">
            <div className="w-full text-center max-w-8xl mx-auto flex flex-col items-center">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-12">Does this look right?</h2>

              <div className="mb-16 flex flex-col items-center">
                <p className="text-sm font-bold text-brand-600 dark:text-brand-400 mb-3">Your message:</p>
                <div className="flex items-center justify-center gap-4">
                  <h1 className="text-5xl md:text-7xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight">
                    {displayedWordCount > 0 && "“"}
                    {streamedWords.slice(0, displayedWordCount).map((word, idx) => (
                      <span key={idx} className="animate-in fade-in duration-300">
                        {word}{idx < displayedWordCount - 1 ? " " : ""}
                      </span>
                    ))}
                    {displayedWordCount > 0 && "”"}
                    {(!intent || displayedWordCount < streamedWords.length) && (
                      <span className="inline-block w-3 h-10 md:h-12 ml-2 bg-brand-500 animate-pulse align-middle" />
                    )}
                  </h1>
                  {ttsMode !== 'none' && intent && displayedWordCount === streamedWords.length && (
                    <button
                      onClick={() => intent && playSpeech(intent)}
                      className="p-2 rounded-full text-brand-600 hover:bg-brand-100 dark:hover:bg-brand-900 transition-colors"
                      title="Replay speech"
                    >
                      <Volume2 className="w-8 h-8" />
                    </button>
                  )}
                </div>
              </div>

              {(options.length > 0 || isLoadingOptions) && (
                <p className="text-sm font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2 mt-4">Other options:</p>
              )}

              {isLoadingOptions ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 w-full max-w-7xl mt-8">
                  {/* First item is the image placeholder */}
                  <div className="aspect-square bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 rounded-[40px] flex items-center justify-center overflow-hidden p-4">
                    {originalSketch && (
                      <img
                        src={originalSketch}
                        alt="Cropped sketch"
                        className="w-full h-full object-contain rounded-3xl opacity-50"
                      />
                    )}
                  </div>
                  {[1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className="aspect-square bg-white/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 rounded-[40px] animate-pulse flex items-center justify-center p-8"
                    >
                      <div className="w-32 h-8 bg-zinc-200 dark:bg-zinc-800 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 w-full max-w-7xl mt-8 items-stretch">
                  {/* First item is the image */}
                  <div className="aspect-square bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[40px] shadow-sm flex items-center justify-center overflow-hidden p-6 animate-in fade-in slide-in-from-bottom-6">
                    {originalSketch && (
                      <img
                        src={originalSketch}
                        alt="Cropped sketch"
                        className="w-full h-full object-contain rounded-3xl bg-white"
                      />
                    )}
                  </div>
                  {options.slice(0, 3).map((option, idx) => (
                    <button
                      key={idx}
                      className="group aspect-square bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[40px] shadow-sm hover:border-brand-400 hover:bg-brand-50/80 dark:hover:bg-brand-900/30 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.95] active:shadow-inner transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col items-center justify-center p-8 text-center animate-in fade-in slide-in-from-bottom-6"
                      style={{ animationFillMode: 'both', animationDelay: `${(idx + 1) * 150}ms` }}
                      onClick={() => handleSelectOption(option)}
                    >
                      <span className="text-3xl md:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 capitalize leading-tight group-hover:text-brand-700 transition-colors">{option}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'result':
        return (
          <div className="w-full h-full flex items-center justify-center p-6 z-10 relative">
            <div className="bg-white dark:bg-zinc-900 p-12 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-2xl w-full text-center">
              <CheckCircle className="w-24 h-24 text-brand-500 mx-auto mb-6" />
              <h2 className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Message Dispatched</h2>
              <p className="text-xl text-zinc-500 dark:text-zinc-400 mb-8">Your caretaker has been notified with the following intent:</p>

              <div className="bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-900 p-6 rounded-2xl text-3xl font-bold text-brand-800 dark:text-brand-400 italic mb-10">
                "{intent}"
              </div>

              <Button size="lg" className="h-14 px-8 text-lg rounded-2xl bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900" onClick={() => { setMode('sketch'); clearCanvas(); }}>
                New Request
              </Button>
            </div>
          </div>
        );

      case 'records':
        return (
          <div className="w-full max-w-4xl mx-auto p-8 pt-12 z-10 relative h-full overflow-y-auto">
            <div className="mb-10 text-center">
              <h3 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Active Medical Context</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">Real-time monitor of assigned RAG records</p>
            </div>

            <div className="flex flex-col gap-4">
              {patientRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-zinc-400 gap-4 text-center">
                  <AlertCircle className="w-12 h-12 opacity-50" />
                  <p className="text-lg">No medical records are currently assigned to your profile.</p>
                </div>
              ) : (
                patientRecords.map((rec, i) => (
                  <div key={i} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-6">
                    <div className="w-1.5 h-10 bg-gradient-to-b from-brand-400 to-brand-600 rounded-full shrink-0" />
                    <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200 m-0 leading-relaxed">{rec}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case 'configure':
      case 'environment': {
        const isEnv = mode === 'environment';
        const displayRecords = isEnv
          ? configRecords.filter(r => r.content.startsWith('[Room Environment]'))
          : configRecords.filter(r => !r.content.startsWith('[Room Environment]'));

        return (
          <div className="w-full max-w-4xl mx-auto p-8 pt-12 z-10 relative h-full overflow-y-auto pb-32">
            <div className="mb-10 text-center">
              <h3 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">{isEnv ? 'Room Grounding Editor' : 'Medical Context Editor'}</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-lg">{isEnv ? 'Add physical features of the room (TV, windows, doors)' : 'Add facts the AI will use when interpreting your sketches'}</p>
            </div>

            {!isEnv && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm mb-10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">TTS Voice Mode</h4>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose how the AI speaks the synthesized requests</p>
                </div>
                <select
                  value={ttsMode}
                  onChange={(e) => setTtsMode(e.target.value as any)}
                  className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block p-3 min-w-[200px]"
                >
                  <option value="none">Disabled</option>
                  <option value="web_speech">Web Speech API (Browser)</option>
                  <option value="kokoro">Kokoro-82M (Server)</option>
                </select>
              </div>
            )}

            {!isEnv && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm mb-10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">Auto-Advance Storyboard</h4>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Automatically capture drawing after 1.5s of inactivity and advance to next frame</p>
                </div>
                <button
                  onClick={() => setAutoAdvance(prev => !prev)}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${autoAdvance ? 'bg-brand-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${autoAdvance ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
            )}

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm mb-10">
              <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider block mb-3">{isEnv ? 'New Room Feature' : 'New Context Entry'}</label>
              <textarea
                value={newEntry}
                onChange={(e) => setNewEntry(e.target.value)}
                placeholder={isEnv ? "e.g., The room has a smart TV. The window faces east." : "e.g., Patient usually asks for water at 3 PM..."}
                className="w-full border-2 border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 rounded-2xl p-5 text-lg text-zinc-900 dark:text-zinc-100 resize-y outline-none focus:border-brand-500 transition-colors min-h-[140px]"
              />

              <div className="flex justify-end mt-6">
                <Button
                  size="lg"
                  className={`h-12 px-6 rounded-xl text-base font-semibold text-white ${configStatus === 'saved' ? 'bg-brand-500 hover:bg-green-600' : 'bg-brand-600 hover:bg-brand-700'}`}
                  onClick={() => handleSaveRecord()}
                  disabled={configStatus === 'saving'}
                >
                  {configStatus === 'saving' ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <PlusCircle className="w-5 h-5 mr-2" />}
                  {configStatus === 'saving' ? 'Saving...' : 'Save to AI Context'}
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-4">Saved {isEnv ? 'Features' : 'Context'} ({displayRecords.length} entries)</p>
              {displayRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-zinc-400 gap-4 text-center">
                  <Settings className="w-12 h-12 opacity-50" />
                  <p className="text-lg">No entries yet. Add one above.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {displayRecords.map(rec => (
                    <div key={rec.id} className="flex items-center gap-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
                      <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200 flex-1">{rec.content.replace('[Room Environment] ', '')}</p>
                      <button
                        className="text-zinc-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        onClick={() => handleDeleteRecord(rec.id)}
                        title="Remove from AI context"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }
    }
  };


  const get12HourParts = () => {
    const time24 = useRealTime
      ? currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      : (mockTime || '12:00');
    const parts = time24.split(':');
    let hNum = parseInt(parts[0] || '12', 10);
    const mNum = parts[1] || '00';
    const isPm = hNum >= 12;
    let h12 = hNum % 12;
    if (h12 === 0) h12 = 12;
    return { dispH: h12.toString().padStart(2, '0'), dispM: mNum, dispIsPm: isPm };
  };
  const { dispH, dispM, dispIsPm } = get12HourParts();

  const updateMockTime = (newH12: string, newM: string, newIsPm: boolean) => {
    let hNum = parseInt(newH12, 10);
    if (isNaN(hNum)) hNum = 12;
    if (newIsPm && hNum !== 12) hNum += 12;
    if (!newIsPm && hNum === 12) hNum = 0;
    const time24 = `${hNum.toString().padStart(2, '0')}:${newM.padStart(2, '0')}`;
    setMockTime(time24);
    handleUpdateTime(time24, false);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-white flex flex-col font-sans">

      {/* Main Content Area */}
      <div className="flex-1 w-full h-full relative canvas-dots">
        {renderContent()}
      </div>

      {/* Clock & VLM Hotswap - Bottom Left */}
      <div className="absolute bottom-6 left-6 flex items-end gap-6 z-50 pointer-events-auto">
        <div className="flex flex-col items-start pointer-events-none">
          <p className="text-xs text-brand-800/60 dark:text-brand-200/60 uppercase tracking-widest font-bold mb-1">
            {useRealTime ? 'Time' : 'Time Override'}
          </p>
          <p className="text-4xl font-extrabold text-brand-900 dark:text-brand-100 drop-shadow-sm tracking-tight">
            {`${dispH}:${dispM} ${dispIsPm ? 'PM' : 'AM'}`}
          </p>
        </div>

        <div className="flex flex-col items-start pointer-events-auto group">
          <p className="text-xs text-brand-800/60 dark:text-brand-200/60 uppercase tracking-widest font-bold mb-1 pl-1 transition-colors group-hover:text-brand-800/80 dark:group-hover:text-brand-200/80">MODE</p>
          <div className="relative">
            <select
              value={`${activeVlm}|${thinkMode}`}
              onChange={async (e) => {
                const [model, think] = e.target.value.split('|');
                setActiveVlm(model);
                setThinkMode(think === 'true');
                try {
                  await fetch(`${SERVER_URL}/api/admin/config/models`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vlm_model: model, think_mode: think === 'true' })
                  });
                  setVlmStatus('saved');
                  setTimeout(() => setVlmStatus('idle'), 2000);
                } catch (err) {
                  console.error('Failed to update VLM model');
                }
              }}
              className="appearance-none bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md border border-white/50 dark:border-zinc-800/50 shadow-[0_4px_12px_rgba(0,0,0,0.05)] rounded-2xl pl-4 pr-10 py-2.5 text-sm font-bold tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-brand-900 dark:text-brand-100 cursor-pointer transition-all hover:bg-white/60 dark:hover:bg-zinc-900/60"
            >
              <option value="gemma4:e2b|false">ULTRAFAST</option>
              <option value="gemma4:e4b|false">FAST</option>
              <option value="gemma4:12b-it-qat|false">THINK</option>
              <option value="gemma4:12b-it-qat|true">ULTRATHINK</option>
            </select>
            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-brand-900/60 dark:text-brand-100/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Top Left Controls */}
      <div className="absolute top-6 left-6 z-50 flex items-center gap-3 pointer-events-auto">
        <Button
          variant="outline"
          size="icon"
          className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-zinc-200 dark:border-zinc-800 rounded-2xl w-12 h-12 shadow-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowTelemetry(prev => !prev)}
          className={`bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-zinc-200 dark:border-zinc-800 rounded-2xl w-12 h-12 shadow-sm ${showTelemetry ? 'text-brand-600 dark:text-brand-400' : 'text-zinc-500 dark:text-zinc-400'} hover:text-brand-700 dark:hover:text-brand-300 transition-colors`}
          title={showTelemetry ? "Hide Telemetry" : "Show Telemetry"}
        >
          <Activity className="w-6 h-6" />
        </Button>
      </div>

      {/* Telemetry HUD - Top Left */}
      {telemetry && showTelemetry && <TelemetryHUD telemetry={telemetry} />}

      {/* Sidenav -> Bottom Navigation Buttons */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white dark:bg-zinc-900 px-4 py-3 rounded-3xl shadow-xl border border-zinc-200 dark:border-zinc-800 z-50">
        <Button
          variant={mode === 'sketch' ? 'default' : 'ghost'}
          size="icon"
          className={mode === 'sketch' ? 'bg-brand-600 text-white rounded-2xl w-12 h-12 hover:opacity-90 shadow-md' : 'rounded-2xl w-12 h-12 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}
          onClick={() => setMode('sketch')}
          title="Canvas"
        >
          <MousePointer2 className="w-6 h-6" />
        </Button>
        <Button
          variant={mode === 'records' ? 'default' : 'ghost'}
          size="icon"
          className={mode === 'records' ? 'bg-brand-600 text-white rounded-2xl w-12 h-12 hover:opacity-90 shadow-md' : 'rounded-2xl w-12 h-12 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}
          onClick={() => setMode('records')}
          title="Medical Records"
        >
          <CheckCircle className="w-6 h-6" />
        </Button>
        <Button
          variant={mode === 'configure' ? 'default' : 'ghost'}
          size="icon"
          className={mode === 'configure' ? 'bg-brand-600 text-white rounded-2xl w-12 h-12 hover:opacity-90 shadow-md' : 'rounded-2xl w-12 h-12 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}
          onClick={() => setMode('configure')}
          title="Configure AI"
        >
          <Settings className="w-6 h-6" />
        </Button>
        <Button
          variant={mode === 'environment' ? 'default' : 'ghost'}
          size="icon"
          className={mode === 'environment' ? 'bg-brand-600 text-white rounded-2xl w-12 h-12 hover:opacity-90 shadow-md' : 'rounded-2xl w-12 h-12 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}
          onClick={() => setMode('environment')}
          title="Room Config"
        >
          <Home className="w-6 h-6" />
        </Button>
        <div className="w-px h-8 bg-zinc-300 dark:bg-zinc-700 mx-2"></div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-2xl w-12 h-12 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
          onClick={onLogout}
          title="Exit System"
        >
          <LogOut className="w-6 h-6" />
        </Button>
      </div>

      {/* Floating Action Buttons (Send / Clear / Next / Undo) - Right Side (Full Height) */}
      {(mode === 'sketch' || mode === 'confirming') && (
        <div className={`absolute top-0 right-0 h-full p-6 flex flex-col gap-4 z-50 transition-all duration-500 ease-out ${(!hasDrawn || !isIdle || mode === 'confirming') ? 'w-[20vw]' : 'w-[30vw]'}`}>
          {/* Clear / Cancel */}
          <Button
            variant="outline"
            className={`w-full rounded-[40px] bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 shadow-none border border-brand-200/50 dark:border-brand-800/30 flex flex-col items-center justify-center gap-4 transition-all ${storyboard.length > 0 && mode === 'sketch' ? 'flex-[0.6]' : 'flex-1'}`}
            onClick={clearCanvas}
            title={mode === 'sketch' ? "Clear All" : "Cancel"}
          >
            <Eraser className="w-16 h-16" />
            <span className="text-2xl font-bold tracking-tight">{mode === 'sketch' ? (storyboard.length > 0 ? 'Clear All' : 'Clear') : 'Cancel'}</span>
          </Button>

          {/* Undo Last Frame — only visible when storyboard has frames */}
          {storyboard.length > 0 && mode === 'sketch' && (
            <Button
              variant="outline"
              className="w-full flex-[0.6] rounded-[40px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 shadow-none border border-amber-200/50 dark:border-amber-800/30 flex flex-col items-center justify-center gap-4 transition-all animate-in fade-in slide-in-from-right-4 duration-300"
              onClick={handleUndoLastFrame}
              title="Undo last frame"
            >
              <Undo2 className="w-16 h-16" />
              <span className="text-2xl font-bold tracking-tight">Undo</span>
            </Button>
          )}

          {/* Next Frame — only visible in sketch mode when canvas has content and room for more */}
          {mode === 'sketch' && hasDrawn && storyboard.length < 4 && (
            <Button
              className="w-full flex-1 rounded-[40px] bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-200 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl hover:scale-[1.02] transition-all border-none flex flex-col items-center justify-center gap-4 animate-in fade-in slide-in-from-right-4 duration-300"
              onClick={captureFrameToStoryboard}
              title="Add to sentence and draw next"
            >
              <ChevronRight className="w-20 h-20" />
              <span className="text-3xl font-extrabold tracking-tight">Next</span>
            </Button>
          )}

          {/* Submit / Send */}
          <Button
            className="w-full flex-1 rounded-[40px] bg-brand-600 hover:bg-brand-700 text-white shadow-xl hover:scale-[1.02] transition-all border-none flex flex-col items-center justify-center gap-4"
            onClick={mode === 'sketch' ? handleInterpret : handleSendInterpretation}
          >
            <Send className="w-20 h-20" />
            <span className="text-3xl font-extrabold tracking-tight">{mode === 'sketch' ? 'Submit' : 'Send'}</span>
          </Button>
        </div>
      )}
    </div>
  );
};


export default PatientDashboard;
