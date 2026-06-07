import React, { useRef, useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import { Button } from "@/components/ui/button";
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
  Minimize
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

const PatientDashboard: React.FC<PatientDashboardProps> = ({ user, onLogout }) => {
  const [mode, setMode] = useState<Mode>('sketch');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isIdle, setIsIdle] = useState(true);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [showAnimation, setShowAnimation] = useState(true);
  const [options, setOptions] = useState<string[]>([]);
  const [intent, setIntent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientRecords, setPatientRecords] = useState<string[]>([]);
  const [originalSketch, setOriginalSketch] = useState<string | null>(null);

  // Predictive background fetching states
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRequestIdRef = useRef<number | null>(null);
  const [backgroundResult, setBackgroundResult] = useState<{ intent: string, options: string[], original_sketch: string } | null>(null);
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

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
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen();
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

  const [mockTime, setMockTime] = useState('');
  const [useRealTime, setUseRealTime] = useState(true);

  const loadActiveVlm = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/config/models`);
      if (res.ok) {
        const data = await res.json();
        setActiveVlm(data.vlm_model || 'llava');
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

    socketRef.current.on('interpretation_received', (data: any) => {
      setIntent(data.intent);
      setOptions(data.options);
      setOriginalSketch(data.original_sketch);
      setMode('confirming');
    });

    socketRef.current.on('background_interpretation_received', (data: any) => {
      if (currentRequestIdRef.current !== data.request_id) {
        return; // Ignore stale responses from previous strokes
      }
      setIsBackgroundProcessing(false);
      setBackgroundResult({
        intent: data.intent,
        options: data.options,
        original_sketch: data.original_sketch
      });
      setMode(currentMode => {
        if (currentMode === 'processing') {
          // User already clicked submit, transition instantly
          setIntent(data.intent);
          setOptions(data.options);
          setOriginalSketch(data.original_sketch);
          return 'confirming';
        }
        return currentMode;
      });
    });

    socketRef.current.on('interpretation_dispatched', (data: any) => {
      setIntent(data.intent);
      setMode('result');
    });

    socketRef.current.on('records_update', (data: any) => {
      setPatientRecords(data.records);
    });

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
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (uiDebounceTimerRef.current) {
      clearTimeout(uiDebounceTimerRef.current);
      uiDebounceTimerRef.current = null;
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
    setHasDrawn(true);
    setShowAnimation(false);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
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
  };

  const handleBackgroundInterpret = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const pixelData = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
    const isBlank = !pixelData?.some(p => p !== 0);
    if (isBlank) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvas, 0, 0);
    }

    const dataUrl = tempCanvas.toDataURL('image/png');
    setIsBackgroundProcessing(true);

    const reqId = Date.now();
    currentRequestIdRef.current = reqId;

    socketRef.current.emit('process_sketch_background', {
      image: dataUrl,
      patient_id: user.username,
      request_id: reqId
    });
  };

  const endDrawing = () => {
    setIsDrawing(false);
    
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      handleBackgroundInterpret();
    }, 1000); // 1.0s ensures the user has actually stopped drawing

    if (uiDebounceTimerRef.current) clearTimeout(uiDebounceTimerRef.current);
    uiDebounceTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 100); // Quick 100ms debounce for UI animation
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    resetDebounce();
    setIsIdle(true);
    setHasDrawn(false);
    setMode('sketch');
    setError(null);
    setIntent(null);
    setOptions([]);
    setOriginalSketch(null);
  };

  const handleInterpret = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if canvas is blank (simplified check)
    const ctx = canvas.getContext('2d');
    const pixelData = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
    const isBlank = !pixelData?.some(p => p !== 0);
    if (isBlank) {
      setError("Please draw something first");
      return;
    }

    if (backgroundResult) {
      // Magic zero-latency illusion
      setIntent(backgroundResult.intent);
      setOptions(backgroundResult.options);
      setOriginalSketch(backgroundResult.original_sketch);
      setMode('confirming');
      return;
    }

    setMode('processing');

    if (isBackgroundProcessing) {
      // Background task is running, wait for the socket event
      setHasSubmitted(true);
      return;
    }

    // Composite onto a white background to prevent VLMs from seeing a transparent/black image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvas, 0, 0);
    }

    const dataUrl = tempCanvas.toDataURL('image/png');
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
          <div className="absolute inset-0 bg-white/50 dark:bg-black/20">
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

            {showAnimation && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center opacity-30 dark:opacity-20 transition-opacity duration-700 delay-100">
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
            )}
            {error && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-medium shadow-sm z-50 animate-in fade-in slide-in-from-top-4">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 'processing':
        return (
          <div className="zen-container h-full">
            <div className="zen-orb zen-orb-1" />
            <div className="zen-orb zen-orb-2" />
            <div className="zen-content">
              <div className="zen-spinner-ring" />
              <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-3">Synthesizing Intent...</h2>
              <p className="text-xl text-slate-500 dark:text-slate-400">Consulting your clinical history and personal preferences</p>
            </div>
          </div>
        );

      case 'confirming':
        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 md:p-12 z-10 relative">
            <div className="bg-white dark:bg-zinc-900 p-8 md:p-12 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-4xl w-full text-center">
              <h2 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-8">Does this look right?</h2>

              <div className="bg-brand-50 dark:bg-brand-950/30 p-8 rounded-2xl border border-brand-100 dark:border-brand-900 mb-10">
                <p className="text-sm font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest mb-3">Synthesized Request:</p>
                <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight">"{intent}"</h1>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-start text-left">
                <div className="w-full md:w-64 shrink-0 bg-white dark:bg-zinc-950 p-4 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
                  <p className="text-sm font-semibold text-zinc-500 mb-3 text-center">Your Sketch</p>
                  {originalSketch && <img src={originalSketch} className="w-full h-auto rounded-xl bg-zinc-50 dark:bg-zinc-900" alt="Original" />}
                </div>

                <div className="flex-1 w-full">
                  <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Not what you meant? Try these:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {options.map((option, idx) => (
                      <button
                        key={idx}
                        className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/50 transition-all text-left"
                        onClick={() => handleSelectOption(option)}
                      >
                        <ImageIcon className="w-5 h-5 text-brand-500 shrink-0" />
                        <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200 capitalize">{option}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-10 justify-end w-full border-t border-zinc-200 dark:border-zinc-800 pt-6">
                <Button variant="outline" size="lg" className="h-14 px-8 text-lg rounded-2xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={clearCanvas}>
                  Cancel
                </Button>
                <Button size="lg" className="h-14 px-8 text-lg rounded-2xl bg-brand-600 hover:bg-brand-700 text-white shadow-md hover:-translate-y-1 transition-all" onClick={handleSendInterpretation}>
                  <Send className="w-5 h-5 mr-2" />
                  Confirm & Send
                </Button>
              </div>
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
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-brand-50/50 to-brand-100/50 dark:from-brand-950/50 dark:to-brand-900/50 flex flex-col font-sans">

      {/* Main Content Area */}
      <div className="flex-1 w-full h-full relative">
        {renderContent()}
      </div>

      {/* Clock - Bottom Left */}
      <div className="absolute bottom-6 left-6 flex flex-col items-start z-50 pointer-events-none">
        <p className="text-xs text-brand-800/60 dark:text-brand-200/60 uppercase tracking-widest font-bold mb-1">
          {useRealTime ? 'Time' : 'Time Override'}
        </p>
        <p className="text-4xl font-extrabold text-brand-900 dark:text-brand-100 drop-shadow-sm tracking-tight">
          {`${dispH}:${dispM} ${dispIsPm ? 'PM' : 'AM'}`}
        </p>
      </div>

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

      {/* Floating Action Buttons (Send / Clear) - Right Side (Full Height) */}
      {mode === 'sketch' && (
        <div className={`absolute top-0 right-0 h-full p-6 flex flex-col gap-6 z-50 transition-all duration-500 ease-out ${(!hasDrawn || !isIdle) ? 'w-[20vw]' : 'w-[30vw]'}`}>
          <Button
            variant="outline"
            className="w-full flex-1 rounded-[40px] bg-[#E0E0E0] dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-[#D0D0D0] dark:hover:bg-zinc-700 shadow-none border-none flex flex-col items-center justify-center gap-6"
            onClick={clearCanvas}
            title="Clear Canvas"
          >
            <Eraser className="w-24 h-24" />
            <span className="text-4xl font-bold tracking-tight">Clear</span>
          </Button>
          <Button
            className="w-full flex-1 rounded-[40px] bg-brand-600 hover:bg-brand-700 text-white shadow-xl hover:scale-[1.02] transition-all border-none flex flex-col items-center justify-center gap-6"
            onClick={mode === 'sketch' ? handleInterpret : handleSendInterpretation}
          >
            <Send className="w-24 h-24" />
            <span className="text-4xl font-extrabold tracking-tight">{mode === 'sketch' ? 'Send' : 'Confirm'}</span>
          </Button>
        </div>
      )}
    </div>
  );
};


export default PatientDashboard;
