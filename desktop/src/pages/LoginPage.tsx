import React, { useState } from 'react';
import { login } from '../api/auth';

interface LoginPageProps {
  onLogin: (userData: any) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('PatientA');
  const [password, setPassword] = useState('a123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await login(username, password);
      onLogin(data);
    } catch (err: any) {
      setError('Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.glassCard}>
        <div style={styles.header}>
          <div style={styles.logo}>A</div>
          <h1 style={styles.title}>Agapita</h1>
          <p style={styles.subtitle}>Secure Communication Bridge</p>
        </div>
        
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Identifier</label>
            <input
              type="text"
              placeholder="Username or Patient ID"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={styles.input}
              required
            />
          </div>
          
          <div style={styles.inputGroup}>
            <label style={styles.label}>Access Key</label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}
          
          <button type="submit" style={styles.button} disabled={isLoading}>
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
        
        <div style={styles.footer}>
          <p style={styles.footerText}>Offline Edge Node: Local Facility Only</p>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  },
  glassCard: {
    padding: '48px',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(10px)',
    borderRadius: '24px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
    width: '400px',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    textAlign: 'center'
  },
  header: {
    marginBottom: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  logo: {
    width: '48px',
    height: '48px',
    backgroundColor: '#007AFF',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '24px',
    marginBottom: '16px',
    boxShadow: '0 8px 16px rgba(0, 122, 255, 0.3)'
  },
  title: { 
    margin: 0, 
    fontSize: '28px', 
    fontWeight: 800,
    color: '#1a1a1a',
    letterSpacing: '-0.5px'
  },
  subtitle: { 
    color: '#666', 
    margin: '4px 0 0 0',
    fontSize: '16px'
  },
  form: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '20px',
    textAlign: 'left'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#495057',
    marginLeft: '4px'
  },
  input: { 
    padding: '12px 16px', 
    borderRadius: '12px', 
    border: '1px solid #dee2e6',
    fontSize: '16px',
    transition: 'border-color 0.2s',
    outline: 'none',
    backgroundColor: 'rgba(255, 255, 255, 0.9)'
  },
  button: { 
    padding: '14px', 
    backgroundColor: '#007AFF', 
    color: 'white', 
    border: 'none', 
    borderRadius: '12px', 
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 600,
    marginTop: '10px',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(0, 122, 255, 0.2)'
  },
  error: { 
    color: '#dc3545', 
    fontSize: '14px', 
    margin: '0', 
    textAlign: 'center',
    fontWeight: 500
  },
  footer: {
    marginTop: '32px',
    borderTop: '1px solid #eee',
    paddingTop: '20px'
  },
  footerText: {
    fontSize: '12px',
    color: '#adb5bd',
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }
};

export default LoginPage;
