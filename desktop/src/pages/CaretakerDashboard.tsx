import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import { Bell, Users, LogOut, MessageSquare, Camera, Scan, CheckCircle, XCircle, Loader2, Maximize, Minimize } from 'lucide-react';

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
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagedItems, setStagedItems] = useState<any[]>([]);
  const [scanMode, setScanMode] = useState<'medication' | 'environment'>('medication');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [selectedPatientForView, setSelectedPatientForView] = useState<any>(null);
  const [isCameraFullscreen, setIsCameraFullscreen] = useState(false);

  useEffect(() => {
    if (activeTab === 'scanner') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [activeTab]);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Camera access denied by browser. If testing on mobile via IP, you must use HTTPS or enable insecure origins in browser flags.");
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      // The video element might take a millisecond to mount after switching tabs
      const attachStream = () => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraActive(true);
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
        body: JSON.stringify({ image: base64Image, mode: scanMode })
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
    <div style={{...styles.container, flexDirection: (isMobile && !isLandscape) ? 'column' : 'row'}}>
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
                  💊 Medication
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
                  🛋️ Everyday Objects
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

              <div style={isCameraFullscreen ? {
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
              }}>
                <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                      zIndex: 1010
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
                    right: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    zIndex: 1010
                  }}>
                    {/* Scan Mode Pill Toggles */}
                    <div style={{ display: 'flex', gap: '8px', maxWidth: '300px' }}>
                      <button
                        onClick={() => setScanMode('medication')}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: '20px', fontWeight: 600, fontSize: '13px',
                          border: 'none',
                          backgroundColor: scanMode === 'medication' ? '#007AFF' : 'rgba(0,0,0,0.6)',
                          color: '#fff', cursor: 'pointer', transition: 'all 0.2s',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                      >
                        💊 Medication
                      </button>
                      <button
                        onClick={() => setScanMode('environment')}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: '20px', fontWeight: 600, fontSize: '13px',
                          border: 'none',
                          backgroundColor: scanMode === 'environment' ? '#007AFF' : 'rgba(0,0,0,0.6)',
                          color: '#fff', cursor: 'pointer', transition: 'all 0.2s',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}
                      >
                        🛋️ Objects
                      </button>
                    </div>
                    
                    {/* Translucent Dropdown Selector */}
                    <select
                      value={selectedPatientId}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                      style={{
                        width: '100%', maxWidth: '300px', padding: '10px 16px', borderRadius: '20px', border: 'none',
                        backgroundColor: 'rgba(0,0,0,0.6)', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer',
                        outline: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                      }}
                    >
                      {patients.map(p => (
                        <option key={p.id} value={p.id} style={{ color: '#000' }}>{p.name} ({p.patient_id})</option>
                      ))}
                    </select>
                  </div>
                )}
                
                {/* Capture Overlay */}
                <div style={{ position: 'absolute', bottom: '32px', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '16px', zIndex: 1010 }}>
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
