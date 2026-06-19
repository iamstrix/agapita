import React, { useState, useRef, useEffect } from 'react';
import { login } from '../api/auth';
import logoUrl from '../assets/AGAPITA_FULL.png';

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

const COLORS = ['#3b82f6', '#60a5fa', '#2563eb', '#93c5fd'];

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

        ctx.globalAlpha = currentOpacity * 0.15;
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

  const handleProfileSelect = async (profileType: 'patient' | 'caretaker') => {
    setIsLoading(true);
    setError('');
    try {
      const defaultPassword = '123';
      const username = profileType === 'caretaker' ? 'care' : profileType;
      const data = await login(username, defaultPassword);
      
      // Inject global animation styles if not exists
      if (!document.getElementById('circle-expand-fade')) {
        const style = document.createElement('style');
        style.id = 'circle-expand-fade';
        style.innerHTML = `
          @keyframes circleExpandFade {
            0% { clip-path: circle(0% at 50% 50%); opacity: 0; }
            10% { opacity: 1; }
            50% { clip-path: circle(150% at 50% 50%); opacity: 1; }
            100% { clip-path: circle(150% at 50% 50%); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }

      // Create overlay that persists during unmount
      const overlay = document.createElement('div');
      overlay.className = `fixed inset-0 z-[9999] pointer-events-none ${profileType === 'patient' ? 'bg-brand-500' : 'bg-white dark:bg-zinc-950'}`;
      overlay.style.animation = 'circleExpandFade 1.2s ease-in-out forwards';
      document.body.appendChild(overlay);
      
      // Call onLogin halfway through the animation when screen is covered
      setTimeout(() => {
        onLogin(data);
      }, 600);
      
      // Cleanup overlay after animation ends
      setTimeout(() => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      }, 1200);

    } catch (err: any) {
      setError('Invalid credentials. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-screen h-screen flex items-center justify-center bg-white dark:bg-zinc-950 overflow-hidden">

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

      {/* Profile Selection Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full pointer-events-auto">
        <div className="flex flex-col items-center text-center px-4 w-full -mt-10 mb-4">
          <img
            src={logoUrl}
            alt="Agapita Logo"
            className="w-[85vw] max-w-[500px] md:max-w-[800px] lg:max-w-[1000px] h-auto object-cover drop-shadow-xl"
            style={{ clipPath: 'inset(10% 0 10% 0)' }}
          />
        </div>

        <div className="flex justify-center gap-6 md:gap-10">
          <button
            onClick={() => handleProfileSelect('patient')}
            disabled={isLoading}
            className="flex flex-col items-center gap-4 transition-all group disabled:opacity-70 disabled:cursor-not-allowed active:scale-95 duration-150"
          >
            <div className="w-48 h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-3xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg group-hover:ring-4 group-hover:ring-white transition-all duration-300">
              <svg className="w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="font-medium text-lg md:text-xl text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">Patient</span>
          </button>

          <button
            onClick={() => handleProfileSelect('caretaker')}
            disabled={isLoading}
            className="flex flex-col items-center gap-4 transition-all group disabled:opacity-70 disabled:cursor-not-allowed active:scale-95 duration-150"
          >
            <div className="w-48 h-48 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-3xl bg-white border-2 border-brand-500 flex items-center justify-center shadow-lg group-hover:ring-4 group-hover:ring-brand-400 transition-all duration-300">
              <svg className="w-24 h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <span className="font-medium text-lg md:text-xl text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">Caretaker</span>
          </button>
        </div>

        {error && <p className="text-red-500 text-sm mt-8 mb-0 text-center font-medium">{error}</p>}


      </div>
    </div>
  );
};

export default LoginPage;
