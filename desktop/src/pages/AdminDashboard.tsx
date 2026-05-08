import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { UserPlus, UserCog, Database, LogOut, ShieldCheck, Key, User } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

const API_URL = 'http://localhost:8000';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [caretakers, setCaretakers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedCaretaker, setSelectedCaretaker] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const fetchData = async () => {
    try {
      const pRes = await axios.get(`${API_URL}/api/admin/patients`);
      const cRes = await axios.get(`${API_URL}/api/admin/caretakers`);
      const uRes = await axios.get(`${API_URL}/api/admin/users`);
      setPatients(pRes.data);
      setCaretakers(cRes.data);
      setUsers(uRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssign = async () => {
    if (!selectedCaretaker || !selectedPatient) return;
    try {
      await axios.post(`${API_URL}/api/admin/assign?caretaker_id=${selectedCaretaker}&patient_id=${selectedPatient}`);
      alert('Patient assigned successfully');
      fetchData();
    } catch (err) {
      alert('Failed to assign patient');
    }
  };

  const handleUpdateUser = async (id: number) => {
    try {
      const data: any = {};
      if (newUsername) data.username = newUsername;
      if (newPassword) data.password = newPassword;
      
      if (Object.keys(data).length === 0) return;

      await axios.patch(`${API_URL}/api/admin/users/${id}`, data);
      alert('User updated successfully');
      setEditUserId(null);
      setNewUsername('');
      setNewPassword('');
      fetchData();
    } catch (err) {
      alert('Failed to update user');
    }
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>A</div>
          <h2 style={styles.brandName}>Agapita</h2>
        </div>
        
        <div style={styles.userInfo}>
          <p style={styles.userLabel}>Administrator</p>
          <p style={styles.userName}>System Admin</p>
        </div>

        <div style={styles.nav}>
          <div style={{ ...styles.navItem, ...styles.navActive }}>
            <Database size={20} />
            <span>Management</span>
          </div>
          <div style={styles.navItem}>
            <ShieldCheck size={20} />
            <span>Security</span>
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
          <h1 style={styles.title}>System Administration</h1>
          <p style={styles.subtitle}>Manage users, roles, and patient assignments</p>
        </header>

        <div style={styles.section}>
          <div style={styles.formCard}>
            <h3 style={styles.cardTitle}>Assign Patient to Caretaker</h3>
            <div style={styles.formGroup}>
              <select 
                value={selectedCaretaker} 
                onChange={(e) => setSelectedCaretaker(e.target.value)}
                style={styles.select}
              >
                <option value="">Select Caretaker</option>
                {caretakers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select 
                value={selectedPatient} 
                onChange={(e) => setSelectedPatient(e.target.value)}
                style={styles.select}
              >
                <option value="">Select Patient</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.patient_id})</option>
                ))}
              </select>
              <button onClick={handleAssign} style={styles.primaryBtn}>Assign</button>
            </div>
          </div>

          <div style={styles.tableCard}>
            <h3 style={styles.cardTitle}>User Directory</h3>
            <ul style={styles.list}>
              {users.map(u => (
                <li key={u.id} style={styles.listItemVertical}>
                  <div style={styles.userRow}>
                    <div style={styles.userInfoRow}>
                      <div style={styles.avatarSmall}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div style={styles.userDetails}>
                        <strong style={styles.usernameText}>{u.username}</strong>
                        <span style={styles.tag}>{u.role}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setEditUserId(editUserId === u.id ? null : u.id);
                        setNewUsername(u.username);
                      }} 
                      style={styles.editBtn}
                    >
                      <UserCog size={16} />
                      {editUserId === u.id ? 'Cancel' : 'Edit'}
                    </button>
                  </div>
                  
                  {editUserId === u.id && (
                    <div style={styles.editForm}>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>New Username</label>
                        <input 
                          value={newUsername} 
                          onChange={(e) => setNewUsername(e.target.value)}
                          style={styles.input}
                        />
                      </div>
                      <div style={styles.inputGroup}>
                        <label style={styles.label}>New Password</label>
                        <input 
                          type="password"
                          placeholder="Keep current"
                          value={newPassword} 
                          onChange={(e) => setNewPassword(e.target.value)}
                          style={styles.input}
                        />
                      </div>
                      <button 
                        onClick={() => handleUpdateUser(u.id)} 
                        style={styles.saveButton}
                      >
                        Update User
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div style={styles.grid}>
            <div style={styles.tableCard}>
              <h3 style={styles.cardTitle}>Patients</h3>
              <ul style={styles.list}>
                {patients.map(p => (
                  <li key={p.id} style={styles.listItem}>
                    <strong style={styles.nameText}>{p.name}</strong>
                    <span style={styles.idTag}>{p.patient_id}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={styles.tableCard}>
              <h3 style={styles.cardTitle}>Caretakers</h3>
              <ul style={styles.list}>
                {caretakers.map(c => (
                  <li key={c.id} style={styles.listItem}>
                    <strong style={styles.nameText}>{c.name}</strong>
                    <span style={styles.idTag}>Staff</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
    backgroundColor: '#FF3B30',
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
    backgroundColor: '#fff5f5',
    color: '#FF3B30'
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
  section: {
    maxWidth: '1000px'
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0 0 20px 0'
  },
  formCard: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
    marginBottom: '24px',
    border: '1px solid #f1f3f5'
  },
  formGroup: {
    display: 'flex',
    gap: '12px'
  },
  select: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    fontSize: '15px'
  },
  primaryBtn: {
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  tableCard: {
    backgroundColor: 'white',
    padding: '24px',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
    border: '1px solid #f1f3f5',
    marginBottom: '24px'
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  listItemVertical: {
    padding: '16px 0',
    borderBottom: '1px solid #f1f3f5'
  },
  userRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  userInfoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  avatarSmall: {
    width: '36px',
    height: '36px',
    backgroundColor: '#e9ecef',
    color: '#495057',
    borderRadius: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 600
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column'
  },
  usernameText: {
    fontSize: '16px',
    color: '#1a1a1a'
  },
  tag: {
    fontSize: '11px',
    color: '#007AFF',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  editBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    color: '#495057'
  },
  editForm: {
    marginTop: '16px',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-end'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#6c757d'
  },
  input: {
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #dee2e6',
    fontSize: '14px'
  },
  saveButton: {
    backgroundColor: '#34C759',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px'
  },
  listItem: {
    padding: '12px 0',
    borderBottom: '1px solid #f1f3f5',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  nameText: {
    fontSize: '15px',
    color: '#1a1a1a'
  },
  idTag: {
    fontSize: '12px',
    color: '#adb5bd'
  }
};

export default AdminDashboard;
