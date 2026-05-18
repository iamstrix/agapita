import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { Bell, Users, LogOut, MessageSquare, Camera, Scan, CheckCircle, XCircle, Loader2, Maximize, Minimize, X, RotateCw, Crosshair } from 'lucide-react';

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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isLandscape, setIsLandscape] = useState(
    window.innerWidth > window.innerHeight && window.innerWidth < 1024
  );

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w < 1024);
      setIsLandscape(w > h && w < 1024);
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
      // Release any active stream tracks to prevent webcam device lock
      if (videoRef.current && videoRef.current.srcObject) {
        const prevStream = videoRef.current.srcObject as MediaStream;
        prevStream.getTracks().forEach(track => track.stop());
      }

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

          const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/scan-grounding`, {
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

      const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/scan-grounding`, {
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

    let url = `${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/admin/records?content=${encodeURIComponent(content)}`;
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
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/admin/records`);
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
        const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/admin/patients`);
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

      let url = `${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/admin/records?content=${encodeURIComponent(content)}`;
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
    const newSocket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:8000', {
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

        if (Notification.permission === 'granted') {
          new Notification(`Alert from ${data.patient_name}`, {
            body: data.intent
          });
        }
      }
    });

    setSocket(newSocket);

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      newSocket.close();
    };
  }, [user.token]);

  return (
    <div style={{ ...styles.container, flexDirection: (isMobile && !isLandscape) ? 'column' : 'row' }}>
      {/* Sidebar — desktop: left column | portrait mobile: bottom bar | landscape: right rail */}
      <div style={
        isLandscape ? {
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '64px', backgroundColor: '#fff',
          borderLeft: '1px solid #e9ecef',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '8px', paddingTop: '24px', paddingBottom: '24px', zIndex: 100
        } : isMobile ? {
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: '70px', backgroundColor: '#fff',
          borderTop: '1px solid #e9ecef',
          display: 'flex', flexDirection: 'row',
          alignItems: 'center', justifyContent: 'space-around',
          padding: '0 8px', zIndex: 100
        } : styles.sidebar
      }>
        {/* Brand / Logo (hide on mobile) */}
        {!isMobile && (
          <div style={styles.brand}>
            <div style={styles.logo}>A</div>
            <h2 style={styles.brandName}>Agapita</h2>
          </div>
        )}

        {/* User Info (hide on mobile) */}
        {!isMobile && (
          <div style={styles.userInfo}>
            <p style={styles.userLabel}>Caretaker</p>
            <p style={styles.userName}>{user.username}</p>
          </div>
        )}

        {/* Nav Items */}
        <div style={isMobile ? (isLandscape ? { display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', alignItems: 'center' } : { display: 'flex', flexDirection: 'row', width: '100%', justifyContent: 'space-around' }) : styles.nav}>
          <div
            style={isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: activeTab === 'alerts' ? '#007AFF' : '#6c757d', cursor: 'pointer', padding: isLandscape ? '12px 0' : '8px', flex: 1 } : { ...styles.navItem, ...(activeTab === 'alerts' ? styles.navActive : {}) }}
            onClick={() => setActiveTab('alerts')}
          >
            {isMobile ? <Bell size={24} /> : <Bell size={20} />}
            {(!isLandscape || !isMobile) && <span style={isMobile ? { fontSize: '11px', fontWeight: 700 } : {}}>{isMobile ? 'Alerts' : 'Live Alerts'}</span>}
          </div>
          <div
            style={isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: activeTab === 'scanner' ? '#007AFF' : '#6c757d', cursor: 'pointer', padding: isLandscape ? '12px 0' : '8px', flex: 1 } : { ...styles.navItem, ...(activeTab === 'scanner' ? styles.navActive : {}) }}
            onClick={() => setActiveTab('scanner')}
          >
            {isMobile ? <Scan size={24} /> : <Scan size={20} />}
            {(!isLandscape || !isMobile) && <span style={isMobile ? { fontSize: '11px', fontWeight: 700 } : {}}>{isMobile ? 'Scanner' : 'Environment Scanner'}</span>}
          </div>
          <div
            style={isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: activeTab === 'patients' ? '#007AFF' : '#6c757d', cursor: 'pointer', padding: isLandscape ? '12px 0' : '8px', flex: 1 } : { ...styles.navItem, ...(activeTab === 'patients' ? styles.navActive : {}) }}
            onClick={() => setActiveTab('patients')}
          >
            {isMobile ? <Users size={24} /> : <Users size={20} />}
            {(!isLandscape || !isMobile) && <span style={isMobile ? { fontSize: '11px', fontWeight: 700 } : {}}>{isMobile ? 'Patients' : 'Patient List'}</span>}
          </div>
        </div>

        {(!isLandscape && !isMobile) && (
          <button style={styles.logoutBtn} onClick={onLogout}>
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      <main style={{
        ...styles.main,
        padding: isLandscape ? '16px' : (isMobile ? '16px' : '40px'),
        paddingBottom: (isMobile && !isLandscape) ? '86px' : (isLandscape ? '16px' : '40px'),
        paddingRight: isLandscape ? '80px' : (isMobile ? '16px' : '40px')
      }}>
        {activeTab === 'alerts' && (
          <>
            <header style={styles.header}>
              <h1 style={styles.title}>Patient Monitoring</h1>
              <p style={styles.subtitle}>Real-time intent interpretation activity</p>
            </header>

            <div style={styles.list}>
              {notifications.length === 0 ? (
                <div style={styles.emptyContainer}>
                  <MessageSquare size={48} color="#dee2e6" />
                  <p style={styles.empty}>Standing by for patient communications...</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div key={notif.id} style={styles.card}>
                    <div style={styles.cardLeft}>
                      <div style={styles.avatar}>
                        {notif.patient_name.charAt(0)}
                      </div>
                      <div style={styles.cardInfo}>
                        <span style={styles.patientName}>{notif.patient_name}</span>
                        <span style={styles.timestamp}>{notif.timestamp.toLocaleTimeString()}</span>
                      </div>
                    </div>
                    <div style={styles.cardRight}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px' }}>
                        <p style={styles.intent}>"{notif.intent}"</p>
                        {notif.image && (
                          <img
                            src={notif.image}
                            alt="Patient sketch"
                            style={{
                              width: '56px',
                              height: '56px',
                              borderRadius: '8px',
                              border: '1px solid #dee2e6',
                              objectFit: 'cover',
                              backgroundColor: '#fff',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                              flexShrink: 0
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'scanner' && (
          <div style={{ display: 'flex', flexDirection: isMobile && !isLandscape ? 'column' : 'row', gap: isMobile ? '16px' : '32px', height: isMobile && !isLandscape ? 'auto' : '100%', minHeight: isMobile ? 'auto' : '600px' }}>
            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
              .spinner { animation: spin 2s linear infinite; }
            `}</style>
            {/* Camera View */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <header style={{ ...styles.header, marginBottom: '16px' }}>
                <h1 style={styles.title}>Environment Scanner</h1>
                <p style={styles.subtitle}>Scan prescriptions and objects for AI grounding</p>
              </header>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  onClick={() => setScanMode('medication')}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
                    border: scanMode === 'medication' ? '2px solid #007AFF' : '1px solid #dee2e6',
                    backgroundColor: scanMode === 'medication' ? '#e7f1ff' : '#fff',
                    color: scanMode === 'medication' ? '#007AFF' : '#6c757d', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Medication
                </button>
                <button
                  onClick={() => setScanMode('environment')}
                  style={{
                    flex: 1, padding: '12px', borderRadius: '8px', fontWeight: 600, fontSize: '14px',
                    border: scanMode === 'environment' ? '2px solid #007AFF' : '1px solid #dee2e6',
                    backgroundColor: scanMode === 'environment' ? '#e7f1ff' : '#fff',
                    color: scanMode === 'environment' ? '#007AFF' : '#6c757d', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Objects
                </button>
              </div>

              {/* Target Patient Dropdown Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                  Target Patient for Grounding
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #dee2e6',
                    backgroundColor: '#fff', fontSize: '14px', fontWeight: 600, color: '#495057', cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  {patients.length === 0 ? (
                    <option value="">No patients assigned</option>
                  ) : (
                    patients.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.patient_id})</option>
                    ))
                  )}
                </select>
              </div>

              {/* Continuous Live Scan Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', backgroundColor: '#fff', border: '1px solid #dee2e6', borderRadius: '8px', padding: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>Continuous Scan</span>
                  <span style={{ fontSize: '11px', color: '#6c757d' }}>Auto-scans your area every 2 seconds</span>
                </div>
                <button
                  onClick={() => {
                    setIsLiveMode(!isLiveMode);
                    setIsProcessing(false);
                    setActivePromptItems([]);
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: '20px', fontWeight: 700, fontSize: '13px',
                    border: 'none',
                    backgroundColor: isLiveMode ? '#34C759' : '#dee2e6',
                    color: isLiveMode ? '#fff' : '#495057', cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: isLiveMode ? '0 2px 8px rgba(52,199,89,0.2)' : 'none'
                  }}
                >
                  {isLiveMode ? 'ON' : 'OFF'}
                </button>
              </div>

              <div
                ref={containerRef}
                style={isCameraFullscreen ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: '#1a1a1a',
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                } : {
                  flex: 1,
                  backgroundColor: '#1a1a1a',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: isMobile ? '350px' : 'auto'
                }}
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
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* Fullscreen Expand/Minimize Toggles */}
                {!isCameraFullscreen ? (
                  <button
                    onClick={() => setIsCameraFullscreen(true)}
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      width: '40px',
                      height: '40px',
                      borderRadius: '20px',
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      border: 'none',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 10
                    }}
                    title="Expand Viewfinder"
                  >
                    <Maximize size={18} />
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCameraFullscreen(false)}
                    style={{
                      position: 'absolute',
                      top: '20px',
                      right: '20px',
                      width: '44px',
                      height: '44px',
                      borderRadius: '22px',
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      border: 'none',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      zIndex: 1030
                    }}
                    title="Minimize Viewfinder"
                  >
                    <Minimize size={20} />
                  </button>
                )}

                {/* Floating Top Controls Overlay (Fullscreen only) */}
                {isCameraFullscreen && (
                  <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '20px',
                    right: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    zIndex: 1010,
                    pointerEvents: 'none'
                  }}>
                    {/* Header Row: Patient Capsule */}
                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', width: '100%', pointerEvents: 'auto' }}>
                      {/* Left: Patient Capsule */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '24px',
                        backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '13px', fontWeight: 600, backdropFilter: 'blur(10px)'
                      }}>
                        <Users size={14} style={{ opacity: 0.8 }} />
                        <select
                          value={selectedPatientId}
                          onChange={(e) => setSelectedPatientId(e.target.value)}
                          style={{
                            backgroundColor: 'transparent', border: 'none', color: '#fff', fontSize: '13px',
                            fontWeight: 600, outline: 'none', cursor: 'pointer', appearance: 'none', paddingRight: '12px'
                          }}
                        >
                          {patients.map(p => (
                            <option key={p.id} value={p.id} style={{ color: '#000' }}>{p.name}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: '9px', opacity: 0.6, marginLeft: '-8px', pointerEvents: 'none' }}>▼</span>
                      </div>
                    </div>

                    {/* Unified Mode Segment Selector capsule */}
                    <div style={{
                      display: 'flex', padding: '4px', borderRadius: '24px',
                      backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(10px)', alignSelf: 'center', width: '280px', marginTop: '4px',
                      pointerEvents: 'auto'
                    }}>
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
                            style={{
                              flex: 1, padding: '6px 12px', borderRadius: '20px',
                              border: 'none',
                              backgroundColor: isActive ? '#ffffff' : 'transparent',
                              color: isActive ? '#000000' : '#8e8e93',
                              fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                              transition: 'all 0.2s ease', outline: 'none'
                            }}
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

                  // Premium Color System
                  // Medications get a gorgeous violet/lavender accent
                  // Everyday objects get a bright royal blue accent
                  // Saved items morph into glowing emerald green!
                  const accentColor = isSaved ? '#34C759' : (isMedication ? '#AF52DE' : '#007AFF');
                  const shadowColor = isSaved ? 'rgba(52, 199, 89, 0.6)' : (isMedication ? 'rgba(175, 82, 222, 0.4)' : 'rgba(0, 122, 255, 0.4)');

                  return (
                    <div
                      key={item.id}
                      style={{
                        position: 'absolute',
                        top,
                        left,
                        width,
                        height,
                        border: '1.5px solid #ffffff',
                        borderRadius: '8px',
                        pointerEvents: 'auto',
                        zIndex: 1020,
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        animation: 'fadeInScale 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
                      } as React.CSSProperties}
                    >
                      <style>{`
                        @keyframes fadeInScale {
                          from { opacity: 0; transform: scale(0.95); }
                          to { opacity: 1; transform: scale(1); }
                        }
                      `}</style>

                      {/* Crisp high-contrast solid tag directly floating above the box */}
                      <div style={{
                        position: 'absolute',
                        top: ymin < 12 ? '4px' : '-24px', // Position inside if too close to the top boundary
                        left: '0',
                        backgroundColor: 'rgba(26, 26, 26, 0.92)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                        transition: 'all 0.2s'
                      }}>
                        <span style={{ color: '#ffffff' }}>{item.name}</span>
                      </div>

                      {/* Minimalist Action Pill inside the center/bottom of the box */}
                      <div style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '6px',
                        backgroundColor: 'rgba(26, 26, 26, 0.95)',
                        padding: '4px',
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.15)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                      }}>
                        {isSaved ? (
                          <div style={{
                            padding: '4px 10px',
                            color: '#34C759',
                            fontSize: '11px',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            animation: 'pulseSaved 1.5s infinite'
                          }}>
                            <CheckCircle size={12} style={{ flexShrink: 0 }} /> Saved
                            <style>{`
                              @keyframes pulseSaved {
                                0% { opacity: 0.8; }
                                50% { opacity: 1; }
                                100% { opacity: 0.8; }
                              }
                            `}</style>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleAddBoxItem(item)}
                              style={{
                                border: 'none',
                                backgroundColor: '#34C759',
                                color: '#fff',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 6px rgba(52, 199, 89, 0.4)'
                              }}
                              title="Add to Patient Grounding"
                            >
                              <CheckCircle size={14} />
                            </button>
                            <button
                              onClick={() => handleDismissBoxItem(item.id)}
                              style={{
                                border: 'none',
                                backgroundColor: 'rgba(255,255,255,0.15)',
                                color: '#fff',
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
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
                <div style={{ position: 'absolute', bottom: '24px', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '12px', zIndex: 1010 }}>

                  {/* Zoom Quick Selectors Capsule */}
                  {zoomCapabilities && (
                    <div style={{
                      display: 'flex',
                      gap: '4px',
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: 'rgba(0, 0, 0, 0.65)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: '4px',
                      borderRadius: '24px',
                      pointerEvents: 'auto',
                      zIndex: 1010
                    }}>
                      {[1, 2, 4].map(z => {
                        const isActive = Math.abs(zoomValue - z) < 0.1;
                        return (
                          <button
                            key={z}
                            onClick={() => applyZoom(z)}
                            style={{
                              width: '32px', height: '32px', borderRadius: '16px',
                              border: 'none',
                              backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                              color: isActive ? '#ffffff' : '#8e8e93',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s',
                              outline: 'none'
                            }}
                          >
                            {z}x
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Bottom Controls Row: Flip Camera | White iOS Shutter | Reset Reticle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', pointerEvents: 'auto' }}>
                    
                    {/* Left: Flip Camera Button */}
                    <button
                      onClick={handleFlipCamera}
                      style={{
                        width: '48px', height: '48px', borderRadius: '24px',
                        backgroundColor: 'rgba(0, 0, 0, 0.65)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', outline: 'none', transition: 'all 0.2s'
                      }}
                      title="Flip Camera"
                    >
                      <RotateCw size={18} />
                    </button>

                    {/* Center: iOS/Mockup Double-Ring White Shutter */}
                    {isLiveMode ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div className="radar" style={{
                          width: '48px', height: '48px', borderRadius: '24px',
                          backgroundColor: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 0 16px rgba(52,199,89,0.6)',
                          animation: 'pulse 1.5s infinite'
                        }}>
                          <span style={{ width: '12px', height: '12px', borderRadius: '6px', backgroundColor: '#fff' }} />
                        </div>
                        <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700, textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                          {isProcessing ? 'Analyzing...' : 'Scanning Room...'}
                        </span>
                        <style>{`
                          @keyframes pulse {
                            0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(52,199,89, 0.7); }
                            70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(52,199,89, 0); }
                            100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(52,199,89, 0); }
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
                        style={{
                          width: '72px', height: '72px', borderRadius: '36px',
                          border: '4px solid #ffffff', padding: '4px',
                          backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: isProcessing ? 'not-allowed' : 'pointer',
                          boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
                          transition: 'all 0.2s', outline: 'none'
                        }}
                      >
                        <div style={{
                          width: '56px', height: '56px', borderRadius: '28px',
                          backgroundColor: isProcessing ? '#8e8e93' : '#ffffff',
                          transition: 'background-color 0.2s'
                        }} />
                      </button>
                    )}

                    {/* Right: Reset Viewfinder Reticle */}
                    <button
                      onClick={() => setActivePromptItems([])}
                      style={{
                        width: '48px', height: '48px', borderRadius: '24px',
                        backgroundColor: 'rgba(0, 0, 0, 0.65)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', outline: 'none', transition: 'all 0.2s'
                      }}
                      title="Reset Reticle overlays"
                    >
                      <Crosshair size={18} />
                    </button>

                  </div>

                  {(isProcessing && !isLiveMode) && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        <Loader2 className="spinner" size={14} color="#fff" />
                        Scanning...
                      </span>
                      <button 
                        onClick={handleCancelAnalysis}
                        style={{
                          backgroundColor: '#FF3B30', color: '#fff', border: 'none',
                          padding: '6px 12px', borderRadius: '16px', fontSize: '12px',
                          fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
                          gap: '4px', boxShadow: '0 4px 8px rgba(255,59,48,0.3)', transition: 'background-color 0.2s',
                          outline: 'none'
                        }}
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Staged Items Inbox */}
            <div style={{
              width: isMobile && !isLandscape ? '100%' : '400px',
              display: 'flex', flexDirection: 'column',
              borderLeft: isMobile && !isLandscape ? 'none' : '1px solid #e9ecef',
              borderTop: isMobile && !isLandscape ? '1px solid #e9ecef' : 'none',
              paddingLeft: isMobile && !isLandscape ? '0' : '32px',
              paddingTop: isMobile && !isLandscape ? '16px' : '0',
              paddingBottom: isMobile && !isLandscape ? '40px' : '0'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px 0', color: '#1a1a1a' }}>Staged for Grounding</h2>
              <div style={{ flex: isMobile && !isLandscape ? 'none' : 1, overflowY: isMobile && !isLandscape ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px' }}>
                {stagedItems.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#adb5bd', marginTop: '40px' }}>
                    <Scan size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <p>No items scanned yet.</p>
                  </div>
                ) : (
                  stagedItems.map(item => (
                    <div key={item.id} style={{ backgroundColor: '#fff', border: '1px solid #dee2e6', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#007AFF', textTransform: 'uppercase', letterSpacing: '1px' }}>{item.type}</span>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 8px 0', color: '#1a1a1a' }}>{item.name}</h3>
                      <p style={{ fontSize: '14px', color: '#495057', margin: '0 0 16px 0', lineHeight: 1.4 }}>{item.details}</p>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => addGroundingFactor(item)} style={{ flex: 1, backgroundColor: '#e7f1ff', color: '#007AFF', border: 'none', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                          <CheckCircle size={16} /> Add
                        </button>
                        <button onClick={() => discardStagedItem(item.id)} style={{ flex: 1, backgroundColor: '#f8f9fa', color: '#6c757d', border: '1px solid #dee2e6', padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                          <XCircle size={16} /> Discard
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
          <div style={{ display: 'flex', gap: '32px', height: isMobile && !isLandscape ? 'auto' : '100%', minHeight: isMobile ? 'auto' : '600px', flexDirection: (isMobile && !isLandscape) ? 'column' : 'row' }}>
            {/* Patient Cards Grid */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <header style={{ ...styles.header, marginBottom: '24px' }}>
                <h1 style={styles.title}>Assigned Patients</h1>
                <p style={styles.subtitle}>Manage patient context and view configurations</p>
              </header>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {patients.map(p => {
                  const isSelected = selectedPatientForView?.id === p.id;
                  const patientRecsCount = allRecords.filter(r => r.patient_id_fk === p.id).length;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatientForView(p)}
                      style={{
                        backgroundColor: '#fff', border: isSelected ? '2px solid #007AFF' : '1px solid #dee2e6',
                        borderRadius: '16px', padding: '24px', cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: isSelected ? '0 8px 24px rgba(0,122,255,0.08)' : '0 4px 12px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: isSelected ? '#007AFF' : '#e7f1ff', color: isSelected ? '#fff' : '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#1a1a1a' }}>{p.name}</h3>
                          <span style={{ fontSize: '12px', color: '#6c757d' }}>ID: {p.patient_id}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#495057', borderTop: '1px solid #f1f3f5', paddingTop: '12px' }}>
                        <span>RAG Database Entries:</span>
                        <strong style={{ color: '#007AFF' }}>{patientRecsCount} records</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Patient Detail Panel */}
            {selectedPatientForView && (
              <div style={{
                width: (isMobile && !isLandscape) ? '100%' : '450px',
                display: 'flex', flexDirection: 'column',
                borderLeft: (isMobile && !isLandscape) ? 'none' : '1px solid #e9ecef',
                borderTop: (isMobile && !isLandscape) ? '1px solid #e9ecef' : 'none',
                paddingLeft: (isMobile && !isLandscape) ? '0' : '32px',
                paddingTop: (isMobile && !isLandscape) ? '24px' : '0',
                paddingBottom: (isMobile && !isLandscape) ? '40px' : '0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '24px', backgroundColor: '#e7f1ff', color: '#007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '20px' }}>
                    {selectedPatientForView.name.charAt(0)}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#1a1a1a' }}>{selectedPatientForView.name}</h2>
                    <span style={{ fontSize: '13px', color: '#6c757d' }}>Database Profile Context</span>
                  </div>
                </div>

                {/* Room Features */}
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>🛋️ Room Environment Config</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && r.content.startsWith('[Room Environment]')).length === 0 ? (
                      <p style={{ fontSize: '14px', color: '#adb5bd', fontStyle: 'italic' }}>No room features added yet. Use the scanner to add some.</p>
                    ) : (
                      allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && r.content.startsWith('[Room Environment]')).map(r => (
                        <div key={r.id} style={{ backgroundColor: '#fff', border: '1px solid #e9ecef', borderRadius: '8px', padding: '12px', fontSize: '14px', color: '#495057', lineHeight: 1.4 }}>
                          {r.content.replace('[Room Environment] ', '')}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Medical Grounding Context */}
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>💊 Medical & Clinical Grounding</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && !r.content.startsWith('[Room Environment]')).length === 0 ? (
                      <p style={{ fontSize: '14px', color: '#adb5bd', fontStyle: 'italic' }}>No clinical grounding entries. Use the scanner or patient dashboard to add some.</p>
                    ) : (
                      allRecords.filter(r => r.patient_id_fk === selectedPatientForView.id && !r.content.startsWith('[Room Environment]')).map(r => (
                        <div key={r.id} style={{ backgroundColor: '#fff', border: '1px solid #e9ecef', borderRadius: '8px', padding: '12px', fontSize: '14px', color: '#495057', lineHeight: 1.4 }}>
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
      </main>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    backgroundColor: '#f8f9fa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  },
  sidebar: {
    width: '260px',
    backgroundColor: '#fff',
    borderRight: '1px solid #e9ecef',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px'
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '40px'
  },
  logo: {
    width: '40px',
    height: '40px',
    backgroundColor: '#007AFF',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '20px'
  },
  brandName: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0
  },
  userInfo: {
    marginBottom: '32px',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px'
  },
  userLabel: {
    fontSize: '12px',
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    margin: '0 0 4px 0'
  },
  userName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1a1a1a',
    margin: 0
  },
  nav: {
    flex: 1
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    color: '#495057',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: '4px'
  },
  navActive: {
    backgroundColor: '#e7f1ff',
    color: '#007AFF'
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    padding: '12px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '8px',
    color: '#dc3545',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: 'auto'
  },
  main: {
    flex: 1,
    padding: '40px',
    overflowY: 'auto'
  },
  header: {
    marginBottom: '32px'
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0 0 8px 0'
  },
  subtitle: {
    fontSize: '18px',
    color: '#6c757d',
    margin: 0
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '1000px'
  },
  card: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: '1px solid #f1f3f5'
  },
  cardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  avatar: {
    width: '48px',
    height: '48px',
    backgroundColor: '#007AFF',
    color: '#fff',
    borderRadius: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: 600
  },
  cardInfo: {
    display: 'flex',
    flexDirection: 'column'
  },
  patientName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1a1a1a'
  },
  timestamp: {
    fontSize: '14px',
    color: '#adb5bd'
  },
  cardRight: {
    flex: 1,
    marginLeft: '40px',
    textAlign: 'right'
  },
  intent: {
    fontSize: '22px',
    fontWeight: 600,
    color: '#495057',
    fontStyle: 'italic',
    margin: 0
  },
  emptyContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '100px 0',
    textAlign: 'center'
  },
  empty: {
    marginTop: '16px',
    fontSize: '18px',
    color: '#adb5bd'
  }
};

export default CaretakerDashboard;
