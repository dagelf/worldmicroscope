import React, { useRef, useEffect, useState } from 'react';
import { Camera, AlertCircle, ScanLine, BrainCircuit, Expand, Move, Tag } from 'lucide-react';
import { BiologicalEntity } from '../types';

interface MicroscopeViewProps {
  onFrameData: (data: ImageData) => void;
  onFrameCapture: (base64: string) => void;
  isActive: boolean;
  isAnalyzing: boolean;
  onToggleExpand: () => void;
  history: BiologicalEntity[];
}

const MicroscopeView: React.FC<MicroscopeViewProps> = ({ 
    onFrameData, 
    onFrameCapture, 
    isActive, 
    isAnalyzing,
    onToggleExpand,
    history
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Pan & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Visual Effects State
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } } // Optimized for performance/processing
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setError("Microscope/Camera access denied or not found.");
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Frame Processing Loop
  useEffect(() => {
    if (!isActive || !stream) return;

    let animationFrameId: number;

    const processFrame = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (ctx && video.videoWidth > 0) {
          if (canvas.width !== video.videoWidth) {
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
          }
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // 1. Send Raw Data for Vision (High FPS)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          onFrameData(imageData);
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    animationFrameId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, stream, onFrameData]);

  const handleManualCapture = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (canvasRef.current && !isAnalyzing) {
          // Trigger one-time flash
          setIsScanning(true);
          setTimeout(() => setIsScanning(false), 1000);

          const base64 = canvasRef.current.toDataURL('image/jpeg', 0.6).split(',')[1];
          onFrameCapture(base64);
      }
  };

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (e.button === 0) { // Left Click -> Pan
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 1) { // Middle Click -> Expand
      onToggleExpand();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => isDragging.current = false;
  
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(Math.max(1, prev + delta), 10)); // Clamp 1x - 10x
  };

  return (
    <div 
        className="relative w-full h-full bg-black overflow-hidden border border-zinc-800 rounded-lg group cursor-move"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
    >
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-cyan-400 text-xs border border-cyan-900/50 pointer-events-none">
        <Camera size={14} />
        <span>LIVE FEED // L:PAN M:EXPAND</span>
      </div>

      {/* RECENT CLASSIFICATIONS */}
      <div className="absolute top-10 left-2 z-10 flex flex-col gap-2 pointer-events-none w-56">
         {history.slice(0, 3).map((entity) => (
             <div 
                key={entity.id} 
                className="bg-black/40 backdrop-blur-md border-l-2 border-cyan-500 p-2 text-xs rounded-r transition-all animate-in slide-in-from-left fade-in duration-500"
             >
                <div className="flex justify-between items-center text-cyan-300 font-bold mb-0.5">
                    <span>{entity.name}</span>
                    <span className="text-[10px] bg-cyan-900/50 px-1 rounded">{(entity.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="text-[10px] text-zinc-400 truncate">{entity.description}</div>
             </div>
         ))}
      </div>

      {/* Manual Classify Button */}
      <button 
        onClick={handleManualCapture}
        disabled={isAnalyzing}
        className="absolute top-2 right-2 z-20 flex items-center gap-2 bg-cyan-950/80 border border-cyan-500 text-cyan-400 px-3 py-1 rounded text-xs font-bold hover:bg-cyan-900 transition-colors disabled:opacity-50 disabled:cursor-wait backdrop-blur-sm shadow-[0_0_10px_rgba(34,211,238,0.2)]"
        onMouseDown={e => e.stopPropagation()} 
      >
        <BrainCircuit size={14} className={isAnalyzing ? "animate-pulse" : ""} />
        {isAnalyzing ? "ANALYZING..." : "CLASSIFY"}
      </button>

      {/* Zoom/Pan Info */}
      <div className="absolute bottom-2 right-2 z-10 flex flex-col items-end gap-1 pointer-events-none">
         <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-zinc-400 text-[10px] border border-zinc-800">
             <Expand size={10} /> {zoom.toFixed(1)}x
         </div>
         {(pan.x !== 0 || pan.y !== 0) && (
            <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-zinc-400 text-[10px] border border-zinc-800">
                <Move size={10} /> {pan.x.toFixed(0)},{pan.y.toFixed(0)}
            </div>
         )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center h-full text-red-500 gap-4 pointer-events-none">
          <AlertCircle size={48} />
          <p>{error}</p>
        </div>
      ) : (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover opacity-80 transition-transform duration-75 origin-center"
            style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
            }}
          />
          <canvas ref={canvasRef} className="hidden" />
          
          {/* Static Grid Lines */}
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_50%,rgba(0,255,255,0.1)_50%)] bg-[length:100%_4px]" />
          
          {/* Active Scanning Flash */}
          <div 
            className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-opacity duration-700 ${isScanning ? 'opacity-100' : 'opacity-0'}`}
          >
             <div className="absolute inset-0 bg-cyan-500/10 mix-blend-screen" />
             <ScanLine className="text-cyan-400 w-full h-full animate-pulse opacity-50" />
             <div className="absolute top-0 left-0 w-full h-1 bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,1)] animate-[scan_1s_ease-in-out_infinite]" />
          </div>
        </>
      )}
    </div>
  );
};

export default MicroscopeView;