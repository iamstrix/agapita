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
  PlusCircle
} from 'lucide-react';

const SERVER_URL = 'http://localhost:8000';

interface PatientDashboardProps {
  user: { username: string; token: string };
  onLogout: () => void;
}

type Mode = 'sketch' | 'processing' | 'confirming' | 'result' | 'records' | 'configure';

const PatientDashboard: React.FC<PatientDashboardProps> = ({ user, onLogout }) => {
  const [mode, setMode] = useState<Mode>('sketch');
  const [isDrawing, setIsDrawing] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [intent, setIntent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientRecords, setPatientRecords] = useState<string[]>([]);
  const [originalSketch, setOriginalSketch] = useState<string | null>(null);

  // Configure panel state
  const [newEntry, setNewEntry] = useState('');
  const [configRecords, setConfigRecords] = useState<{id: number; content: string}[]>([]);
  const [configStatus, setConfigStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
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
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [user.token]);

  // ── Configure Panel API calls ─────────────────────────────────────────────
  const loadConfigRecords = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/patient/records`, {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) setConfigRecords(await res.json());
    } catch {}
  }, [user.token]);

  const handleSaveRecord = async () => {
    if (!newEntry.trim()) return;
    setConfigStatus('saving');
    try {
      const res = await fetch(`${SERVER_URL}/api/patient/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ content: newEntry.trim() })
      });
      if (res.ok) {
        setNewEntry('');
        setConfigStatus('saved');
        await loadConfigRecords();
        setTimeout(() => setConfigStatus('idle'), 2000);
      } else {
        setConfigStatus('error');
      }
    } catch {
      setConfigStatus('error');
    }
  };

  const handleDeleteRecord = async (id: number) => {
    try {
      await fetch(`${SERVER_URL}/api/patient/records/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` }
      });
      await loadConfigRecords();
    } catch {}
  };

  useEffect(() => {
    if (mode === 'configure') loadConfigRecords();
  }, [mode, loadConfigRecords]);
  // ─────────────────────────────────────────────────────────────────────────

  // Canvas Drawing Logic
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

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
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;

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
    const dataUrl = canvas.toDataURL('image/png');
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
        return (
          <div style={styles.canvasWrapper}>
            <div style={styles.toolbar}>
              <div>
                <h3 style={styles.toolTitle}>Communication Canvas</h3>
                <p style={styles.toolSub}>Sketch your need below</p>
              </div>
            </div>
            
            <div style={styles.sketchLayout}>
              <div style={styles.canvasContainer}>
                <canvas
                  ref={canvasRef}
                  width={1100}
                  height={800}
                  style={styles.canvas}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                />
              </div>

              <div style={styles.sideActions}>
                <button 
                  id="interpret-btn"
                  style={styles.actionBtnLargePrimary} 
                  onClick={handleInterpret}
                >
                  <Send size={32} />
                  <span>Send</span>
                </button>
                <button 
                  id="clear-btn"
                  style={styles.actionBtnLargeSecondary} 
                  onClick={clearCanvas}
                >
                  <Eraser size={32} />
                  <span>Clear</span>
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
          <div style={styles.confirmationLayout}>
            {/* Top Section: Interpretation */}
            <div style={styles.mainConfirmation}>
              <h2 style={styles.title}>Does this look right?</h2>
              <div style={styles.intentPreview}>
                <p style={styles.intentLabel}>Synthesized Request:</p>
                <h1 style={styles.intentNatural}>"{intent}"</h1>
              </div>

              <div style={styles.confirmActions}>
                <button style={styles.sendLargeBtn} onClick={handleSendInterpretation}>
                  <Send size={24} />
                  Yes, Send to Caretaker
                </button>
                <button style={styles.redrawBtn} onClick={clearCanvas}>
                  <Eraser size={20} />
                  No, let me redraw
                </button>
              </div>
            </div>

            {/* Bottom Section: Alternatives & Sketch */}
            <div style={styles.alternativesSection}>
              <div style={styles.sketchThumbnail}>
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
        return (
          <div style={styles.canvasWrapper}>
            <div style={styles.toolbar}>
              <div>
                <h3 style={styles.toolTitle}>Medical Context Editor</h3>
                <p style={styles.toolSub}>Add facts the AI will use when interpreting your sketches</p>
              </div>
            </div>

            {/* Input Form */}
            <div style={styles.configCard}>
              <label style={styles.configLabel}>New Context Entry</label>
              <textarea
                id="configure-record-input"
                style={styles.configTextarea}
                placeholder={'Examples:\n• I usually ask for water when I draw waves\n• I take my medication every morning at 9AM\n• When I draw a phone, I want to call Martha'}
                value={newEntry}
                onChange={e => setNewEntry(e.target.value)}
                rows={5}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px', alignItems: 'center' }}>
                {configStatus === 'saved' && <span style={{ color: '#34C759', fontWeight: 600, fontSize: 14 }}>✓ Saved & loaded into AI</span>}
                {configStatus === 'error' && <span style={{ color: '#FF3B30', fontWeight: 600, fontSize: 14 }}>Save failed</span>}
                <button
                  id="configure-save-btn"
                  style={configStatus === 'saving' ? {...styles.primaryBtn, opacity: 0.6} : styles.primaryBtn}
                  onClick={handleSaveRecord}
                  disabled={configStatus === 'saving' || !newEntry.trim()}
                >
                  {configStatus === 'saving' ? <Loader2 size={16} /> : <PlusCircle size={16} />}
                  {configStatus === 'saving' ? 'Saving...' : 'Save to AI Context'}
                </button>
              </div>
            </div>

            {/* Saved Records List */}
            <div style={{ marginTop: '8px' }}>
              <p style={{ ...styles.configLabel, marginBottom: '12px' }}>Saved Context ({configRecords.length} entries)</p>
              {configRecords.length === 0 ? (
                <div style={styles.emptyRecords}>
                  <Settings size={40} color="#ccc" />
                  <p>No context entries yet. Add one above.</p>
                </div>
              ) : (
                <div style={styles.recordsList}>
                  {configRecords.map(rec => (
                    <div key={rec.id} style={styles.configRecordRow}>
                      <p style={{ ...styles.recordContentText, flex: 1 }}>{rec.content}</p>
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

  return (
    <div style={styles.container}>
      {/* Sidebar/Header */}
      <div style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>A</div>
          <h2 style={styles.brandName}>Agapita</h2>
        </div>
        
        <div style={styles.userInfo}>
          <p style={styles.userLabel}>Patient</p>
          <p style={styles.userName}>{user.username}</p>
        </div>

        <div style={styles.nav}>
          <button 
            style={{...styles.navItem, ...(mode === 'sketch' ? styles.navActive : {})}}
            onClick={() => setMode('sketch')}
          >
            <MousePointer2 size={20} />
            <span>Canvas</span>
          </button>
          <button 
            style={{...styles.navItem, ...(mode === 'records' ? styles.navActive : {})}}
            onClick={() => setMode('records')}
          >
            <CheckCircle size={20} />
            <span>Medical Records</span>
          </button>
          <button
            style={{...styles.navItem, ...(mode === 'configure' ? styles.navActive : {})}}
            onClick={() => setMode('configure')}
          >
            <Settings size={20} />
            <span>Configure AI</span>
          </button>
        </div>

        <button style={styles.logoutBtn} onClick={onLogout}>
          <LogOut size={20} />
          <span>Exit System</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div style={styles.main}>
        {renderContent()}
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
  }
};

export default PatientDashboard;
