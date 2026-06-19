import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { SERVER_URL } from '../lib/serverUrl';
import { Button } from "@/components/ui/button";
import { Bell, Users, LogOut, MessageSquare, Camera, Scan, CheckCircle, XCircle, Loader2, Maximize, Minimize, X, RotateCw, Crosshair, Home } from 'lucide-react';

interface CaretakerDashboardProps {
  user: any;
  onLogout: () => void;
}

interface Notification {
  id: string;
  patient_name: string;
  intent: string;
  timestamp: Date;
  image?: string;
}

const CaretakerDashboard: React.FC<CaretakerDashboardProps> = ({ user, onLogout }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'scanner' | 'patients'>('alerts');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1180);
  const [isLandscape, setIsLandscape] = useState(
    window.innerWidth > window.innerHeight && window.innerWidth <= 1180
  );

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w <= 1180);
      setIsLandscape(w > h && w <= 1180);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagedItems, setStagedItems] = useState<any[]>([]);
  const [scanMode, setScanMode] = useState<'medication' | 'environment'>('medication');
  const [scanScope, setScanScope] = useState<'targeted' | 'full'>('targeted');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [selectedPatientForView, setSelectedPatientForView] = useState<any>(null);
  const [isCameraFullscreen, setIsCameraFullscreen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [activePromptItems, setActivePromptItems] = useState<any[]>([]);
  const [zoomValue, setZoomValue] = useState<number>(1);
  const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
  const [isNativeZoom, setIsNativeZoom] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const handleFlipCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    await startCamera(nextMode);
  };

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
  };

  useEffect(() => {
    if (activeTab === 'scanner') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [activeTab]);

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    try {
      // Release any active stream tracks and nullify to prevent webcam device lock
      if (videoRef.current && videoRef.current.srcObject) {
        const prevStream = videoRef.current.srcObject as MediaStream;
        prevStream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }

      // Add a small delay to let the browser and mobile OS fully release the hardware lens
      await new Promise(resolve => setTimeout(resolve, 150));

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Camera access denied by browser. If testing on mobile via IP, you must use HTTPS or enable insecure origins in browser flags.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode }
      });

      // The video element might take a millisecond to mount after switching tabs
      const attachStream = () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraActive(true);

          // Force play to resume playback on mobile browsers when srcObject is dynamically reassigned
          videoRef.current.play().catch(err => {
            console.warn("Failed to play video stream dynamically:", err);
          });

          // Get native zoom capabilities on startup
          const track = stream.getVideoTracks()[0];
          if (track) {
            const capabilities = ((track.getCapabilities && track.getCapabilities()) || {}) as any;
            if (capabilities.zoom) {
              setZoomCapabilities({
                min: capabilities.zoom.min || 1,
                max: capabilities.zoom.max || 8,
                step: capabilities.zoom.step || 0.1
              });
              setIsNativeZoom(true);
            } else {
              // Custom emulated bounds for digital fallback scaling zoom
              setZoomCapabilities({ min: 1, max: 4, step: 0.1 });
              setIsNativeZoom(false);
            }
          }
        } else {
          setTimeout(attachStream, 50);
        }
      };
      attachStream();

    } catch (err: any) {
      console.error("Error accessing camera:", err);
      alert(`Camera Error: ${err.message || err}`);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
    setZoomValue(1);
    setZoomCapabilities(null);
    setIsNativeZoom(false);
  };

  const applyZoom = async (value: number) => {
    setZoomValue(value);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = ((track.getCapabilities && track.getCapabilities()) || {}) as any;
          if (capabilities.zoom) {
            await track.applyConstraints({
              advanced: [{ zoom: value }]
            } as any);
          }
        } catch (err) {
          console.warn("Failed to apply native camera zoom constraint:", err);
        }
      }
    }
  };

  // Continuous live scanner interval trigger
  useEffect(() => {
    let intervalId: any = null;

    if (activeTab === 'scanner' && isLiveMode && isCameraActive && !isProcessing && activePromptItems.length === 0) {
      intervalId = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || isProcessing || activePromptItems.length > 0) return;

        setIsProcessing(true);

        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;

          // Phase 2 Canvas Annihilation: Draw frame at native resolution
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setIsProcessing(false);
            return;
          }

          // Dynamic emulated crop zoom support
          const stream = video.srcObject as MediaStream;
          const track = stream?.getVideoTracks()[0];
          const capabilities = ((track?.getCapabilities && track.getCapabilities()) || {}) as any;
          const hasNativeZoom = !!capabilities.zoom;

          if (!hasNativeZoom && zoomValue > 1) {
            const cropWidth = video.videoWidth / zoomValue;
            const cropHeight = video.videoHeight / zoomValue;
            const startX = (video.videoWidth - cropWidth) / 2;
            const startY = (video.videoHeight - cropHeight) / 2;
            ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }

          const base64Image = canvas.toDataURL('image/jpeg', 0.8);

          const res = await fetch(`${SERVER_URL}/api/scan-grounding`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image, mode: scanMode, scope: scanScope })
          });

          if (res.ok) {
            const result = await res.json();
            const incomingObjects = result.objects || [];

            // Find non-duplicate items in the current active overlay set
            const newValidItems = incomingObjects.filter((item: any) => {
              if (!item.name || item.name.trim().toLowerCase() === 'unknown' || item.name.trim().toLowerCase() === 'none') {
                return false;
              }
              const isDuplicate = activePromptItems.some(active => active.name.toLowerCase() === item.name.toLowerCase());
              return !isDuplicate;
            });

            if (newValidItems.length > 0) {
              const mapped = newValidItems.map((item: any) => ({
                id: Math.random().toString(),
                status: 'pending',
                ...item
              }));

              // Synthesize double chime chime & device vibration!
              try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 chime
                osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5 chime
                gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);

                if (navigator.vibrate) {
                  navigator.vibrate([60, 40, 60]);
                }
              } catch (e) {
                console.warn("Audio/Haptic chime failed", e);
              }

              setActivePromptItems(prev => [...prev, ...mapped]);
            }
          }
        } catch (err) {
          console.error("Live scan cycle error:", err);
        } finally {
          setIsProcessing(false);
        }
      }, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTab, isLiveMode, isCameraActive, isProcessing, activePromptItems, scanMode, scanScope, stagedItems, allRecords, zoomValue]);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    // Draw video frame to canvas
    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Phase 2 Canvas Annihilation: Draw frame at native resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dynamic emulated crop zoom support
    const stream = video.srcObject as MediaStream;
    const track = stream?.getVideoTracks()[0];
    const capabilities = ((track?.getCapabilities && track.getCapabilities()) || {}) as any;
    const hasNativeZoom = !!capabilities.zoom;

    if (!hasNativeZoom && zoomValue > 1) {
      const cropWidth = video.videoWidth / zoomValue;
      const cropHeight = video.videoHeight / zoomValue;
      const startX = (video.videoWidth - cropWidth) / 2;
      const startY = (video.videoHeight - cropHeight) / 2;
      ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // Get base64 image
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);

    try {
      // Abort any existing analysis before starting a new one
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch(`${SERVER_URL}/api/scan-grounding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, mode: scanMode, scope: scanScope }),
        signal: controller.signal
      });

      if (res.ok) {
        const result = await res.json();
        const incomingObjects = result.objects || [];

        const mapped = incomingObjects.map((item: any) => ({
          id: Math.random().toString(),
          status: 'pending',
          ...item
        }));

        // Synthesize double chime chime & device vibration!
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 chime
          osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5 chime
          gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);

          if (navigator.vibrate) {
            navigator.vibrate([60, 40, 60]);
          }
        } catch (e) {
          console.warn("Audio/Haptic chime failed", e);
        }

        setActivePromptItems(mapped);
      } else {
        console.error("Failed to scan grounding factor");
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Analysis successfully cancelled by the user.");
      } else {
        console.error(err);
      }
    } finally {
      // Clear controller reference if we are done
      abortControllerRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleAddBoxItem = async (item: any) => {
    // Dynamically format using our sentence generator!
    let content = "";
    let name = item.name.trim();
    if (name.includes('/')) name = name.split('/')[0].trim();
    let details = item.details.trim();
    if (details.endsWith('.')) details = details.slice(0, -1);

    if (item.type === 'environmental_object' || item.type === 'environment') {
      if (/^(on|in|resting|lying|standing|hanging|mounted|located|near|next to)\b/i.test(details)) {
        content = `[Room Environment] There is a ${name.toLowerCase()} ${details}.`;
      } else {
        content = `[Room Environment] The room features a ${name.toLowerCase()} which is ${details}.`;
      }
    } else {
      content = `[Grounding] The patient has a supply of ${name} (${item.type}), with details: ${details}.`;
    }

    let url = `${SERVER_URL}/api/admin/records?content=${encodeURIComponent(content)}`;
    if (selectedPatientId) {
      url += `&patient_id=${selectedPatientId}`;
    }

    // Optimistic status update to saved to feel snappy!
    setActivePromptItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'saved' } : p));

    // Play sound and trigger vibration
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 chime
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5 chime
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);

      if (navigator.vibrate) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch (e) {
      console.warn("Audio/Haptic chime failed", e);
    }

    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) {
        fetchAllRecords();
        // Fade out/remove the item after 1.5 seconds so the screen stays clean
        setTimeout(() => {
          setActivePromptItems(prev => prev.filter(p => p.id !== item.id));
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to commit live grounding", err);
    }
  };

  const handleDismissBoxItem = (id: string) => {
    setActivePromptItems(prev => prev.filter(p => p.id !== id));
  };

  // Pinch-to-zoom gesture controls specifically inside the video viewfinder
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isCameraActive) return;

    let startDistance = 0;
    let startZoom = 1;

    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Prevent default browser-wide scale zooming
        e.preventDefault();
        startDistance = getDistance(e.touches);
        startZoom = zoomValue;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDistance > 0) {
        e.preventDefault();
        const currentDistance = getDistance(e.touches);
        if (currentDistance > 0) {
          const scale = currentDistance / startDistance;
          let targetZoom = startZoom * scale;

          // Constrain zoom based on capabilities
          const min = zoomCapabilities?.min || 1;
          const max = zoomCapabilities?.max || 4;
          if (targetZoom < min) targetZoom = min;
          if (targetZoom > max) targetZoom = max;

          // Constrain to 2 decimal places to avoid over-spanned render cycles
          const roundedZoom = Math.round(targetZoom * 100) / 100;
          applyZoom(roundedZoom);
        }
      }
    };

    const handleTouchEnd = () => {
      startDistance = 0;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isCameraActive, zoomValue, zoomCapabilities]);

  const fetchAllRecords = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/records`);
      if (res.ok) {
        const data = await res.json();
        setAllRecords(data);
      }
    } catch (err) {
      console.error("Failed to fetch all records", err);
    }
  };

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/admin/patients`);
        if (res.ok) {
          const data = await res.json();
          setPatients(data);
          if (data.length > 0) {
            const defaultPatient = data.find((p: any) => p.patient_id === 'patient') || data[0];
            setSelectedPatientId(defaultPatient.id.toString());
            setSelectedPatientForView(defaultPatient);
          }
        }
      } catch (err) {
        console.error("Failed to fetch patients", err);
      }
    };
    fetchPatients();
  }, []);

  useEffect(() => {
    if (activeTab === 'patients') {
      fetchAllRecords();
    }
  }, [activeTab]);

  const addGroundingFactor = async (item: any) => {
    try {
      let content = "";

      let name = item.name.trim();
      // Remove any slash-hanging options (e.g., "water bottle/flask" -> "water bottle")
      if (name.includes('/')) {
        name = name.split('/')[0].trim();
      }

      let details = item.details.trim();
      if (details.endsWith('.')) {
        details = details.slice(0, -1);
      }

      if (item.type === 'environmental_object') {
        // Form a flowing natural sentence
        if (/^(on|in|resting|lying|standing|hanging|mounted|located|near|next to)\b/i.test(details)) {
          content = `[Room Environment] There is a ${name.toLowerCase()} ${details}.`;
        } else {
          content = `[Room Environment] The room features a ${name.toLowerCase()} which is ${details}.`;
        }
      } else {
        // Clinical / Medication Grounding
        content = `[Grounding] The patient has a supply of ${name} (${item.type}), with details: ${details}.`;
      }

      let url = `${SERVER_URL}/api/admin/records?content=${encodeURIComponent(content)}`;
      if (selectedPatientId) {
        url += `&patient_id=${selectedPatientId}`;
      }

      const res = await fetch(url, {
        method: 'POST',
      });
      if (res.ok) {
        setStagedItems(prev => prev.filter(i => i.id !== item.id));
      }
    } catch (err) {
      console.error("Failed to add grounding factor", err);
    }
  };

  const discardStagedItem = (id: string) => {
    setStagedItems(prev => prev.filter(i => i.id !== id));
  };

  useEffect(() => {
    const newSocket = io(SERVER_URL, {
      auth: { token: user.token }
    });

    newSocket.on('interpretation_complete', (data: any) => {
      if (data.patient_name) {
        const newNotification: Notification = {
          id: Math.random().toString(36).substr(2, 9),
          patient_name: data.patient_name,
          intent: data.intent,
          image: data.image,
          timestamp: new Date()
        };
        setNotifications(prev => [newNotification, ...prev]);

        if (typeof window !== 'undefined' && 'Notification' in window && (window as any).Notification.permission === 'granted') {
          try {
            new (window as any).Notification(`Alert from ${data.patient_name}`, {
              body: data.intent
            });
          } catch (e) {
            console.warn("Failed to trigger desktop notification:", e);
          }
        }
      }
    });

    setSocket(newSocket);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if ((window as any).Notification.permission === 'default') {
          (window as any).Notification.requestPermission();
        }
      } catch (e) {
        console.warn("Failed to request notification permission:", e);
      }
    }

    return () => {
      newSocket.close();
    };
  }, [user.token]);

  return (
    <div className="caretaker-dashboard relative w-full h-full overflow-hidden bg-white flex flex-col font-sans">
      {/* Main Content Area */}
      <div className="flex-1 w-full h-full relative overflow-y-auto bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="p-6 md:p-10 pb-32 max-w-7xl mx-auto">

        {activeTab === 'alerts' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-8">
              <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-2">Patient Monitoring</h1>
              <p className="text-lg text-zinc-500 dark:text-zinc-400">Real-time intent interpretation activity</p>
            </header>

            <div className="flex flex-col gap-4 max-w-4xl">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-center bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm">
                  <MessageSquare className="w-16 h-16 text-zinc-300 dark:text-zinc-700 mb-4" />
                  <p className="text-lg text-zinc-500 dark:text-zinc-400 font-medium">Standing by for patient communications...</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-brand-300 dark:hover:border-brand-800 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 rounded-full flex items-center justify-center text-xl font-bold shadow-sm">
                        {notif.patient_name.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{notif.patient_name}</span>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">{notif.timestamp.toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <div className="flex-1 w-full text-right">
                      <div className="flex items-center justify-end gap-4">
                        <p className="text-2xl md:text-3xl font-bold text-zinc-700 dark:text-zinc-300 italic leading-tight text-right">"{notif.intent}"</p>
                        {notif.image && (
                          <img
                            src={notif.image}
                            alt="Patient sketch"
                            className="w-20 h-20 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 object-cover bg-white shrink-0 shadow-sm"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'scanner' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col md:flex-row gap-6 md:gap-8 h-full min-h-[600px]">
            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
              .spinner { animation: spin 2s linear infinite; }
            `}</style>
            {/* Camera View */}
            <div className="flex-1 flex flex-col">
              <header className="mb-6">
                <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-2">Environment Scanner</h1>
                <p className="text-lg text-zinc-500 dark:text-zinc-400">Scan prescriptions and objects for AI grounding</p>
              </header>

              <div className="flex gap-2 mb-6 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <button
                  onClick={() => setScanMode('medication')}
                  className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 ${scanMode === 'medication' ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 shadow-sm border border-brand-200 dark:border-brand-800/50' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
                >
                  Medication
                </button>
                <button
                  onClick={() => setScanMode('environment')}
                  className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 ${scanMode === 'environment' ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 shadow-sm border border-brand-200 dark:border-brand-800/50' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
                >
                  Objects
                </button>
              </div>

              {/* Target Patient Dropdown Selector */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Target Patient for Grounding
                </label>
                <div className="relative">
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="w-full appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 pr-10 text-sm font-bold text-zinc-800 dark:text-zinc-200 shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all hover:border-brand-300 dark:hover:border-brand-700"
                  >
                    {patients.length === 0 ? (
                      <option value="">No patients assigned</option>
                    ) : (
                      patients.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.patient_id})</option>
                      ))
                    )}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>

              {/* Continuous Live Scan Toggle */}
              <div className="flex items-center justify-between mb-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[1.5rem] p-4 shadow-sm">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Continuous Scan</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Auto-scans your area every 2 seconds</span>
                </div>
                <button
                  onClick={() => {
                    setIsLiveMode(!isLiveMode);
                    setIsProcessing(false);
                    setActivePromptItems([]);
                  }}
                  className={`px-4 py-2 rounded-full font-bold text-sm transition-all duration-300 ${isLiveMode ? 'bg-green-500 text-white shadow-[0_2px_12px_rgba(34,197,94,0.4)] hover:bg-green-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                  {isLiveMode ? 'ON' : 'OFF'}
                </button>
              </div>

              <div
                ref={containerRef}
                className={isCameraFullscreen ? "fixed inset-0 bg-zinc-950 z-[1000] flex flex-col items-center justify-center" : "flex-1 bg-zinc-950 rounded-[2rem] overflow-hidden relative flex flex-col items-center justify-center min-h-[350px] md:min-h-0 shadow-lg border border-zinc-800"}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: !isNativeZoom && zoomValue > 1 ? `scale(${zoomValue})` : 'none',
                    transformOrigin: 'center center',
                    transition: 'transform 0.1s ease-out'
                  }}
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Fullscreen Expand/Minimize Toggles */}
                {!isCameraFullscreen ? (
                  <button
                    onClick={() => setIsCameraFullscreen(true)}
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10 transition-colors backdrop-blur-sm"
                    title="Expand Viewfinder"
                  >
                    <Maximize size={18} />
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCameraFullscreen(false)}
                    className="absolute top-6 right-6 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center z-[1030] transition-colors backdrop-blur-md"
                    title="Minimize Viewfinder"
                  >
                    <Minimize size={20} />
                  </button>
                )}

                {/* Floating Top Controls Overlay (Fullscreen only) */}
                {isCameraFullscreen && (
                  <div className="absolute top-6 left-6 right-6 flex flex-col gap-3 z-[1010] pointer-events-none">
                    {/* Header Row: Patient Capsule */}
                    <div className="flex justify-start items-center w-full pointer-events-auto">
                      {/* Left: Patient Capsule */}
                      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-sm font-bold backdrop-blur-md shadow-sm">
                        <Users size={16} className="opacity-80" />
                        <select
                          value={selectedPatientId}
                          onChange={(e) => setSelectedPatientId(e.target.value)}
                          className="bg-transparent border-none text-white text-sm font-bold outline-none cursor-pointer appearance-none pr-4"
                        >
                          {patients.map(p => (
                            <option key={p.id} value={p.id} className="text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900">{p.name}</option>
                          ))}
                        </select>
                        <span className="text-[10px] opacity-60 -ml-2 pointer-events-none">▼</span>
                      </div>
                    </div>

                    {/* Unified Mode Segment Selector capsule */}
                    <div className="flex p-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md self-center w-[280px] mt-1 pointer-events-auto shadow-sm">
                      {[
                        { id: 'meds', label: 'Meds', mode: 'medication', scope: 'targeted' },
                        { id: 'objects', label: 'Objects', mode: 'environment', scope: 'targeted' },
                        { id: 'scene', label: 'Scene', mode: 'environment', scope: 'full' }
                      ].map(opt => {
                        const isActive = opt.id === 'meds' 
                          ? scanMode === 'medication'
                          : (opt.id === 'objects' 
                              ? (scanMode === 'environment' && scanScope === 'targeted') 
                              : (scanMode === 'environment' && scanScope === 'full'));
                              
                        return (
                          <button
                            key={opt.id}
                            onClick={() => {
                              setScanMode(opt.mode as any);
                              setScanScope(opt.scope as any);
                            }}
                            className={`flex-1 py-1.5 px-3 rounded-full text-sm font-bold transition-all duration-200 focus:outline-none ${isActive ? 'bg-white text-black shadow-sm' : 'bg-transparent text-white/70 hover:text-white'}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Interactive AR Bounding Box Grid Overlay */}
                {activePromptItems.map((item: any) => {
                  if (!item.box_2d || !Array.isArray(item.box_2d) || item.box_2d.length < 4) return null;

                  const ymin = Number(item.box_2d[0]) || 0;
                  const xmin = Number(item.box_2d[1]) || 0;
                  const ymax = Number(item.box_2d[2]) || 0;
                  const xmax = Number(item.box_2d[3]) || 0;

                  // Calculate absolute bounding box positioning percentages
                  const top = `${ymin}%`;
                  const left = `${xmin}%`;
                  const width = `${Math.max(5, xmax - xmin)}%`;
                  const height = `${Math.max(5, ymax - ymin)}%`;

                  const isSaved = item.status === 'saved';
                  const isMedication = item.type === 'medication';

                  // Dynamic color classes based on item type and status
                  const borderColor = isSaved ? 'border-green-500' : (isMedication ? 'border-purple-500' : 'border-blue-500');
                  const shadowColor = isSaved ? 'shadow-[0_0_12px_rgba(34,197,94,0.4)]' : (isMedication ? 'shadow-[0_0_12px_rgba(168,85,247,0.4)]' : 'shadow-[0_0_12px_rgba(59,130,246,0.4)]');

                  return (
                    <div
                      key={item.id}
                      className={`absolute border-[1.5px] rounded-lg pointer-events-auto z-[1020] transition-all duration-300 animate-in zoom-in-95 ${borderColor} ${shadowColor}`}
                      style={{ top, left, width, height }}
                    >
                      {/* Crisp high-contrast solid tag directly floating above the box */}
                      <div 
                        className={`absolute left-0 bg-zinc-900/90 px-2 py-1 rounded-md border border-white/20 text-white text-[11px] font-bold uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shadow-md transition-all duration-200 ${ymin < 12 ? 'top-1' : '-top-6'}`}
                      >
                        <span className="text-white">{item.name}</span>
                      </div>

                      {/* Minimalist Action Pill inside the center/bottom of the box */}
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 bg-zinc-900/95 p-1 rounded-2xl border border-white/10 shadow-lg backdrop-blur-sm">
                        {isSaved ? (
                          <div className="px-2.5 py-1 text-green-500 text-[11px] font-extrabold flex items-center gap-1 animate-pulse">
                            <CheckCircle size={12} className="shrink-0" /> Saved
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleAddBoxItem(item)}
                              className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-all duration-200 shadow-[0_2px_6px_rgba(34,197,94,0.4)] hover:scale-110"
                              title="Add to Patient Grounding"
                            >
                              <CheckCircle size={14} />
                            </button>
                            <button
                              onClick={() => handleDismissBoxItem(item.id)}
                              className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all duration-200 hover:scale-110"
                              title="Dismiss"
                            >
                              <XCircle size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Capture Overlay */}
                <div className="absolute bottom-6 left-0 right-0 flex flex-col justify-center items-center gap-3 z-[1010]">

                  {/* Zoom Quick Selectors Capsule */}
                  {zoomCapabilities && (
                    <div className="flex gap-1 justify-center items-center bg-black/65 border border-white/10 p-1 rounded-full pointer-events-auto z-[1010] backdrop-blur-sm">
                      {[1, 2, 4].map(z => {
                        const isActive = Math.abs(zoomValue - z) < 0.1;
                        return (
                          <button
                            key={z}
                            onClick={() => applyZoom(z)}
                            className={`w-8 h-8 rounded-full text-[11px] font-bold flex items-center justify-center transition-all duration-150 focus:outline-none ${isActive ? 'bg-white/15 text-white' : 'bg-transparent text-zinc-400 hover:text-white hover:bg-white/5'}`}
                          >
                            {z}x
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Bottom Controls Row: Flip Camera | White iOS Shutter | Reset Reticle */}
                  <div className="flex items-center gap-6 pointer-events-auto">
                    
                    {/* Left: Flip Camera Button */}
                    <button
                      onClick={handleFlipCamera}
                      className="w-12 h-12 rounded-full bg-black/65 border border-white/10 text-white flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-black/80 focus:outline-none backdrop-blur-sm hover:scale-105"
                      title="Flip Camera"
                    >
                      <RotateCw size={18} />
                    </button>

                    {/* Center: iOS/Mockup Double-Ring White Shutter */}
                    {isLiveMode ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_16px_rgba(34,197,94,0.6)] animate-[pulse_1.5s_infinite]">
                          <span className="w-3 h-3 rounded-full bg-white" />
                        </div>
                        <span className="text-white text-xs font-bold drop-shadow-md">
                          {isProcessing ? 'Analyzing...' : 'Scanning Room...'}
                        </span>
                        <style>{`
                          @keyframes pulse {
                            0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(34,197,94, 0.7); }
                            70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(34,197,94, 0); }
                            100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(34,197,94, 0); }
                          }
                          @keyframes spin-continuous {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                          }
                          .spin-continuous {
                            animation: spin-continuous 3s linear infinite;
                          }
                        `}</style>
                      </div>
                    ) : (
                      <button
                        onClick={handleCapture}
                        disabled={isProcessing || !isCameraActive}
                        className={`w-20 h-20 rounded-full border-4 border-white p-1 bg-transparent flex items-center justify-center shadow-[0_8px_16px_rgba(0,0,0,0.3)] transition-all duration-200 focus:outline-none ${isProcessing ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:scale-105'}`}
                      >
                        <div className={`w-full h-full rounded-full transition-colors duration-200 ${isProcessing ? 'bg-zinc-400' : 'bg-white'}`} />
                      </button>
                    )}

                    {/* Right spacer: keeps shutter button perfectly centered */}
                    <div className="w-12" />

                  </div>

                  {(isProcessing && !isLiveMode) && (
                    <div className="flex flex-col items-center gap-2 mt-1">
                      <span className="bg-black/70 text-white px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm backdrop-blur-sm animate-pulse">
                        <Loader2 className="spinner" size={14} />
                        Scanning...
                      </span>
                      <button 
                        onClick={handleCancelAnalysis}
                        className="bg-red-500 hover:bg-red-600 text-white border-none px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer flex items-center gap-1 shadow-[0_4px_8px_rgba(239,68,68,0.3)] transition-colors focus:outline-none"
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Staged Items Inbox */}
            <div className="w-full md:w-[400px] flex flex-col md:border-l md:border-zinc-200 md:dark:border-zinc-800 md:pl-8 md:pt-0 pt-4 md:pb-0 pb-10 border-t border-zinc-200 dark:border-zinc-800 md:border-t-0">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Staged for Grounding</h2>
              <div className="flex-1 overflow-y-visible md:overflow-y-auto flex flex-col gap-4 pr-2">
                {stagedItems.length === 0 ? (
                  <div className="text-center text-zinc-400 dark:text-zinc-500 mt-10 flex flex-col items-center">
                    <Scan className="w-8 h-8 mb-2 opacity-50" />
                    <p className="font-medium text-sm">No items scanned yet.</p>
                  </div>
                ) : (
                  stagedItems.map(item => (
                    <div key={item.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm hover:border-brand-300 dark:hover:border-brand-800 transition-colors">
                      <span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">{item.type}</span>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1 mb-2">{item.name}</h3>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">{item.details}</p>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => addGroundingFactor(item)} 
                          className="flex-1 bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40 text-brand-600 dark:text-brand-400 border border-brand-200/50 dark:border-brand-800/30 p-2 rounded-xl flex items-center justify-center gap-1.5 font-bold text-sm transition-colors focus:outline-none"
                        >
                          <CheckCircle className="w-4 h-4" /> Add
                        </button>
                        <button 
                          onClick={() => discardStagedItem(item.id)} 
                          className="flex-1 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/50 p-2 rounded-xl flex items-center justify-center gap-1.5 font-bold text-sm transition-colors focus:outline-none"
                        >
                          <XCircle className="w-4 h-4" /> Discard
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'patients' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col md:flex-row gap-8 h-full min-h-[600px]">
            {/* Patient Cards Grid */}
            <div className="flex-1 flex flex-col">
              <header className="mb-8">
                <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-2">Assigned Patients</h1>
                <p className="text-lg text-zinc-500 dark:text-zinc-400">Manage patient context and view configurations</p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {patients.map(p => {
                  const isSelected = selectedPatientForView?.id === p.id;
                  const patientRecsCount = allRecords.filter(r => r.patient_id_fk === p.id).length;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatientForView(p)}
                      className={`bg-white dark:bg-zinc-900 rounded-[1.5rem] p-6 cursor-pointer transition-all duration-300 border shadow-sm ${isSelected ? 'border-brand-500 shadow-[0_8px_24px_rgba(0,122,255,0.12)] scale-[1.02]' : 'border-zinc-200 dark:border-zinc-800 hover:border-brand-300 dark:hover:border-brand-800'}`}
                    >
                      <div className="flex items-center gap-4 mb-5">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-sm ${isSelected ? 'bg-brand-500 text-white' : 'bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'}`}>
                          {p.name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 m-0">{p.name}</h3>
                          <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">ID: {p.patient_id}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm border-t border-zinc-100 dark:border-zinc-800/50 pt-4">
                        <span className="text-zinc-500 dark:text-zinc-400 font-medium">RAG Entries:</span>
                        <strong className="text-brand-600 dark:text-brand-400 font-bold">{patientRecsCount} records</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Patient Detail Panel */}
            {selectedPatientForView && (
              <div className="w-full md:w-[450px] flex flex-col md:border-l md:border-zinc-200 md:dark:border-zinc-800 md:pl-8 md:pt-0 pt-6 border-t border-zinc-200 dark:border-zinc-800 md:border-t-0 md:pb-0 pb-10">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-2xl shadow-sm">
                    {selectedPatientForView.name.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 m-0 tracking-tight">{selectedPatientForView.name}</h2>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Database Profile Context</span>
                  </div>
                </div>

                {/* Room Features */}
                <div className="mb-8">
                  <h3 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Home className="w-4 h-4" /> Room Environment
                  </h3>
                  <div className="flex flex-col gap-3">
                    {allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && r.content.startsWith('[Room Environment]')).length === 0 ? (
                      <p className="text-sm text-zinc-400 dark:text-zinc-500 italic bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">No room features added yet. Use the scanner to add some.</p>
                    ) : (
                      allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && r.content.startsWith('[Room Environment]')).map(r => (
                        <div key={r.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed shadow-sm hover:border-brand-300 dark:hover:border-brand-800 transition-colors">
                          {r.content.replace('[Room Environment] ', '')}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Medical Grounding Context */}
                <div>
                  <h3 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Medical Grounding
                  </h3>
                  <div className="flex flex-col gap-3">
                    {allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && !r.content.startsWith('[Room Environment]')).length === 0 ? (
                      <p className="text-sm text-zinc-400 dark:text-zinc-500 italic bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">No clinical grounding entries. Use the scanner or patient dashboard to add some.</p>
                    ) : (
                      allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && !r.content.startsWith('[Room Environment]')).map(r => (
                        <div key={r.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed shadow-sm hover:border-brand-300 dark:hover:border-brand-800 transition-colors">
                          {r.content.replace('[Grounding] ', '')}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Bottom Navigation Buttons */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white dark:bg-zinc-900 px-4 py-3 rounded-3xl shadow-xl border border-zinc-200 dark:border-zinc-800 z-50">
        <Button
          variant={activeTab === 'alerts' ? 'default' : 'ghost'}
          size="icon"
          className={activeTab === 'alerts' ? 'bg-brand-600 text-white rounded-2xl w-12 h-12 hover:opacity-90 shadow-md' : 'rounded-2xl w-12 h-12 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}
          onClick={() => setActiveTab('alerts')}
          title="Live Alerts"
        >
          <Bell className="w-6 h-6" />
        </Button>
        <Button
          variant={activeTab === 'scanner' ? 'default' : 'ghost'}
          size="icon"
          className={activeTab === 'scanner' ? 'bg-brand-600 text-white rounded-2xl w-12 h-12 hover:opacity-90 shadow-md' : 'rounded-2xl w-12 h-12 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}
          onClick={() => setActiveTab('scanner')}
          title="Environment Scanner"
        >
          <Scan className="w-6 h-6" />
        </Button>
        <Button
          variant={activeTab === 'patients' ? 'default' : 'ghost'}
          size="icon"
          className={activeTab === 'patients' ? 'bg-brand-600 text-white rounded-2xl w-12 h-12 hover:opacity-90 shadow-md' : 'rounded-2xl w-12 h-12 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}
          onClick={() => setActiveTab('patients')}
          title="Patient List"
        >
          <Users className="w-6 h-6" />
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
    </div>
  );
};

export default CaretakerDashboard;
