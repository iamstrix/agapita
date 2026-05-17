import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { UserPlus, UserCog, Database, LogOut, ShieldCheck, Key, User, FileText, MoveRight, X } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

const API_URL = 'http://localhost:8000';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout }) => {
  const [patients, setPatients] = useState<any[]>([]);
  const [caretakers, setCaretakers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [draggedRecordId, setDraggedRecordId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [selectedCaretaker, setSelectedCaretaker] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [mockTime, setMockTime] = useState('');
  const [mockTimeStatus, setMockTimeStatus] = useState<'idle'|'saved'|'cleared'>('idle');

  const fetchData = async () => {
    try {
      const pRes = await axios.get(`${API_URL}/api/admin/patients`);
      const cRes = await axios.get(`${API_URL}/api/admin/caretakers`);
      const uRes = await axios.get(`${API_URL}/api/admin/users`);
      const rRes = await axios.get(`${API_URL}/api/admin/records`);
      const mRes = await axios.get(`${API_URL}/api/admin/config/models`);
      setPatients(pRes.data);
      setCaretakers(cRes.data);
      setUsers(uRes.data);
      setRecords(rRes.data);
      if (mRes.data.mock_time) setMockTime(mRes.data.mock_time);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignRecord = async (recordId: number, patientId: number | null) => {
    try {
      await axios.post(`${API_URL}/api/admin/records/${recordId}/assign?patient_id=${patientId || 0}`);
      fetchData();
    } catch (err) {
      alert('Failed to update record assignment');
    }
  };

  const onDragStart = (e: React.DragEvent, recordId: number) => {
    e.dataTransfer.setData('text/plain', recordId.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggedRecordId(recordId);
  };

  const onDragOver = (e: React.DragEvent, targetId: number | 'library') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (typeof targetId === 'number') {
        if (dropTargetId !== targetId) setDropTargetId(targetId);
    } else {
        setDropTargetId(-1); // Use -1 as a special value for library
    }
  };

  const onDragLeave = () => {
    setDropTargetId(null);
  };

  const onDrop = (e: React.DragEvent, targetId: number | null) => {
    e.preventDefault();
    const recordIdStr = e.dataTransfer.getData('text/plain');
    const recordId = parseInt(recordIdStr);
    
    setDropTargetId(null);
    setDraggedRecordId(null);
    
    if (!isNaN(recordId)) {
        handleAssignRecord(recordId, targetId);
    }
  };

  const onDragEnd = () => {
    setDraggedRecordId(null);
    setDropTargetId(null);
  };

  const handleAssignCaretaker = async () => {
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

  const handleSetMockTime = async () => {
    try {
      await axios.post(`${API_URL}/api/admin/config/models`, { mock_time: mockTime || null, use_real_time: !mockTime });
      setMockTimeStatus(mockTime ? 'saved' : 'cleared');
      setTimeout(() => setMockTimeStatus('idle'), 2000);
    } catch (err) {
      alert('Failed to update time override');
    }
  };

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <nav style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>A</div>
          <h2 style={styles.brandName}>Agapita</h2>
        </div>
        
        <div style={styles.userInfo}>
          <p style={styles.userLabel}>System Console</p>
          <p style={styles.userName}>Administrator</p>
        </div>

        <div style={styles.nav}>
          <div style={{ ...styles.navItem, ...styles.navActive }}>
            <Database size={20} />
            <span>Infrastructure</span>
          </div>
          <div style={styles.navItem}>
            <ShieldCheck size={20} />
            <span>Audit Logs</span>
          </div>
        </div>

        <button style={styles.logoutBtn} onClick={onLogout}>
          <LogOut size={20} />
          <span>Exit Console</span>
        </button>
      </nav>

      {/* Main Content */}
      <main style={styles.main}>
        <header style={styles.header}>
          <h1 style={styles.title}>Administrative Control</h1>
          <p style={styles.subtitle}>Modify RAG outcomes by hot-swapping medical context</p>
        </header>

        <div style={styles.contentGrid}>
          {/* RAG Experimentation Area */}
          <div style={styles.fullWidth}>
            <div style={styles.ragContainer}>
              <div style={styles.ragHeader}>
                <div style={styles.ragTitleGroup}>
                  <Database color="#007AFF" size={24} />
                  <h3 style={styles.ragTitle}>RAG Context Experimentation</h3>
                </div>
                <p style={styles.ragSubtitle}>Drag record cards to patients to instantly change AI interpretation behavior.</p>
              </div>

              <div style={styles.dragLayout}>
                {/* Available Library - Now a Drop Zone for Unassigning */}
                <div 
                  style={{
                    ...styles.libraryColumn,
                    backgroundColor: dropTargetId === -1 ? '#f0f7ff' : 'transparent',
                    borderRadius: '20px',
                    padding: '10px',
                    transition: 'all 0.2s',
                    border: dropTargetId === -1 ? '2px dashed #007AFF' : '2px dashed transparent'
                  }}
                  onDragOver={(e) => onDragOver(e, 'library')}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, null)}
                >
                  <div style={styles.columnHead}>
                    <FileText size={18} />
                    <span>Global Record Library</span>
                  </div>
                  <div style={styles.scrollArea}>
                    {records.filter(r => !r.patient_id_fk).map(record => (
                      <div 
                        key={record.id} 
                        draggable 
                        onDragStart={(e) => onDragStart(e, record.id)}
                        onDragEnd={onDragEnd}
                        style={{
                          ...styles.recordCard,
                          opacity: draggedRecordId === record.id ? 0.5 : 1,
                          transform: draggedRecordId === record.id ? 'scale(0.98)' : 'scale(1)',
                        }}
                      >
                        <p style={styles.recordText}>{record.content}</p>
                        <div style={styles.dragHandle}>
                          <MoveRight size={14} />
                          <span>Draggable</span>
                        </div>
                      </div>
                    ))}
                    {records.filter(r => !r.patient_id_fk).length === 0 && (
                      <div style={styles.emptyLibrary}>All records are currently assigned.</div>
                    )}
                  </div>
                </div>

                {/* Patient Drop Targets */}
                <div style={styles.patientColumn}>
                  <div style={styles.columnHead}>
                    <User size={18} />
                    <span>Patient RAG Assignments</span>
                  </div>
                  <div style={styles.patientGrid}>
                    {patients.map(patient => (
                      <div 
                        key={patient.id} 
                        onDragOver={(e) => onDragOver(e, patient.id)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, patient.id)}
                        style={{
                          ...styles.dropZone,
                          borderColor: dropTargetId === patient.id ? '#007AFF' : '#ddd',
                          backgroundColor: dropTargetId === patient.id ? '#f0f7ff' : '#fff',
                          boxShadow: dropTargetId === patient.id ? '0 0 15px rgba(0,122,255,0.1)' : 'none',
                        }}
                      >
                        <div style={styles.dropZoneHead}>
                          <span style={styles.targetName}>{patient.name}</span>
                          <span style={styles.targetId}>{patient.patient_id}</span>
                        </div>
                        <div style={styles.activeRecords}>
                          {records.filter(r => r.patient_id_fk === patient.id).length === 0 ? (
                            <div style={styles.dropPrompt}>Drop context cards here</div>
                          ) : (
                            records.filter(r => r.patient_id_fk === patient.id).map(record => (
                              <div 
                                key={record.id} 
                                draggable
                                onDragStart={(e) => onDragStart(e, record.id)}
                                onDragEnd={onDragEnd}
                                style={{
                                    ...styles.assignedCard,
                                    opacity: draggedRecordId === record.id ? 0.5 : 1,
                                    cursor: 'grab'
                                }}
                              >
                                <p style={styles.assignedText}>{record.content}</p>
                                <button 
                                  onClick={() => handleAssignRecord(record.id, null)}
                                  style={styles.unassignBtn}
                                  title="Remove context"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Column */}
          <div style={styles.sidebarColumn}>
             <div style={{...styles.formCard, marginBottom: '24px'}}>
                <h3 style={styles.cardTitle}>Time Override</h3>
                <div style={styles.stack}>
                  <p style={{fontSize: '13px', color: '#666', margin: 0}}>Override the system clock for testing time-sensitive RAG records. Use HH:MM format (e.g. 09:00).</p>
                  <input
                    type="time"
                    value={mockTime}
                    onChange={(e) => setMockTime(e.target.value)}
                    style={{...styles.select, fontFamily: 'inherit'}}
                  />
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button onClick={handleSetMockTime} style={styles.primaryBtn}>
                      {mockTimeStatus === 'saved' ? '✓ Saved' : mockTimeStatus === 'cleared' ? '✓ Cleared' : 'Apply'}
                    </button>
                    <button onClick={() => { setMockTime(''); handleSetMockTime(); }} style={{...styles.primaryBtn, backgroundColor: '#666'}}>
                      Use Real Time
                    </button>
                  </div>
                </div>
             </div>

             <div style={styles.formCard}>
                <h3 style={styles.cardTitle}>Staff Assignment</h3>
                <div style={styles.stack}>
                  <select 
                    value={selectedCaretaker} 
                    onChange={(e) => setSelectedCaretaker(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">Select Staff</option>
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
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button onClick={handleAssignCaretaker} style={styles.primaryBtn}>Assign Staff</button>
                </div>
              </div>
          </div>

          <div style={styles.mainColumn}>
            <div style={styles.tableCard}>
              <h3 style={styles.cardTitle}>Credential Directory</h3>
              <div style={styles.userList}>
                {users.map(u => (
                  <div key={u.id} style={styles.userItem}>
                    <div style={styles.userMain}>
                      <div style={styles.avatar}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div style={styles.userMeta}>
                        <span style={styles.userRole}>{u.role}</span>
                        <span style={styles.username}>{u.username}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setEditUserId(editUserId === u.id ? null : u.id);
                        setNewUsername(u.username);
                      }} 
                      style={styles.editIconBtn}
                    >
                      <UserCog size={18} />
                    </button>
                    
                    {editUserId === u.id && (
                      <div style={styles.inlineEdit}>
                        <input 
                          value={newUsername} 
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="Username"
                          style={styles.miniInput}
                        />
                        <input 
                          type="password"
                          value={newPassword} 
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New Password"
                          style={styles.miniInput}
                        />
                        <button onClick={() => handleUpdateUser(u.id)} style={styles.saveBtn}>Save</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
    backgroundColor: '#f4f7f6',
    color: '#1a1a1a',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  sidebar: {
    width: '280px',
    backgroundColor: '#111',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    padding: '32px'
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '48px'
  },
  logo: {
    width: '36px',
    height: '36px',
    backgroundColor: '#007AFF',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '20px'
  },
  brandName: {
    fontSize: '22px',
    fontWeight: 800,
    margin: 0,
    letterSpacing: '-0.5px'
  },
  userInfo: {
    backgroundColor: '#222',
    padding: '16px',
    borderRadius: '12px',
    marginBottom: '32px'
  },
  userLabel: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    margin: '0 0 4px 0'
  },
  userName: {
    fontSize: '16px',
    fontWeight: 600,
    margin: 0
  },
  nav: {
    flex: 1
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '10px',
    color: '#888',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '4px'
  },
  navActive: {
    backgroundColor: '#007AFF',
    color: '#fff'
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ff4444',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '15px'
  },
  main: {
    flex: 1,
    padding: '48px',
    overflowY: 'auto'
  },
  header: {
    marginBottom: '40px'
  },
  title: {
    fontSize: '36px',
    fontWeight: 800,
    margin: '0 0 8px 0',
    letterSpacing: '-1px'
  },
  subtitle: {
    fontSize: '18px',
    color: '#666'
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: '24px'
  },
  fullWidth: {
    gridColumn: 'span 12'
  },
  mainColumn: {
    gridColumn: 'span 8'
  },
  sidebarColumn: {
    gridColumn: 'span 4'
  },
  ragContainer: {
    backgroundColor: '#fff',
    borderRadius: '24px',
    padding: '32px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
    border: '1px solid #eee'
  },
  ragHeader: {
    marginBottom: '32px'
  },
  ragTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px'
  },
  ragTitle: {
    fontSize: '24px',
    fontWeight: 700,
    margin: 0
  },
  ragSubtitle: {
    fontSize: '15px',
    color: '#666',
    margin: 0
  },
  dragLayout: {
    display: 'flex',
    gap: '32px',
    minHeight: '400px'
  },
  libraryColumn: {
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  patientColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  columnHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  scrollArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '4px'
  },
  recordCard: {
    backgroundColor: '#f9f9f9',
    padding: '20px',
    borderRadius: '16px',
    border: '1px solid #eee',
    cursor: 'grab',
    transition: 'all 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
  },
  recordText: {
    fontSize: '14px',
    lineHeight: 1.5,
    margin: '0 0 12px 0',
    fontWeight: 500
  },
  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    color: '#007AFF',
    fontWeight: 800,
    textTransform: 'uppercase'
  },
  patientGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px'
  },
  dropZone: {
    backgroundColor: '#fff',
    border: '2px dashed #ddd',
    borderRadius: '20px',
    padding: '20px',
    transition: 'all 0.2s',
    minHeight: '180px',
    display: 'flex',
    flexDirection: 'column'
  },
  dropZoneHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  targetName: {
    fontSize: '16px',
    fontWeight: 700
  },
  targetId: {
    fontSize: '12px',
    color: '#999',
    backgroundColor: '#f0f0f0',
    padding: '2px 8px',
    borderRadius: '4px'
  },
  activeRecords: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1
  },
  assignedCard: {
    backgroundColor: '#f0f7ff',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #cce4ff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px'
  },
  assignedText: {
    fontSize: '13px',
    lineHeight: 1.4,
    margin: 0,
    fontWeight: 500,
    color: '#005bb7'
  },
  unassignBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#005bb7',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center'
  },
  dropPrompt: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    color: '#bbb',
    fontStyle: 'italic'
  },
  emptyLibrary: {
    textAlign: 'center',
    padding: '40px 0',
    color: '#ccc',
    fontSize: '14px',
    fontStyle: 'italic'
  },
  formCard: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
    border: '1px solid #eee'
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 700,
    marginBottom: '20px'
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  select: {
    padding: '12px',
    borderRadius: '10px',
    border: '1px solid #ddd',
    fontSize: '15px',
    backgroundColor: '#f9f9f9'
  },
  primaryBtn: {
    padding: '12px',
    backgroundColor: '#007AFF',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontWeight: 600,
    fontSize: '15px',
    cursor: 'pointer'
  },
  tableCard: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
    border: '1px solid #eee'
  },
  userList: {
    display: 'flex',
    flexDirection: 'column'
  },
  userItem: {
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  userMain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  avatar: {
    width: '40px',
    height: '40px',
    backgroundColor: '#007AFF',
    color: '#fff',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700
  },
  userMeta: {
    flex: 1,
    marginLeft: '16px',
    display: 'flex',
    flexDirection: 'column'
  },
  userRole: {
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    color: '#007AFF',
    letterSpacing: '0.5px'
  },
  username: {
    fontSize: '16px',
    fontWeight: 600
  },
  editIconBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    padding: '8px'
  },
  inlineEdit: {
    marginTop: '12px',
    display: 'flex',
    gap: '8px'
  },
  miniInput: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '13px'
  },
  saveBtn: {
    padding: '8px 16px',
    backgroundColor: '#34C759',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer'
  }
};

export default AdminDashboard;
