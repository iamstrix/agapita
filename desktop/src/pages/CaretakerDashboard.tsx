import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { Bell, Users, LogOut, MessageSquare } from 'lucide-react';

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

  useEffect(() => {
    const newSocket = io('http://localhost:8000', {
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
        
        // Browser notification
        if (Notification.permission === 'granted') {
          new Notification(`Alert from ${data.patient_name}`, {
            body: data.intent
          });
        }
      }
    });

    setSocket(newSocket);

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => newSocket.close();
  }, [user.token]);

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navBrand}>
          <MessageSquare size={24} color="#007AFF" />
          <span style={styles.navTitle}>Agapita Caretaker</span>
        </div>
        <div style={styles.navUser}>
          <span>Welcome, {user.username}</span>
          <button onClick={onLogout} style={styles.logoutBtn}>
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <div style={styles.content}>
        <div style={styles.sidebar}>
          <div style={styles.sidebarItem}>
            <Users size={20} />
            <span>Assigned Patients</span>
          </div>
          <div style={{ ...styles.sidebarItem, backgroundColor: '#E1E9FF', color: '#007AFF' }}>
            <Bell size={20} />
            <span>Live Alerts</span>
          </div>
        </div>

        <main style={styles.main}>
          <h2 style={styles.sectionTitle}>Recent Notifications</h2>
          <div style={styles.list}>
            {notifications.length === 0 ? (
              <p style={styles.empty}>No recent activity from patients.</p>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <span style={styles.patientName}>{notif.patient_name}</span>
                    <span style={styles.timestamp}>{notif.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <p style={styles.intent}>"{notif.intent}"</p>
                </div>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const styles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: '#F8F9FA' },
  nav: { 
    height: '60px', 
    backgroundColor: 'white', 
    borderBottom: '1px solid #EEE', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    padding: '0 20px'
  },
  navBrand: { display: 'flex', alignItems: 'center', gap: '10px' },
  navTitle: { fontWeight: 'bold', fontSize: '18px' },
  navUser: { display: 'flex', alignItems: 'center', gap: '15px' },
  logoutBtn: { border: 'none', background: 'none', cursor: 'pointer', color: '#666' },
  content: { flex: 1, display: 'flex' },
  sidebar: { width: '250px', backgroundColor: 'white', borderRight: '1px solid #EEE', padding: '20px' },
  sidebarItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '5px' },
  main: { flex: 1, padding: '30px', overflowY: 'auto' as const },
  sectionTitle: { fontSize: '24px', marginBottom: '20px' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: '15px' },
  card: { backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px' },
  patientName: { fontWeight: 'bold', fontSize: '18px', color: '#1A1A1A' },
  timestamp: { color: '#999', fontSize: '14px' },
  intent: { fontSize: '20px', color: '#333', fontStyle: 'italic' },
  empty: { color: '#666', textAlign: 'center' as const, marginTop: '50px' }
};

export default CaretakerDashboard;
