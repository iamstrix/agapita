import React, { useState, useRef, useEffect } from 'react';
import { login } from '../api/auth';

interface LoginPageProps {
  onLogin: (userData: any) => void;
}

interface Point { x: number; y: number; }

interface FloatingObject {
  id: number;
  points?: Point[];
  pathStr?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRotation: number;
  scale: number;
  opacity: number;
  color: string;
  createdAt: number;
  lifespan?: number;
}

const COLORS = ['#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#10b981', '#3b82f6'];

const generateRandomShape = () => {
  const shapes = [
    // Abstract Scribble
    () => {
      let path = `M ${Math.random() * 40 - 20} ${Math.random() * 40 - 20} `;
      const curves = Math.floor(Math.random() * 3) + 2; 
      for (let i = 0; i < curves; i++) {
        path += `Q ${Math.random() * 100 - 50} ${Math.random() * 100 - 50} ${Math.random() * 80 - 40} ${Math.random() * 80 - 40} `;
      }
      return path;
    },
    // Star
    () => 'M 0 -40 L 12 -12 L 40 -12 L 16 8 L 24 40 L 0 20 L -24 40 L -16 8 L -40 -12 L -12 -12 Z',
    // Square
    () => 'M -30 -30 L 30 -30 L 30 30 L -30 30 Z',
    // Triangle
    () => 'M 0 -35 L 35 30 L -35 30 Z',
    // Hexagon
    () => 'M 0 -40 L 34.6 -20 L 34.6 20 L 0 40 L -34.6 20 L -34.6 -20 Z',
    // Heart
    () => 'M 0 25 C 0 25 -40 0 -40 -20 C -40 -40 -10 -40 0 -20 C 10 -40 40 -40 40 -20 C 40 0 0 25 0 25 Z'
  ];
  return shapes[Math.floor(Math.random() * shapes.length)]();
};

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('patient');
  const [password, setPassword] = useState('123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectsRef = useRef<FloatingObject[]>([]);
  const currentPathRef = useRef<Point[]>([]);
  const currentStrokeColorRef = useRef<string>(COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastTimeRef = useRef<number>(performance.now());
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId: number;

    const render = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isDark = document.documentElement.classList.contains('dark');
      const userStrokeColor = isDark ? '#e4e4e7' : '#27272a';

      // 1. Render & Update Floating Objects
      objectsRef.current = objectsRef.current.filter(obj => {
        // Update physics
        obj.x += obj.vx * dt;
        obj.y += obj.vy * dt;
        obj.rotation += obj.vRotation * dt;

        // Bounce
        if (obj.x < -100) obj.vx = Math.abs(obj.vx);
        if (obj.x > canvas.width + 100) obj.vx = -Math.abs(obj.vx);
        if (obj.y < -100) obj.vy = Math.abs(obj.vy);
        if (obj.y > canvas.height + 100) obj.vy = -Math.abs(obj.vy);

        // Lifespan & fading
        let currentOpacity = obj.opacity;
        if (obj.lifespan) {
          const age = time - obj.createdAt;
          if (age > obj.lifespan) return false;

          if (age < 1000) currentOpacity = (age / 1000);
          else if (age > obj.lifespan - 1000) currentOpacity = ((obj.lifespan - age) / 1000);
          else currentOpacity = 1;
        }

        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.rotation);
        ctx.scale(obj.scale, obj.scale);

        ctx.globalAlpha = currentOpacity * 0.4;
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = obj.pathStr ? 4 : 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (obj.points && obj.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.stroke();
        } else if (obj.pathStr) {
          const p = new Path2D(obj.pathStr);
          ctx.stroke(p);
        }

        ctx.restore();
        return true;
      });

      // 2. Render Current Drawing Path
      if (currentPathRef.current.length > 0) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = currentStrokeColorRef.current;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(currentPathRef.current[0].x, currentPathRef.current[0].y);
        for (let i = 1; i < currentPathRef.current.length; i++) {
          ctx.lineTo(currentPathRef.current[i].x, currentPathRef.current[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Spawner for random background scribbles
  useEffect(() => {
    const interval = setInterval(() => {
      // Spawn occasionally to keep it dynamic but not cluttered
      if (objectsRef.current.length < 30) {
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        objectsRef.current.push({
          id: Math.random(),
          pathStr: generateRandomShape(),
          x: Math.random() * cw,
          y: Math.random() * ch,
          vx: (Math.random() - 0.5) * 60,
          vy: (Math.random() - 0.5) * 60,
          rotation: Math.random() * Math.PI * 2,
          vRotation: (Math.random() - 0.5) * 1.5,
          scale: Math.random() * 1.5 + 0.5,
          opacity: 0,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          createdAt: performance.now(),
          lifespan: 15000 + Math.random() * 10000 // 15s to 25s
        });
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Input Handlers
  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = ('touches' in e) ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getPointerPos(e);
    currentPathRef.current = [pos];
    currentStrokeColorRef.current = COLORS[Math.floor(Math.random() * COLORS.length)];
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const pos = getPointerPos(e);
    currentPathRef.current.push(pos);
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const pts = currentPathRef.current;
    if (pts.length > 2) {
      // Find bounding center
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const normalizedPts = pts.map(p => ({ x: p.x - cx, y: p.y - cy }));

      objectsRef.current.push({
        id: Math.random(),
        points: normalizedPts,
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        rotation: 0,
        vRotation: (Math.random() - 0.5) * 2,
        scale: 1,
        opacity: 1,
        color: currentStrokeColorRef.current,
        createdAt: performance.now()
      });

      // Keep object count reasonable
      if (objectsRef.current.length > 50) {
        objectsRef.current.shift();
      }
    }
    currentPathRef.current = [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await login(username, password);
      onLogin(data);
    } catch (err: any) {
      if (err.response) {
        if (err.response.status === 401) {
          setError('Invalid credentials. Please try again.');
        } else {
          setError(`Server error (${err.response.status}): ${err.response.data?.detail || 'Please try again.'}`);
        }
      } else if (err.request) {
        setError('Connection failed. Please check if the backend server is running and the VITE_SERVER_URL in your .env file is correct.');
      } else {
        setError(`Authentication failed: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-white dark:bg-zinc-950 canvas-dots overflow-hidden">
      
      {/* Background Interactive Canvas */}
      <canvas
        ref={canvasRef}
        width={windowSize.width}
        height={windowSize.height}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none z-0"
        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={endDrawing} onMouseLeave={endDrawing}
        onTouchStart={(e) => { startDrawing(e); }}
        onTouchMove={(e) => { draw(e); }}
        onTouchEnd={endDrawing}
      />

      {/* Login Card overlay */}
      <div className="relative z-10 w-full max-w-[400px] p-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-white/40 dark:border-zinc-800/60 rounded-3xl shadow-2xl text-center pointer-events-auto">
        <div className="mb-8 flex flex-col items-center">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mb-4 shadow-[0_8px_16px_rgba(0,122,255,0.3)]">
            A
          </div>
          <h1 className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-50 tracking-tight m-0">Agapita</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">Secure Communication Bridge</p>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 text-left">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 ml-1">Identifier</label>
            <input
              type="text"
              placeholder="Username or Patient ID"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 text-zinc-900 dark:text-zinc-100 text-base outline-none focus:ring-2 focus:ring-brand-500/50 transition-all shadow-sm"
              required
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 ml-1">Access Key</label>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 text-zinc-900 dark:text-zinc-100 text-base outline-none focus:ring-2 focus:ring-brand-500/50 transition-all shadow-sm"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm m-0 text-center font-medium">{error}</p>}
          
          <button 
            type="submit" 
            disabled={isLoading}
            className="mt-2 p-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-lg shadow-[0_4px_12px_rgba(0,122,255,0.2)] hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-8 pt-5 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 dark:text-zinc-500 m-0 uppercase tracking-wider font-semibold">Offline Edge Node: Local Facility Only</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
