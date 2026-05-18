import React, { useRef, useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
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
  Home
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
  const [options, setOptions] = useState<string[]>([]);
  const [intent, setIntent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientRecords, setPatientRecords] = useState<string[]>([]);
  const [originalSketch, setOriginalSketch] = useState<string | null>(null);
  
  const [currentTime, setCurrentTime] = useState(new Date());
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

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Configure panel state
  const [newEntry, setNewEntry] = useState('');
  const [configRecords, setConfigRecords] = useState<{id: number; content: string}[]>([]);
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
    } catch {}
  }, []);

  const handleUpdateVlm = async (newVlm: string) => {
    setActiveVlm(newVlm);
    try {
      await fetch(`${SERVER_URL}/api/admin/config/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlm_model: newVlm })
      });
    } catch {}
  };

  const handleUpdateTime = async (time: string, isReal: boolean) => {
    try {
      await fetch(`${SERVER_URL}/api/admin/config/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mock_time: time, use_real_time: isReal })
      });
    } catch {}
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
    } catch {}
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
    } catch {}
  };

  useEffect(() => {
    if (mode === 'configure' || mode === 'environment') loadConfigRecords();
  }, [mode, loadConfigRecords]);
  // ─────────────────────────────────────────────────────────────────────────

  // Canvas Drawing Logic
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

  const endDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
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

    setMode('processing');
    
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
      patient_id: user.username
    });
  };

  const renderContent = () => {
    switch (mode) {
      case 'sketch':

        if (isLandscape) {
          const navW = 56;
          const actionColW = Math.round(window.innerWidth * 0.28);
          const canvasW = window.innerWidth - navW - actionColW - 8;
          const canvasH = window.innerHeight - 8;

          return (
            <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: `calc(100vw - ${navW}px)`, overflow: 'hidden' }}>
              {/* Canvas — left */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', padding: '4px 0 4px 4px' }}>
                <canvas
                  ref={canvasRef}
                  width={canvasW}
                  height={canvasH}
                  style={{ ...styles.canvas, touchAction: 'none', width: '100%', height: '100%' }}
                  onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={endDrawing} onMouseLeave={endDrawing}
                  onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
                  onTouchMove={(e) => { e.preventDefault(); draw(e); }}
                  onTouchEnd={endDrawing}
                />
              </div>

              {/* Action column — middle: Submit top half, Clear bottom half */}
              <div style={{ width: `${actionColW}px`, display: 'flex', flexDirection: 'column', padding: '4px', gap: '4px' }}>
                <button
                  id="interpret-btn"
                  onClick={handleInterpret}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '8px', border: '2px solid #007AFF', borderRadius: '12px',
                    backgroundColor: '#007AFF', color: '#fff',
                    fontSize: '16px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  <Send size={28} />
                  <span>Submit</span>
                </button>
                <button
                  id="clear-btn"
                  onClick={clearCanvas}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '8px', border: '2px solid #6c757d', borderRadius: '12px',
                    backgroundColor: '#f8f9fa', color: '#495057',
                    fontSize: '16px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  <Eraser size={28} />
                  <span>Clear</span>
                </button>
              </div>
            </div>
          );
        }

        return (
          <div style={styles.canvasWrapper}>
            {!isMobile && (
              <div style={styles.toolbar}>
                <div>
                  <h3 style={styles.toolTitle}>Communication Canvas</h3>
                  <p style={styles.toolSub}>Sketch your need below</p>
                </div>
              </div>
            )}
            
            <div style={{...styles.sketchLayout, flexDirection: 'column'}}>
              <div style={{...styles.canvasContainer, flex: 1}}>
                <canvas
                  ref={canvasRef}
                  width={Math.min(window.innerWidth - 16, 800)}
                  height={Math.round(window.innerHeight * 0.55)}
                  style={{...styles.canvas, touchAction: 'none'}}
                  onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={endDrawing} onMouseLeave={endDrawing}
                  onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
                  onTouchMove={(e) => { e.preventDefault(); draw(e); }}
                  onTouchEnd={endDrawing}
                />
              </div>

              {/* Portrait mobile: Send/Clear row below canvas */}
              <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', padding: '12px 8px' }}>
                <button id="interpret-btn" style={{...styles.actionBtnLargePrimary, flex: 1, height: '64px', fontSize: '16px'}} onClick={handleInterpret}>
                  <Send size={22} /><span>Send</span>
                </button>
                <button id="clear-btn" style={{...styles.actionBtnLargeSecondary, flex: 1, height: '64px', fontSize: '16px'}} onClick={clearCanvas}>
                  <Eraser size={22} /><span>Clear</span>
                </button>
              </div>
            </div>

            {error && (
              <div style={styles.errorAlert}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}
          </div>
        );

      case 'processing':
        return (
          <div className="zen-container">
            <div className="zen-orb zen-orb-1" />
            <div className="zen-orb zen-orb-2" />
            
            <div className="zen-content">
              <div className="zen-spinner-ring" />
              <h2 style={styles.overlayTitle}>Synthesizing Intent...</h2>
              <p style={styles.overlaySub}>Consulting your clinical history and personal preferences</p>
            </div>
          </div>
        );

      case 'confirming':
        return (
          <div style={styles.canvasWrapper}>
            <div style={styles.sketchLayout}>
              {/* Center Area: Same space as the Canvas */}
              <div style={{...styles.canvasContainer, flex: 1}}>
                <div style={styles.mainConfirmationFull}>
                  <h2 style={styles.title}>Does this look right?</h2>
                  <div style={styles.intentPreview}>
                    <p style={styles.intentLabel}>Synthesized Request:</p>
                    <h1 style={styles.intentNatural}>"{intent}"</h1>
                  </div>

                  <div style={styles.alternativesSectionConfirming}>
                    <div style={styles.sketchThumbnailSmall}>
                      <p style={styles.thumbLabel}>Your Sketch</p>
                      {originalSketch && <img src={originalSketch} style={styles.thumbImg} alt="Original" />}
                    </div>

                    <div style={styles.optionsArea}>
                      <p style={styles.optionsLabel}>Not what you meant? Try these:</p>
                      <div style={styles.compactGrid}>
                        {options.map((option, idx) => (
                          <button 
                            key={idx} 
                            style={styles.compactOption}
                            onClick={() => handleSelectOption(option)}
                          >
                            <ImageIcon size={20} color="#007AFF" />
                            <span style={styles.compactText}>{option}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Side: Exact same coordinates as Sketch Page */}
              <div style={styles.sideActions}>
                <button 
                  style={styles.actionBtnLargePrimary} 
                  onClick={handleSendInterpretation}
                >
                  <Send size={32} />
                  <span>Send</span>
                </button>
                <button 
                  style={styles.actionBtnLargeSecondary} 
                  onClick={clearCanvas}
                >
                  <Eraser size={32} />
                  <span>Redraw</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'result':
        return (
          <div style={styles.contentCard}>
            <div style={styles.successIcon}>
              <CheckCircle size={80} color="#34C759" />
            </div>
            <h2 style={styles.title}>Message Dispatched</h2>
            <p style={styles.subtitle}>Your caretaker has been notified with the following intent:</p>
            
            <div style={styles.intentBox}>
              "{intent}"
            </div>

            <button style={styles.primaryBtnLarge} onClick={() => {
              setMode('sketch');
              clearCanvas();
            }}>
              New Request
            </button>
          </div>
        );

      case 'records':
        return (
          <div style={styles.canvasWrapper}>
            <div style={styles.toolbar}>
              <div>
                <h3 style={styles.toolTitle}>Active Medical Context</h3>
                <p style={styles.toolSub}>Real-time monitor of assigned RAG records</p>
              </div>
            </div>
            
            <div style={styles.recordsList}>
              {patientRecords.length === 0 ? (
                <div style={styles.emptyRecords}>
                  <AlertCircle size={48} color="#ccc" />
                  <p>No medical records are currently assigned to your profile.</p>
                </div>
              ) : (
                patientRecords.map((rec, i) => (
                  <div key={i} style={styles.recordCardItem}>
                    <div style={styles.recordIndicator} />
                    <p style={styles.recordContentText}>{rec}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      case 'configure':
      case 'environment':
        const isEnv = mode === 'environment';
        const displayRecords = isEnv 
          ? configRecords.filter(r => r.content.startsWith('[Room Environment]')) 
          : configRecords.filter(r => !r.content.startsWith('[Room Environment]'));

        return (
          <div style={styles.canvasWrapper}>
            <div style={styles.toolbar}>
              <div>
                <h3 style={styles.toolTitle}>{isEnv ? 'Room Grounding Editor' : 'Medical Context Editor'}</h3>
                <p style={styles.toolSub}>{isEnv ? 'Add physical features of the room (TV, windows, doors)' : 'Add facts the AI will use when interpreting your sketches'}</p>
              </div>
            </div>

            {/* Input Form */}
            <div style={styles.configCard}>
              <label style={styles.configLabel}>{isEnv ? 'New Room Feature' : 'New Context Entry'}</label>
              <textarea 
                value={newEntry}
                onChange={(e) => setNewEntry(e.target.value)}
                placeholder={isEnv ? "e.g., The room has a smart TV. The window faces east." : "e.g., Patient usually asks for water at 3 PM..."}
                style={{...styles.configTextarea, minHeight: '120px'}}
              />
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button 
                  style={{...styles.primaryBtn, backgroundColor: configStatus === 'saved' ? '#34C759' : '#007AFF'}}
                  onClick={() => handleSaveRecord(isEnv)}
                  disabled={configStatus === 'saving'}
                >
                  {configStatus === 'saving' ? <Loader2 size={16} /> : <PlusCircle size={16} />}
                  {configStatus === 'saving' ? 'Saving...' : 'Save to AI Context'}
                </button>
              </div>
            </div>

            {/* Saved Records List */}
            <div style={{ marginTop: '8px' }}>
              <p style={{ ...styles.configLabel, marginBottom: '12px' }}>Saved {isEnv ? 'Features' : 'Context'} ({displayRecords.length} entries)</p>
              {displayRecords.length === 0 ? (
                <div style={styles.emptyRecords}>
                  <Settings size={40} color="#ccc" />
                  <p>No entries yet. Add one above.</p>
                </div>
              ) : (
                <div style={styles.recordsList}>
                  {displayRecords.map(rec => (
                    <div key={rec.id} style={styles.configRecordRow}>
                      <p style={{ ...styles.recordContentText, flex: 1 }}>{rec.content.replace('[Room Environment] ', '')}</p>
                      <button
                        id={`delete-record-${rec.id}`}
                        style={styles.deleteBtn}
                        onClick={() => handleDeleteRecord(rec.id)}
                        title="Remove from AI context"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

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
    <div style={{...styles.container, flexDirection: (isMobile && !isLandscape) ? 'column' : 'row'}}>
      <style>{`
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinners {
          -moz-appearance: textfield;
        }
      `}</style>

      {/* Main Content Area — bottom-padded in portrait, right-padded in landscape */}
      <div style={{...styles.main, paddingBottom: (isMobile && !isLandscape) ? '70px' : '0', paddingRight: isLandscape ? '0' : '0'}}>
        {renderContent()}
      </div>

      {/* Sidebar — desktop: left column | portrait mobile: bottom bar | landscape: right rail */}
      <div style={
        isLandscape ? {
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '56px', backgroundColor: '#fff',
          borderLeft: '1px solid #e9ecef',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '4px', paddingTop: '8px', paddingBottom: '8px', zIndex: 100
        } : isMobile ? {
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: '60px', backgroundColor: '#fff',
          borderTop: '1px solid #e9ecef',
          display: 'flex', flexDirection: 'row',
          alignItems: 'center', justifyContent: 'space-around',
          padding: '0 8px', zIndex: 100
        } : styles.sidebar
      }>

        {(isMobile || isLandscape) ? (
          // Mobile (portrait + landscape): icon-only nav
          <>
            <button style={{...styles.navItem, ...(mode === 'sketch' ? styles.navActive : {}), padding: '8px', flexDirection: 'column', fontSize: '9px', gap: '2px'}} onClick={() => setMode('sketch')}>
              <MousePointer2 size={20} /><span>Canvas</span>
            </button>
            <button style={{...styles.navItem, ...(mode === 'records' ? styles.navActive : {}), padding: '8px', flexDirection: 'column', fontSize: '9px', gap: '2px'}} onClick={() => setMode('records')}>
              <CheckCircle size={20} /><span>Records</span>
            </button>
            <button style={{...styles.navItem, ...(mode === 'configure' ? styles.navActive : {}), padding: '8px', flexDirection: 'column', fontSize: '9px', gap: '2px'}} onClick={() => setMode('configure')}>
              <Settings size={20} /><span>Config</span>
            </button>
            <button style={{...styles.navItem, ...(mode === 'environment' ? styles.navActive : {}), padding: '8px', flexDirection: 'column', fontSize: '9px', gap: '2px'}} onClick={() => setMode('environment')}>
              <Home size={20} /><span>Room</span>
            </button>
            <button style={{...styles.navItem, padding: '8px', flexDirection: 'column', fontSize: '9px', gap: '2px', color: '#dc3545'}} onClick={onLogout}>
              <LogOut size={20} /><span>Exit</span>
            </button>
          </>
        ) : (
          // Desktop: full sidebar
          <>
            <div style={styles.brand}>
              <div style={styles.logo}>A</div>
              <h2 style={styles.brandName}>Agapita</h2>
            </div>
            
            <div style={styles.userInfo}>
              <p style={styles.userLabel}>Patient</p>
              <p style={styles.userName}>{user.username}</p>
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e9ecef', textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 4px 0' }}>{useRealTime ? 'Time' : 'Time Override'}</p>
                <p style={{ fontSize: '20px', fontWeight: 700, color: '#007AFF', margin: 0 }}>
                  {`${dispH}:${dispM} ${dispIsPm ? 'PM' : 'AM'}`}
                </p>
              </div>
            </div>

            <div style={styles.nav}>
              <button style={{...styles.navItem, ...(mode === 'sketch' ? styles.navActive : {})}} onClick={() => setMode('sketch')}>
                <MousePointer2 size={20} /><span>Canvas</span>
              </button>
              <button style={{...styles.navItem, ...(mode === 'records' ? styles.navActive : {})}} onClick={() => setMode('records')}>
                <CheckCircle size={20} /><span>Medical Records</span>
              </button>
              <button style={{...styles.navItem, ...(mode === 'configure' ? styles.navActive : {})}} onClick={() => setMode('configure')}>
                <Settings size={20} /><span>Configure AI</span>
              </button>
              <button style={{...styles.navItem, ...(mode === 'environment' ? styles.navActive : {})}} onClick={() => setMode('environment')}>
                <Home size={20} /><span>Room Config</span>
              </button>
            </div>

            <div style={{ width: '100%', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: '#6c757d', textTransform: 'uppercase', textAlign: 'center', fontWeight: 700 }}>Custom Time</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '10px', color: '#495057' }}>
                <span>Custom</span>
                <div
                  onClick={() => {
                    const goCustom = useRealTime;
                    setUseRealTime(!goCustom);
                    if (goCustom) {
                      const t = mockTime || currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                      handleUpdateTime(t, false);
                    } else {
                      handleUpdateTime('', true);
                    }
                  }}
                  style={{
                    width: '32px', height: '18px', borderRadius: '9px', cursor: 'pointer',
                    backgroundColor: !useRealTime ? '#007AFF' : '#ced4da',
                    position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
                    userSelect: 'none'
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '2px',
                    left: !useRealTime ? '16px' : '2px',
                    width: '14px', height: '14px', borderRadius: '50%',
                    backgroundColor: '#fff', transition: 'left 0.2s'
                  }} />
                </div>
              </div>
              <input
                type="time"
                value={mockTime}
                disabled={useRealTime}
                onChange={(e) => {
                  const val = e.target.value;
                  setMockTime(val);
                  if (/^\d{2}:\d{2}$/.test(val)) {
                    handleUpdateTime(val, false);
                  }
                }}
                style={{ width: '100%', padding: '6px', fontSize: '11px', borderRadius: '6px', border: '1px solid #ced4da', backgroundColor: useRealTime ? '#e9ecef' : '#fff', cursor: useRealTime ? 'not-allowed' : 'text', boxSizing: 'border-box' }}
              />
            </div>

            <button style={styles.logoutBtn} onClick={onLogout}>
              <LogOut size={20} />
              <span>Exit System</span>
            </button>
          </>
        )}
      </div>
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
    width: '100px',
    backgroundColor: '#fff',
    borderRight: '1px solid #e9ecef',
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 12px',
    alignItems: 'center'
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '48px'
  },
  logo: {
    width: '50px',
    height: '50px',
    backgroundColor: '#007AFF',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '24px'
  },
  brandName: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#007AFF',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  userInfo: {
    marginBottom: '32px',
    padding: '12px 8px',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    textAlign: 'center',
    width: '100%'
  },
  userLabel: {
    fontSize: '12px',
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    margin: '0 0 4px 0'
  },
  userName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: 0,
    wordBreak: 'break-word'
  },
  nav: {
    flex: 1
  },
  navItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '16px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '12px',
    color: '#495057',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
    marginBottom: '8px'
  },
  navActive: {
    backgroundColor: '#e7f1ff',
    color: '#007AFF'
  },
  logoutBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '16px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '12px',
    color: '#dc3545',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    cursor: 'pointer',
    marginTop: 'auto'
  },
  main: {
    flex: 1,
    padding: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto'
  },
  canvasWrapper: {
    width: '100%',
    maxWidth: '1400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px'
  },
  sketchLayout: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '32px',
    width: '100%'
  },
  sideActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    width: '240px'
  },
  actionBtnLargePrimary: {
    flex: 1,
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontSize: '18px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 12px 24px rgba(0, 122, 255, 0.3)',
    transition: 'all 0.2s'
  },
  actionBtnLargeSecondary: {
    flex: 1,
    backgroundColor: '#fff',
    color: '#495057',
    border: '2px solid #dee2e6',
    borderRadius: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontSize: '18px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  toolTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0 0 4px 0'
  },
  toolSub: {
    fontSize: '16px',
    color: '#6c757d',
    margin: 0
  },
  actions: {
    display: 'flex',
    gap: '12px'
  },
  primaryBtn: {
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0, 122, 255, 0.2)'
  },
  secondaryBtn: {
    backgroundColor: '#fff',
    color: '#495057',
    border: '1px solid #dee2e6',
    padding: '10px 20px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  canvasContainer: {
    backgroundColor: '#f1f3f5',
    borderRadius: '24px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.06)',
    padding: '32px',
    display: 'flex',
    justifyContent: 'center',
    border: '1px solid #dee2e6'
  },
  canvas: {
    backgroundColor: '#fff',
    cursor: 'crosshair',
    touchAction: 'none',
    border: '2px solid #adb5bd',
    borderRadius: '12px',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#fff5f5',
    color: '#e03131',
    borderRadius: '8px',
    border: '1px solid #ffc9c9',
    fontSize: '14px',
    fontWeight: 500
  },
  overlay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center'
  },
  spinner: {
    color: '#007AFF',
    animation: 'spin 2s linear infinite'
  },
  overlayTitle: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#1a1a1a',
    margin: '0 0 12px 0',
    letterSpacing: '-0.5px'
  },
  overlaySub: {
    fontSize: '20px',
    color: '#6c757d',
    margin: 0,
    fontWeight: 400
  },
  contentCard: {
    backgroundColor: '#fff',
    padding: '48px',
    borderRadius: '24px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '600px',
    textAlign: 'center',
    border: '1px solid #e9ecef'
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0 0 12px 0'
  },
  subtitle: {
    fontSize: '18px',
    color: '#6c757d',
    margin: '0 0 32px 0',
    lineHeight: 1.5
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px',
    marginBottom: '32px'
  },
  optionCard: {
    backgroundColor: '#f8f9fa',
    border: '2px solid transparent',
    padding: '24px',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px'
  },
  iconBox: {
    width: '64px',
    height: '64px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
  },
  optionText: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#495057',
    textTransform: 'capitalize'
  },
  textLink: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#007AFF',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline'
  },
  successIcon: {
    marginBottom: '24px'
  },
  intentBox: {
    backgroundColor: '#f0fff4',
    border: '1px solid #c6f6d5',
    padding: '24px',
    borderRadius: '16px',
    fontSize: '24px',
    fontWeight: 600,
    color: '#22543d',
    margin: '0 0 40px 0',
    fontStyle: 'italic'
  },
  primaryBtnLarge: {
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    padding: '16px 40px',
    borderRadius: '12px',
    fontWeight: 600,
    fontSize: '18px',
    cursor: 'pointer',
    boxShadow: '0 10px 20px rgba(0, 122, 255, 0.2)'
  },
  recordsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
    padding: '10px 0'
  },
  recordCardItem: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '16px',
    border: '1px solid #e9ecef',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
    display: 'flex',
    alignItems: 'center',
    gap: '20px'
  },
  recordIndicator: {
    width: '6px',
    height: '40px',
    backgroundColor: '#007AFF',
    borderRadius: '3px'
  },
  recordContentText: {
    fontSize: '18px',
    fontWeight: 500,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.5
  },
  emptyRecords: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 0',
    color: '#adb5bd',
    gap: '16px',
    textAlign: 'center'
  },
  confirmationLayout: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '900px',
    gap: '40px'
  },
  mainConfirmation: {
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '24px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
    textAlign: 'center',
    border: '1px solid #e9ecef'
  },
  intentPreview: {
    margin: '32px 0',
    padding: '32px',
    backgroundColor: '#f0f7ff',
    borderRadius: '16px',
    border: '1px solid #d0e7ff'
  },
  intentLabel: {
    fontSize: '14px',
    color: '#007AFF',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    margin: '0 0 8px 0'
  },
  intentNatural: {
    fontSize: '36px',
    fontWeight: 800,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.2
  },
  confirmActions: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center'
  },
  sendLargeBtn: {
    backgroundColor: '#34C759',
    color: '#fff',
    border: 'none',
    padding: '18px 40px',
    borderRadius: '16px',
    fontWeight: 700,
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    boxShadow: '0 10px 20px rgba(52, 199, 89, 0.2)'
  },
  redrawBtn: {
    backgroundColor: '#f8f9fa',
    color: '#6c757d',
    border: '1px solid #dee2e6',
    padding: '18px 30px',
    borderRadius: '16px',
    fontWeight: 600,
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  alternativesSection: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start'
  },
  sketchThumbnail: {
    width: '200px',
    backgroundColor: '#fff',
    padding: '12px',
    borderRadius: '16px',
    border: '1px solid #e9ecef',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
  },
  thumbLabel: {
    fontSize: '12px',
    color: '#6c757d',
    fontWeight: 600,
    margin: '0 0 8px 0',
    textAlign: 'center'
  },
  thumbImg: {
    width: '100%',
    height: 'auto',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa'
  },
  optionsArea: {
    flex: 1
  },
  optionsLabel: {
    fontSize: '16px',
    color: '#495057',
    fontWeight: 600,
    margin: '0 0 16px 0'
  },
  compactGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px'
  },
  compactOption: {
    backgroundColor: '#fff',
    border: '1px solid #dee2e6',
    padding: '16px',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    transition: 'all 0.2s',
    textAlign: 'left'
  },
  compactText: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1a1a1a',
    textTransform: 'capitalize'
  },
  configCard: {
    backgroundColor: '#fff',
    border: '1px solid #e9ecef',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
  },
  configLabel: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    display: 'block',
    marginBottom: '8px'
  },
  configTextarea: {
    width: '100%',
    border: '1.5px solid #dee2e6',
    borderRadius: '10px',
    padding: '14px',
    fontSize: '15px',
    fontFamily: 'inherit',
    color: '#1a1a1a',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
    lineHeight: 1.6
  },
  configRecordRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    backgroundColor: '#fff',
    border: '1px solid #e9ecef',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '8px'
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#adb5bd',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0
  },
  confirmationLayout: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '900px',
    gap: '40px'
  },
  mainConfirmation: {
    backgroundColor: '#fff',
    padding: '40px',
    borderRadius: '24px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
    textAlign: 'center',
    border: '1px solid #e9ecef'
  },
  intentPreview: {
    margin: '32px 0',
    padding: '32px',
    backgroundColor: '#f0f7ff',
    borderRadius: '16px',
    border: '1px solid #d0e7ff'
  },
  intentLabel: {
    fontSize: '14px',
    color: '#007AFF',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    margin: '0 0 8px 0'
  },
  intentNatural: {
    fontSize: '36px',
    fontWeight: 800,
    color: '#1a1a1a',
    margin: 0,
    lineHeight: 1.2
  },
  confirmActions: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center'
  },
  sendLargeBtn: {
    backgroundColor: '#34C759',
    color: '#fff',
    border: 'none',
    padding: '18px 40px',
    borderRadius: '16px',
    fontWeight: 700,
    fontSize: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    cursor: 'pointer',
    boxShadow: '0 10px 20px rgba(52, 199, 89, 0.2)'
  },
  redrawBtn: {
    backgroundColor: '#f8f9fa',
    color: '#6c757d',
    border: '1px solid #dee2e6',
    padding: '18px 30px',
    borderRadius: '16px',
    fontWeight: 600,
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer'
  },
  alternativesSection: {
    display: 'flex',
    gap: '24px',
    alignItems: 'flex-start'
  },
  sketchThumbnail: {
    width: '200px',
    backgroundColor: '#fff',
    padding: '12px',
    borderRadius: '16px',
    border: '1px solid #e9ecef',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
  },
  thumbLabel: {
    fontSize: '12px',
    color: '#6c757d',
    fontWeight: 600,
    margin: '0 0 8px 0',
    textAlign: 'center'
  },
  thumbImg: {
    width: '100%',
    height: 'auto',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa'
  },
  optionsArea: {
    flex: 1
  },
  optionsLabel: {
    fontSize: '16px',
    color: '#495057',
    fontWeight: 600,
    margin: '0 0 16px 0'
  },
  compactGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px'
  },
  compactOption: {
    backgroundColor: '#fff',
    border: '1px solid #dee2e6',
    padding: '16px',
    borderRadius: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    transition: 'all 0.2s',
    textAlign: 'left'
  },
  compactText: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1a1a1a',
    textTransform: 'capitalize'
  },
  mainConfirmationFull: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    minHeight: '800px',
    padding: '20px',
    textAlign: 'center'
  },
  alternativesSectionConfirming: {
    display: 'flex',
    gap: '32px',
    marginTop: 'auto',
    paddingTop: '32px',
    borderTop: '1px solid #dee2e6',
    alignItems: 'flex-start'
  },
  sketchThumbnailSmall: {
    width: '180px',
    backgroundColor: '#fff',
    padding: '12px',
    borderRadius: '16px',
    border: '1px solid #e9ecef',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
  }
};

export default PatientDashboard;
