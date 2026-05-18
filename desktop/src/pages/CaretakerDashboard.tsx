import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { Bell, Users, LogOut, MessageSquare, Camera, Scan, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface CaretakerDashboardProps {
  user: any;
  onLogout: () => void;
}

interface Notification {
  id: string;
  patient_name: string;
  intent: string;
  timestamp: Date;
}

const CaretakerDashboard: React.FC<CaretakerDashboardProps> = ({ user, onLogout }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'alerts' | 'scanner' | 'patients'>('alerts');
  
  // Scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagedItems, setStagedItems] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'scanner') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [activeTab]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsProcessing(true);
    
    // Draw video frame to canvas
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get base64 image
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/scan-grounding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image })
      });
      
      if (res.ok) {
        const data = await res.json();
        setStagedItems(prev => [{ id: Math.random().toString(), ...data }, ...prev]);
      } else {
        console.error("Failed to scan grounding factor");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const addGroundingFactor = async (item: any) => {
    try {
      const content = `[Grounding] Extracted ${item.type}: ${item.name}. Details: ${item.details}`;
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:8000'}/api/admin/records?content=${encodeURIComponent(content)}`, {
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

    return () => newSocket.close();
  }, [user.token]);

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>A</div>
          <h2 style={styles.brandName}>Agapita</h2>
        </div>
        
        <div style={styles.userInfo}>
          <p style={styles.userLabel}>Caretaker</p>
          <p style={styles.userName}>{user.username}</p>
        </div>

        <div style={styles.nav}>
          <div 
            style={{ ...styles.navItem, ...(activeTab === 'alerts' ? styles.navActive : {}) }}
            onClick={() => setActiveTab('alerts')}
          >
            <Bell size={20} />
            <span>Live Alerts</span>
          </div>
          <div 
            style={{ ...styles.navItem, ...(activeTab === 'scanner' ? styles.navActive : {}) }}
            onClick={() => setActiveTab('scanner')}
          >
            <Scan size={20} />
            <span>Environment Scanner</span>
          </div>
          <div 
            style={{ ...styles.navItem, ...(activeTab === 'patients' ? styles.navActive : {}) }}
            onClick={() => setActiveTab('patients')}
          >
            <Users size={20} />
            <span>Patient List</span>
          </div>
        </div>

        <button style={styles.logoutBtn} onClick={onLogout}>
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Main Content */}
      <main style={styles.main}>
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
                      <p style={styles.intent}>"{notif.intent}"</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'scanner' && (
          <div style={{ display: 'flex', gap: '32px', height: '100%', minHeight: '600px' }}>
            <style>{`
              @keyframes spin { 100% { transform: rotate(360deg); } }
              .spinner { animation: spin 2s linear infinite; }
            `}</style>
            {/* Camera View */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <header style={styles.header}>
                <h1 style={styles.title}>Environment Scanner</h1>
                <p style={styles.subtitle}>Scan prescriptions and objects for AI grounding</p>
              </header>

              <div style={{ flex: 1, backgroundColor: '#1a1a1a', borderRadius: '16px', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                
                {/* Capture Overlay */}
                <div style={{ position: 'absolute', bottom: '32px', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '16px' }}>
                  <button 
                    onClick={handleCapture}
                    disabled={isProcessing || !isCameraActive}
                    style={{
                      width: '72px', height: '72px', borderRadius: '36px',
                      backgroundColor: isProcessing ? '#adb5bd' : '#fff',
                      border: '4px solid #007AFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: isProcessing ? 'not-allowed' : 'pointer',
                      boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isProcessing ? <Loader2 className="spinner" size={32} color="#fff" /> : <Camera size={32} color="#007AFF" />}
                  </button>
                  {isProcessing && (
                    <span style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: 600 }}>
                      Extracting text via Gemma 4 Vision...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Staged Items Inbox */}
            <div style={{ width: '400px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e9ecef', paddingLeft: '32px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px 0', color: '#1a1a1a' }}>Staged for Grounding</h2>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px' }}>
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
