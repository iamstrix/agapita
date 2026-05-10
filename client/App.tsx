import React, { useRef, useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Canvas,
  Path,
  Skia,
  useTouchHandler,
  useCanvasRef,
  ImageFormat,
} from '@shopify/react-native-skia';
import io from 'socket.io-client';
import axios from 'axios';
import { Camera, RotateCcw, Send, CheckCircle2, AlertCircle, LogOut } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const SERVER_URL = 'http://localhost:8000'; // Using localhost over ADB reverse

type Mode = 'login' | 'sketch' | 'processing' | 'confirming' | 'result' | 'records';

interface PathData {
  path: any;
  color: string;
}

const App = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('patient');
  const [password, setPassword] = useState('123');
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);

  const [paths, setPaths] = useState<PathData[]>([]);
  const [currentPath, setCurrentPath] = useState<any | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);

  const pathsRef = useRef<PathData[]>([]);
  const currentPathRef = useRef<any | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [intent, setIntent] = useState<string | null>(null);
  const [caretakerAlert, setCaretakerAlert] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientRecords, setPatientRecords] = useState<string[]>([]);
  const [originalSketch, setOriginalSketch] = useState<string | null>(null);

  const socketRef = useRef<any>(null);
  const canvasRef = useCanvasRef();

  const handleLogin = async () => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const response = await axios.post(`${SERVER_URL}/api/auth/login`, formData);
      setToken(response.data.access_token);
      setUser(response.data);
      setMode('sketch');
      setError(null);
    } catch (err: any) {
      console.error("Login error:", err);
      const msg = err.response?.data?.detail || err.message || "Login failed.";
      setError(`Login Error: ${msg}`);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setMode('login');
    if (socketRef.current) socketRef.current.disconnect();
  };

  useEffect(() => {
    if (!token) return;

    socketRef.current = io(SERVER_URL, {
      transports: ['websocket'],
      auth: { token }
    });

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      setError(null);
      socketRef.current.emit('request_records', {});
    });

    socketRef.current.on('connect_error', (err: any) => {
      console.log('Connection error:', err);
      setError(`Connection failed: ${err.message}`);
    });

    socketRef.current.on('interpretation_received', (data: any) => {
      setIntent(data.patient_text); // Patient sees telegraphic
      setCaretakerAlert(data.caretaker_alert); // Background alert
      setOptions(data.options);
      setOriginalSketch(data.original_sketch);
      setMode('confirming');
    });

    socketRef.current.on('interpretation_dispatched', (data: any) => {
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
  }, [token]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (mode === 'processing') {
      timer = setTimeout(() => {
        if (mode === 'processing') {
          setError("Interpretation timed out. Please try again.");
          setMode('sketch');
        }
      }, 30000);
    }
    return () => clearTimeout(timer);
  }, [mode]);

  const touchHandler = useTouchHandler({
    onStart: ({ x, y }) => {
      const newPath = Skia.Path.Make();
      newPath.moveTo(x, y);
      currentPathRef.current = newPath;
      setCurrentPath(newPath);
    },
    onActive: ({ x, y }) => {
      if (currentPathRef.current) {
        currentPathRef.current.lineTo(x, y);
        setCurrentPath(currentPathRef.current.copy());
      }
    },
    onEnd: () => {
      if (currentPathRef.current) {
        const finalPath = currentPathRef.current.copy();
        pathsRef.current = [...pathsRef.current, { path: finalPath, color: 'black' }];
        setPaths(pathsRef.current);
        currentPathRef.current = null;
        setCurrentPath(null);
      }
    },
  }, []);

  const clearCanvas = () => {
    pathsRef.current = [];
    currentPathRef.current = null;
    setPaths([]);
    setCurrentPath(null);
    setCanvasKey((k) => k + 1);
    setError(null);
    setMode('sketch');
  };

  const handleInterpret = () => {
    if (paths.length === 0) return;

    const snapshot = canvasRef.current?.makeImageSnapshot();
    if (!snapshot) {
      setError("Failed to capture sketch");
      return;
    }

    setMode('processing');
    setError(null);

    try {
      const base64 = snapshot.encodeToBase64(ImageFormat.PNG, 100);
      const dataUrl = `data:image/png;base64,${base64}`;

      socketRef.current.emit('process_sketch', {
        image: dataUrl,
        patient_id: user.username
      });
      setOriginalSketch(dataUrl);
    } catch (e) {
      console.error(e);
      setError("Failed to encode image");
      setMode('sketch');
    }
  };

  const handleSelectOption = (tag: string) => {
    setMode('processing');
    socketRef.current.emit('pinpoint_selection', {
      tag,
      patient_id: user.username,
      original_sketch: originalSketch
    });
  };

  const handleSendInterpretation = () => {
    if (!caretakerAlert || !intent) return;
    socketRef.current.emit('send_interpretation', {
      caretaker_alert: caretakerAlert,
      patient_text: intent,
      patient_id: user.username
    });
  };

  const renderContent = () => {
    switch (mode) {
      case 'login':
        return (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.centered}
          >
            <View style={styles.loginCard}>
              <Text style={styles.loginTitle}>Agapita</Text>
              <Text style={styles.loginSubtitle}>Patient Login</Text>

              <TextInput
                style={styles.input}
                placeholder="Patient ID (e.g. PatientA)"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {error && <Text style={styles.errorTextSmall}>{error}</Text>}

              <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                <Text style={styles.loginButtonText}>Enter</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        );

      case 'sketch':
        return (
          <View style={styles.container}>
            <View style={styles.header}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.title}>Agapita</Text>
                  <Text style={styles.subtitle}>Welcome, {user?.username}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => setMode('records')}
                    style={{ marginRight: 20 }}
                  >
                    <CheckCircle2 color="#007AFF" size={28} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleLogout}>
                    <LogOut color="#666" size={28} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {error && (
              <View style={styles.errorBanner}>
                <AlertCircle color="#FF3B30" size={20} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.canvasContainer}>
              <Canvas
                key={canvasKey}
                ref={canvasRef}
                style={styles.canvas}
                onTouch={touchHandler}
              >
                {paths.map((p, index) => (
                  <Path
                    key={index}
                    path={p.path}
                    color={p.color}
                    style="stroke"
                    strokeWidth={5}
                  />
                ))}
                {currentPath && (
                  <Path
                    path={currentPath}
                    color="black"
                    style="stroke"
                    strokeWidth={5}
                  />
                )}
              </Canvas>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity style={styles.iconButton} onPress={clearCanvas}>
                <RotateCcw color="#666" size={32} />
                <Text style={styles.iconText}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sendButton} onPress={handleInterpret}>
                <Send color="white" size={32} />
                <Text style={styles.sendText}>Interpret</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'processing':
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.processingText}>Interpreting your sketch...</Text>
          </View>
        );

      case 'confirming':
        return (
          <View style={styles.container}>
            <Text style={styles.title}>Confirm Request</Text>

            <View style={styles.intentCard}>
              <Text style={styles.intentLabel}>"Is this what you need?"</Text>
              <Text style={styles.intentTextLarge}>{intent}</Text>

              <View style={styles.confirmRow}>
                <TouchableOpacity style={styles.sendBigButton} onPress={handleSendInterpretation}>
                  <Send color="white" size={24} />
                  <Text style={styles.sendBigText}>Yes, Send</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.redrawButton} onPress={clearCanvas}>
                  <RotateCcw color="#666" size={24} />
                  <Text style={styles.redrawText}>Redraw</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.alternativesHeader}>
              <Text style={styles.altTitle}>Not right? Try these:</Text>
            </View>

            <View style={styles.miniGrid}>
              {options.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.miniGridItem}
                  onPress={() => handleSelectOption(option)}
                >
                  <Text style={styles.miniGridText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 'result':
        return (
          <View style={styles.centered}>
            <CheckCircle2 color="#4CD964" size={80} />
            <Text style={styles.intentTitle}>Message Sent:</Text>
            <Text style={styles.intentText}>"{intent}"</Text>
            <TouchableOpacity style={styles.doneButton} onPress={() => {
              setMode('sketch');
              clearCanvas();
            }}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        );

      case 'records':
        return (
          <View style={styles.container}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>Context</Text>
                <Text style={styles.subtitle}>Real-time RAG Monitor</Text>
              </View>
              <TouchableOpacity onPress={() => setMode('sketch')}>
                <CheckCircle2 color="#007AFF" size={32} />
              </TouchableOpacity>
            </View>
            <View style={{ marginTop: 30, flex: 1 }}>
              {patientRecords.length === 0 ? (
                <View style={styles.centered}>
                  <Text style={{ color: '#999', fontStyle: 'italic', fontSize: 18 }}>No active medical records.</Text>
                </View>
              ) : (
                patientRecords.map((rec, i) => (
                  <View key={i} style={styles.recordItem}>
                    <Text style={styles.recordTextItem}>{rec}</Text>
                  </View>
                ))
              )}
            </View>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setMode('sketch')}
            >
              <Text style={styles.doneText}>Return to Sketch</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderContent()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { flex: 1, padding: 20 },
  header: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1A1A1A' },
  subtitle: { fontSize: 18, color: '#666' },
  loginCard: { width: '80%', padding: 30, backgroundColor: 'white', borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, alignItems: 'center' },
  loginTitle: { fontSize: 40, fontWeight: 'bold', color: '#007AFF', marginBottom: 5 },
  loginSubtitle: { fontSize: 20, color: '#666', marginBottom: 30 },
  input: { width: '100%', height: 50, borderBottomWidth: 1, borderBottomColor: '#DDD', marginBottom: 20, fontSize: 18, paddingHorizontal: 10, color: '#000' },
  loginButton: { backgroundColor: '#007AFF', paddingVertical: 15, paddingHorizontal: 60, borderRadius: 30, marginTop: 10 },
  loginButtonText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  errorBanner: { backgroundColor: '#FFE5E5', padding: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  errorText: { color: '#FF3B30', marginLeft: 10, fontWeight: '600' },
  errorTextSmall: { color: '#FF3B30', marginBottom: 15, textAlign: 'center' },
  canvasContainer: { flex: 1, backgroundColor: 'white', borderRadius: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, overflow: 'hidden' },
  canvas: { flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  iconButton: { alignItems: 'center', padding: 10 },
  iconText: { marginTop: 5, color: '#666', fontWeight: '600' },
  sendButton: { backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 30 },
  sendText: { color: 'white', fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  processingText: { marginTop: 20, fontSize: 20, color: '#333' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 20 },
  gridItem: { width: '48%', backgroundColor: 'white', borderRadius: 15, padding: 15, marginBottom: 15, alignItems: 'center', elevation: 3 },
  placeholderImage: { width: 100, height: 100, backgroundColor: '#F0F0F0', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  gridText: { fontSize: 16, fontWeight: 'bold', color: '#333', textTransform: 'capitalize' },
  cancelButton: { marginTop: 20, alignItems: 'center', padding: 15 },
  cancelText: { color: '#007AFF', fontSize: 18, fontWeight: '600' },
  intentTitle: { fontSize: 24, color: '#666', marginTop: 20 },
  intentText: { fontSize: 32, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'center', marginVertical: 20 },
  doneButton: { backgroundColor: '#4CD964', paddingVertical: 15, paddingHorizontal: 60, borderRadius: 30, marginTop: 20 },
  doneText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  recordItem: {
    backgroundColor: 'white',
    padding: 18,
    borderRadius: 15,
    marginBottom: 12,
    borderLeftWidth: 6,
    borderLeftColor: '#007AFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  recordTextItem: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    fontWeight: '500',
  },
  intentCard: {
    backgroundColor: 'white',
    padding: 25,
    borderRadius: 20,
    marginTop: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  intentLabel: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  intentTextLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 25,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  sendBigButton: {
    flex: 2,
    backgroundColor: '#34C759',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 15,
  },
  sendBigText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  redrawButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 15,
  },
  redrawText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 5,
  },
  alternativesHeader: {
    marginTop: 30,
    marginBottom: 15,
  },
  altTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#666',
  },
  miniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  miniGridItem: {
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  miniGridText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textTransform: 'capitalize',
  },
});

export default App;
