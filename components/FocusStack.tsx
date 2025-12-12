import React, { useRef, useState, useEffect } from 'react';
import { Layers, Settings2, ZoomIn, Download, Move, Trash2, MousePointerClick, Bug } from 'lucide-react';
import { mergeFocusStack, alignFrames, getAverageColor } from '../services/vision';

interface FocusStackProps {
  currentImageData: ImageData | null;
  currentDepth: number;
  maxDepth: number;
  onReset: () => void;
  onStack: (newDepth: number) => void; // Callback to increment depth in parent
}

const FocusStack: React.FC<FocusStackProps> = ({ currentImageData, currentDepth, maxDepth, onReset, onStack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Persistent Accumulator State
  const accumulatorRef = useRef<{
    pixels: ImageData;
    sharpness: Float32Array;
  } | null>(null);

  // User Parameters
  const [sensitivity, setSensitivity] = useState(5); 
  const [threshold, setThreshold] = useState(20); // Default sharpness threshold
  const [showSettings, setShowSettings] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetDisplay, setOffsetDisplay] = useState({x:0, y:0});
  const [isProcessing, setIsProcessing] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState<string>("#000000");
  
  // Panning State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Toggle Debug
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'd' || e.key === 'D') {
            setDebugMode(prev => !prev);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // RESET LOCAL & GLOBAL
  const handleLocalReset = () => {
    accumulatorRef.current = null;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
        ctx.clearRect(0,0, canvasRef.current.width, canvasRef.current.height);
    }
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setOffsetDisplay({x:0, y:0});
    setBackgroundColor("#000000");
  };

  const handleFullReset = () => {
    handleLocalReset();
    onReset();
  }

  // --- MANUAL STACKING ACTION ---
  const performStacking = async () => {
      if (!currentImageData || !canvasRef.current) return;
      setIsProcessing(true);

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // 1. Initialize if empty
      if (!accumulatorRef.current || 
          accumulatorRef.current.pixels.width !== currentImageData.width || 
          accumulatorRef.current.pixels.height !== currentImageData.height) {
          
          // Calculate average background color from the base layer
          const avgColor = getAverageColor(currentImageData);
          setBackgroundColor(avgColor);

          // Create a blank/transparent accumulator to merge the first frame INTO
          // This ensures the first frame is subject to the sharpness mask/transparency check
          const emptyAccPixels = new ImageData(
              new Uint8ClampedArray(currentImageData.width * currentImageData.height * 4), 
              currentImageData.width, 
              currentImageData.height
          );
          const emptyAccSharpness = new Float32Array(currentImageData.width * currentImageData.height).fill(0);
          
          // Perform initial merge (First frame vs Empty)
          const result = mergeFocusStack(
              emptyAccPixels,
              emptyAccSharpness,
              currentImageData,
              0, 
              0,
              sensitivity,
              threshold,
              debugMode
          );
          
          accumulatorRef.current = {
              pixels: result.imageData, 
              sharpness: result.sharpness
          };
          
          canvasRef.current.width = currentImageData.width;
          canvasRef.current.height = currentImageData.height;
          ctx.putImageData(result.imageData, 0, 0);
          
          onStack(1); 
          setIsProcessing(false);
          return;
      }

      // 2. Align
      const alignment = alignFrames(accumulatorRef.current.pixels, currentImageData);
      
      let finalX = alignment.x;
      let finalY = alignment.y;

      // Check alignment confidence. 
      // If POOR, we assume manual stability (User is holding still) and force stack at 0,0.
      if (alignment.confidence <= 0.5 || Math.abs(alignment.x) > 100 || Math.abs(alignment.y) > 100) {
         console.warn("Alignment poor, forcing manual stack at 0,0");
         finalX = 0;
         finalY = 0;
      }
      
      setOffsetDisplay({ x: finalX, y: finalY });

      // 3. Merge (Always performed now)
      const result = mergeFocusStack(
          accumulatorRef.current.pixels,
          accumulatorRef.current.sharpness,
          currentImageData,
          finalX, 
          finalY,
          sensitivity,
          threshold,
          debugMode
      );

      accumulatorRef.current = {
          pixels: result.imageData,
          sharpness: result.sharpness
      };
      
      ctx.putImageData(result.imageData, 0, 0);
      
      // Increment Global Depth
      onStack(currentDepth + 1);
      
      setIsProcessing(false);
  };

  // MOUSE HANDLERS
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); 
    if (e.button === 0) { // Left Click -> PAN START
        isDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 1) { // Middle Click -> STACK
        performStacking();
    } else if (e.button === 2) { // Right Click -> RESET
        handleFullReset();
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

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); 
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom(prev => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        return Math.min(Math.max(0.5, prev + delta), 10);
    });
  };

  // Calculate percentage of depth
  const depthPct = maxDepth > 0 ? (currentDepth / maxDepth) * 100 : 0;

  return (
    <div 
        className="relative w-full h-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col group"
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
    >
       <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-yellow-400 text-xs border border-yellow-900/50 pointer-events-none">
        <Layers size={14} />
        <span>FOCUS STACK // L:PAN M:STACK R:RESET</span>
      </div>

      <div className="absolute top-2 right-2 z-20" onMouseDown={e => e.stopPropagation()}>
        <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1 rounded border ${debugMode ? 'bg-pink-900 border-pink-500 text-pink-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}
        >
            <Settings2 size={14} />
        </button>
      </div>

      {debugMode && (
         <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-pink-500/20 border border-pink-500 text-pink-300 px-2 py-1 rounded text-[10px] font-bold pointer-events-none animate-pulse">
            DEBUG MODE [D]
         </div>
      )}

      {showSettings && (
        <div className="absolute top-10 right-2 z-20 w-48 bg-zinc-900/95 border border-zinc-700 p-3 rounded shadow-xl backdrop-blur" onMouseDown={e => e.stopPropagation()}>
            <h3 className="text-[10px] text-zinc-500 uppercase font-bold mb-2">Stack Parameters</h3>
            
            <div className="mb-2">
                <label className="text-[10px] text-zinc-300 block mb-1">Mask Threshold ({threshold})</label>
                <input 
                    type="range" min="0" max="100" 
                    value={threshold} 
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full accent-yellow-500 h-1 bg-zinc-700 rounded appearance-none"
                />
            </div>

            <div className="mb-2">
                <label className="text-[10px] text-zinc-300 block mb-1">Merge Sensitivity ({sensitivity})</label>
                <input 
                    type="range" min="1" max="50" 
                    value={sensitivity} 
                    onChange={(e) => setSensitivity(Number(e.target.value))}
                    className="w-full accent-yellow-500 h-1 bg-zinc-700 rounded appearance-none"
                />
            </div>

            <div className="flex gap-2 mt-2">
                <button 
                    onClick={() => setDebugMode(!debugMode)}
                    className={`flex-1 flex items-center justify-center gap-1 border rounded py-1 text-[10px] ${debugMode ? 'bg-pink-900/30 text-pink-400 border-pink-900/50' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                >
                    <Bug size={10} /> DEBUG
                </button>
                <button 
                    onClick={handleLocalReset}
                    className="flex-1 flex items-center justify-center gap-1 bg-red-900/30 text-red-400 border border-red-900/50 rounded py-1 text-[10px] hover:bg-red-900/50"
                >
                    <Trash2 size={10} /> CLEAR
                </button>
            </div>
        </div>
      )}

      {/* DEPTH INDICATOR */}
      <div className="absolute left-2 top-12 bottom-12 w-2 bg-zinc-900 border border-zinc-800 rounded-full flex flex-col justify-end p-0.5 pointer-events-none z-10">
         <div 
            className="w-full bg-blue-500 rounded-full transition-all duration-300 opacity-80"
            style={{ height: `${depthPct}%` }}
         />
      </div>
      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[9px] text-blue-500 font-mono -rotate-90 origin-left pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          DEPTH: L{currentDepth}
      </div>


      {/* Controls Overlay */}
      <div className="absolute bottom-12 right-2 z-10 flex flex-col items-end gap-1 pointer-events-none">
         <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-zinc-400 text-[10px] border border-zinc-800">
            <ZoomIn size={10} /> {zoom.toFixed(1)}x
         </div>
         <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded text-zinc-400 text-[10px] border border-zinc-800">
            <Move size={10} /> {offsetDisplay.x.toFixed(1)},{offsetDisplay.y.toFixed(1)}
         </div>
      </div>

      <div 
        className="relative w-full h-full flex items-center justify-center overflow-hidden transition-colors duration-500"
        style={{ backgroundColor: backgroundColor }}
      >
            <canvas 
                ref={canvasRef} 
                className="transition-transform duration-100 ease-out origin-center"
                style={{ 
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` 
                }}
            />
            
            <div className="absolute bottom-2 right-2 flex items-center gap-1 pointer-events-none">
                {isProcessing && (
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                    </span>
                )}
                <span className="text-[10px] text-yellow-600 font-mono">
                    {isProcessing ? "PROCESSING LAYER..." : "READY TO STACK"}
                </span>
            </div>
            
            {!accumulatorRef.current && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/80 px-4 py-2 rounded border border-zinc-800 text-zinc-500 text-xs flex items-center gap-2">
                        <MousePointerClick size={16} />
                        MIDDLE CLICK TO CAPTURE BASE LAYER
                    </div>
                 </div>
            )}
      </div>
    </div>
  );
};

export default FocusStack;