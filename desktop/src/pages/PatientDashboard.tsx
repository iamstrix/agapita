import React, { useRef, useState, useEffect } from 'react';
import io from 'socket.io-client';
import { 
  Eraser, 
  Send, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  LogOut,
  MousePointer2,
  Image as ImageIcon
} from 'lucide-react';

const SERVER_URL = 'http://localhost:8000';

interface PatientDashboardProps {
  user: { username: string; token: string };
  onLogout: () => void;
}

type Mode = 'sketch' | 'processing' | 'pinpointing' | 'result' | 'records';

const PatientDashboard: React.FC<PatientDashboardProps> = ({ user, onLogout }) => {
  const [mode, setMode] = useState<Mode>('sketch');
  const [isDrawing, setIsDrawing] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [intent, setIntent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientRecords, setPatientRecords] = useState<string[]>([]);
  
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
    
    socketRef.current.on('pinpointing_required', (data: any) => {
      setOptions(data.options);
      setMode('pinpointing');
    });

    socketRef.current.on('interpretation_complete', (data: any) => {
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
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMode('sketch');
    setError(null);
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
              <div style={styles.actions}>
                <button style={styles.secondaryBtn} onClick={clearCanvas}>
                  <Eraser size={18} />
                  Clear
                </button>
                <button style={styles.primaryBtn} onClick={handleInterpret}>
                  <Send size={18} />
                  Interpret
                </button>
              </div>
            </div>
            
            <div style={styles.canvasContainer}>
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                style={styles.canvas}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
              />
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
          <div style={styles.overlay}>
            <Loader2 size={64} style={styles.spinner} />
            <h2 style={styles.overlayTitle}>AI Interpretation in Progress</h2>
            <p style={styles.overlaySub}>Analyzing your sketch and medical history...</p>
          </div>
        );

      case 'pinpointing':
        return (
          <div style={styles.contentCard}>
            <h2 style={styles.title}>Confirming Intent</h2>
            <p style={styles.subtitle}>The AI identified several possibilities. Please select the correct one:</p>
            
            <div style={styles.grid}>
              {options.map((option, idx) => (
                <button 
                  key={idx} 
                  style={styles.optionCard}
                  onClick={() => handleSelectOption(option)}
                >
                  <div style={styles.iconBox}>
                    <ImageIcon size={32} color="#007AFF" />
                  </div>
                  <span style={styles.optionText}>{option}</span>
                </button>
              ))}
            </div>

            <button style={styles.textLink} onClick={() => setMode('sketch')}>
              None of these, let me redraw
            </button>
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
    border: 'none',
    backgroundColor: 'transparent',
    borderRadius: '8px',
    color: '#495057',
    fontSize: '16px',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s'
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'auto'
  },
  canvasWrapper: {
    width: '100%',
    maxWidth: '900px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
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
    backgroundColor: '#fff',
    borderRadius: '20px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
    padding: '20px',
    display: 'flex',
    justifyContent: 'center',
    border: '1px solid #e9ecef'
  },
  canvas: {
    backgroundColor: '#fff',
    cursor: 'crosshair',
    touchAction: 'none'
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
    fontSize: '28px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '24px 0 8px 0'
  },
  overlaySub: {
    fontSize: '18px',
    color: '#6c757d',
    margin: 0
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
  }
};

export default PatientDashboard;
