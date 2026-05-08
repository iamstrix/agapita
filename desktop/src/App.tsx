import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import CaretakerDashboard from './pages/CaretakerDashboard';
import PatientDashboard from './pages/PatientDashboard';

function App() {
  const [user, setUser] = useState<{ username: string; role: string; token: string; id?: number } | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setUser({ ...JSON.parse(savedUser), token: savedToken });
    }
  }, []);

  const handleLogin = (userData: any) => {
    const userInfo = { 
      username: userData.username, 
      role: userData.role, 
      token: userData.access_token,
      id: userData.id
    };
    setUser(userInfo);
    localStorage.setItem('token', userData.access_token);
    localStorage.setItem('user', JSON.stringify({ 
      username: userData.username, 
      role: userData.role,
      id: userData.id
    }));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={user ? <Navigate to={`/${user.role}`} /> : <LoginPage onLogin={handleLogin} />} 
        />
        <Route 
          path="/admin/*" 
          element={user?.role === 'admin' ? <AdminDashboard onLogout={handleLogout} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/caretaker/*" 
          element={user?.role === 'caretaker' ? <CaretakerDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/patient/*" 
          element={user?.role === 'patient' ? <PatientDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} 
        />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
