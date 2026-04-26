import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { UserPlus, UserCog, Database, LogOut, ShieldCheck } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

const API_URL = 'http://localhost:8000';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [caretakers, setCaretakers] = useState<any[]>([]);
  const [selectedCaretaker, setSelectedCaretaker] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');

  const fetchData = async () => {
    try {
      const pRes = await axios.get(`${API_URL}/api/admin/patients`);
      const cRes = await axios.get(`${API_URL}/api/admin/caretakers`);
      setPatients(pRes.data);
      setCaretakers(cRes.data);
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

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.navBrand}>
          <ShieldCheck size={24} color="#FF3B30" />
          <span style={styles.navTitle}>Agapita Admin</span>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>
          <LogOut size={18} />
          Logout
        </button>
      </nav>

      <div style={styles.content}>
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <Database size={20} />
            <h2>Medical Records & Assignments</h2>
          </div>
          
          <div style={styles.formCard}>
            <h3>Assign Patient to Caretaker</h3>
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
              <button onClick={handleAssign} style={styles.button}>Assign</button>
            </div>
          </div>

          <div style={styles.grid}>
            <div style={styles.tableCard}>
              <h3>Patients</h3>
              <ul style={styles.list}>
                {patients.map(p => (
                  <li key={p.id} style={styles.listItem}>
                    <strong>{p.name}</strong>
                    <span style={styles.tag}>{p.patient_id}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={styles.tableCard}>
              <h3>Caretakers</h3>
              <ul style={styles.list}>
                {caretakers.map(c => (
                  <li key={c.id} style={styles.listItem}>
                    <strong>{c.name}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column' as const, backgroundColor: '#F0F2F5' },
  nav: { height: '60px', backgroundColor: '#1C1C1E', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' },
  navBrand: { display: 'flex', alignItems: 'center', gap: '10px' },
  navTitle: { fontWeight: 'bold', fontSize: '18px' },
  logoutBtn: { display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: '#BBB', cursor: 'pointer' },
  content: { padding: '40px', flex: 1, overflowY: 'auto' as const },
  section: { maxWidth: '1000px', margin: '0 auto' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '30px' },
  formCard: { backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '30px' },
  formGroup: { display: 'flex', gap: '15px', marginTop: '15px' },
  select: { flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #DDD' },
  button: { padding: '10px 25px', backgroundColor: '#007AFF', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' },
  tableCard: { backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  list: { listStyle: 'none', padding: 0, marginTop: '15px' },
  listItem: { padding: '12px 0', borderBottom: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tag: { fontSize: '12px', backgroundColor: '#E1E9FF', color: '#007AFF', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }
};

export default AdminDashboard;
