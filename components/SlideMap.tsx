import React, { useEffect, useRef, useState } from 'react';
import { Map, MapPin, Navigation } from 'lucide-react';
import { BiologicalEntity } from '../types';

interface SlideMapProps {
  currentImageData: ImageData | null;
  stagePosition: { x: number; y: number };
  lastAnalysis: BiologicalEntity | null;
}

const SlideMap: React.FC<SlideMapProps> = ({ currentImageData, stagePosition, lastAnalysis }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  
  // Initialize Infinite Map Canvas
  useEffect(() => {
    if (canvasRef.current && !contextRef.current) {
        const canvas = canvasRef.current;
        // Large virtual canvas size
        canvas.width = 4000;
        canvas.height = 4000;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#18181b'; // Zinc 950
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw initial grid
            ctx.strokeStyle = '#27272a';
            ctx.lineWidth = 1;
            for(let i=0; i<4000; i+=100) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 4000); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(4000, i); ctx.stroke();
            }
            contextRef.current = ctx;
        }
    }
  }, []);

  // Update Map with New Tile
  useEffect(() => {
    if (currentImageData && contextRef.current) {
        const ctx = contextRef.current;
        const centerX = 2000; // Center of our virtual canvas
        const centerY = 2000;
        
        // Convert stage position to canvas position
        // We invert stage Y typically for maps
        const drawX = centerX + stagePosition.x;
        const drawY = centerY + stagePosition.y;

        // Create a temp bitmap for the ImageData
        // (Fastest way to draw ImageData to Canvas with transform)
        createImageBitmap(currentImageData).then(bmp => {
             // Draw "Fog of War" clearing style
             ctx.save();
             ctx.globalAlpha = 1.0;
             // Draw the image tile
             ctx.drawImage(bmp, drawX, drawY);
             
             // Draw a border to show it's a tile
             ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
             ctx.strokeRect(drawX, drawY, currentImageData.width, currentImageData.height);
             
             // If analyzed, put a marker
             if (lastAnalysis) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
                ctx.beginPath();
                ctx.arc(drawX + currentImageData.width/2, drawY + currentImageData.height/2, 5, 0, Math.PI * 2);
                ctx.fill();
             }
             
             ctx.restore();
        });
    }
  }, [currentImageData, stagePosition, lastAnalysis]);

  return (
    <div className="relative w-full h-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col group">
       <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-emerald-400 text-xs border border-emerald-900/50">
        <Map size={14} />
        <span>SLIDE RECONSTRUCTION // MAPPING</span>
      </div>

      <div className="flex-1 relative overflow-hidden bg-zinc-900">
        <div className="w-full h-full flex items-center justify-center overflow-auto cursor-crosshair">
            {/* The Map Viewport */}
            <div 
                className="relative transition-transform duration-75"
                style={{
                    width: 4000,
                    height: 4000,
                    // Center the viewport on the current stage position inverted
                    transform: `translate(${-1500 - stagePosition.x}px, ${-1500 - stagePosition.y}px)`
                }}
            >
                <canvas ref={canvasRef} className="block" />
                
                {/* Current Camera Indicator */}
                <div 
                    className="absolute border-2 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] z-20 pointer-events-none"
                    style={{
                        left: 2000 + stagePosition.x,
                        top: 2000 + stagePosition.y,
                        width: currentImageData ? currentImageData.width : 100,
                        height: currentImageData ? currentImageData.height : 100
                    }}
                >
                    <div className="absolute -top-6 left-0 text-[10px] text-emerald-400 bg-black/80 px-1 font-mono whitespace-nowrap">
                        X: {stagePosition.x.toFixed(0)} Y: {stagePosition.y.toFixed(0)}
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="h-8 border-t border-zinc-800 bg-zinc-900/50 flex items-center px-4 text-[10px] text-zinc-500 font-mono">
         <Navigation size={10} className="mr-2" />
         AUTO-TRACKING ENABLED // >80% OVERLAP DETECTED
      </div>
    </div>
  );
};

export default SlideMap;