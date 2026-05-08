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
          <div style={{ ...styles.navItem, ...styles.navActive }}>
            <Bell size={20} />
            <span>Live Alerts</span>
          </div>
          <div style={styles.navItem}>
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
