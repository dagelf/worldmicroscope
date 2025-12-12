import React, { useState, useCallback, useRef } from 'react';
import MicroscopeView from './components/MicroscopeView';
import SlideMap from './components/SlideMap';
import FocusStack from './components/FocusStack';
import BioModel3D from './components/BioModel3D';
import { BiologicalEntity } from './types';
import { analyzeMicroscopeFrame } from './services/geminiService';
import { alignFrames } from './services/vision';
import { Globe, Database, Zap } from 'lucide-react';

const App: React.FC = () => {
  // Vision State
  const [currentImageData, setCurrentImageData] = useState<ImageData | null>(null);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [relativeOffset, setRelativeOffset] = useState({ x: 0, y: 0 });
  
  // Layout State
  const [expandedView, setExpandedView] = useState<string | null>(null);

  // Depth / Stacking State
  const [currentDepth, setCurrentDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(1); // Default max depth 1 to avoid div/0
  
  // Refs for tracking loop to avoid closure staleness
  const lastImageDataRef = useRef<ImageData | null>(null);
  const stagePosRef = useRef({ x: 0, y: 0 }); // Current smoothed pos
  
  // Analysis State
  const [lastAnalysis, setLastAnalysis] = useState<BiologicalEntity | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<BiologicalEntity[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Global Collaboration Feed (Mock)
  const [globalEvents] = useState([
    "Dr. S. Chen (Shanghai) tagged 'Mitochondria' in sector 4",
    "Lab-77 (Berlin) updated mapping protocol",
    "New model 'Cell-ResNet-V4' deploying...",
    "Live Training: 98% accuracy on prokaryotes"
  ]);

  // RESET FUNCTION
  const handleReset = useCallback(() => {
    setCurrentDepth(0);
    setMaxDepth(1); // Reset to base
    setStagePosition({ x: 0, y: 0 });
    stagePosRef.current = { x: 0, y: 0 };
    setRelativeOffset({ x: 0, y: 0 });
    console.log("System Reset");
  }, []);
  
  // MANUAL STACKING CALLBACK
  const handleStack = useCallback((newDepth: number) => {
      setCurrentDepth(newDepth);
      if (newDepth > maxDepth) {
          setMaxDepth(newDepth);
      }
  }, [maxDepth]);

  // High Frequency Vision Loop (Run as fast as MicroscopeView provides data)
  const handleFrameData = useCallback((data: ImageData) => {
    setCurrentImageData(data);

    // --- SPATIAL ALIGNMENT ---
    if (lastImageDataRef.current) {
        // Run Alignment (Edge-Enhanced + Gaussian Fit)
        const alignment = alignFrames(lastImageDataRef.current, data);
        
        // Threshold confidence to avoid drift when image is blurry or moving too fast
        if (alignment.confidence > 0.6) {
            setRelativeOffset({ x: alignment.x, y: alignment.y });
            
            // Update Global Stage Position
            // Invert alignment because if image moves LEFT, camera moved RIGHT
            const newX = stagePosRef.current.x - alignment.x;
            const newY = stagePosRef.current.y - alignment.y;
            
            stagePosRef.current = { x: newX, y: newY };
            setStagePosition({ x: newX, y: newY });
        } else {
            setRelativeOffset({ x: 0, y: 0 });
        }
    }
    
    // Store copy for next frame comparison
    lastImageDataRef.current = data;
    
  }, []);

  // Low Frequency API Analysis
  const handleFrameCapture = useCallback(async (base64: string) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    
    const response = await analyzeMicroscopeFrame(base64);
    
    if (response && response.entities.length > 0) {
        const topEntity = response.entities[0];
        const newEntity: BiologicalEntity = {
            id: crypto.randomUUID(),
            name: topEntity.name,
            confidence: topEntity.confidence,
            description: topEntity.description,
            tags: topEntity.tags,
            coordinates: { ...stagePosRef.current }, // Tag at current location
            timestamp: Date.now(),
            depthEstimate: currentDepth / (maxDepth || 1) // Store relative depth
        };

        setLastAnalysis(newEntity);
        setAnalysisHistory(prev => [newEntity, ...prev].slice(0, 50));
    }
    setIsAnalyzing(false);
  }, [isAnalyzing, currentDepth, maxDepth]);

  // Layout Helper
  const getLayoutClass = (viewName: string) => {
      if (expandedView === viewName) return "col-span-2 row-span-2";
      if (expandedView !== null) return "hidden";
      return "min-h-0 min-w-0"; // Default grid behavior
  };

  return (
    <div className="flex h-screen w-screen bg-black text-white overflow-hidden p-2 gap-2">
      
      {/* Sidebar */}
      <div className="w-64 flex flex-col gap-2">
        <div className="h-16 border border-zinc-800 bg-zinc-900/50 rounded flex items-center justify-center">
            <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
                OMNISCOPE
            </h1>
        </div>
        
        {/* Global Feed */}
        <div className="flex-1 border border-zinc-800 bg-zinc-900/30 rounded p-4 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-cyan-400 text-sm font-bold border-b border-cyan-900/50 pb-2">
                <Globe size={16} /> GLOBAL LAB NET
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto">
                {globalEvents.map((event, i) => (
                    <div key={i} className="text-xs text-zinc-400 font-mono border-l border-zinc-700 pl-2">
                        <span className="text-zinc-600 block text-[10px]">{new Date().toLocaleTimeString()}</span>
                        {event}
                    </div>
                ))}
            </div>
        </div>

        {/* System Status */}
        <div className="h-48 border border-zinc-800 bg-zinc-900/30 rounded p-4 font-mono text-xs text-zinc-500">
             <div className="flex items-center gap-2 mb-2 text-yellow-500">
                <Database size={14} /> SYSTEM METRICS
            </div>
            <div className="space-y-2">
                <div className="flex justify-between">
                    <span>VISION LOCK</span>
                    <span className={relativeOffset.x !== 0 ? "text-green-500" : "text-zinc-500"}>
                        {relativeOffset.x !== 0 ? "LOCKED" : "SEARCHING"}
                    </span>
                </div>
                 <div className="w-full bg-zinc-800 h-1 mt-1"><div className="bg-yellow-500 h-1 w-[84%]" /></div>
                
                <div className="flex justify-between mt-2">
                    <span>POS X/Y</span>
                    <span className="text-white">{stagePosition.x.toFixed(1)}/{stagePosition.y.toFixed(1)}</span>
                </div>

                <div className="flex justify-between mt-1">
                    <span>DEPTH Z</span>
                    <span className="text-blue-400">L{currentDepth} / {maxDepth}</span>
                </div>

                <div className="flex items-center gap-2 mt-4 text-purple-400">
                    <Zap size={12} className={isAnalyzing ? "animate-spin" : ""} />
                    {isAnalyzing ? "AI ANALYZING..." : "AI IDLE"}
                </div>
            </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 relative">
        {/* Window 1: Live Feed */}
        <div className={getLayoutClass('LIVE')}>
            <MicroscopeView 
                onFrameData={handleFrameData}
                onFrameCapture={handleFrameCapture} 
                isActive={true}
                isAnalyzing={isAnalyzing}
                onToggleExpand={() => setExpandedView(prev => prev === 'LIVE' ? null : 'LIVE')}
                history={analysisHistory}
            />
        </div>
        
        {/* Window 2: Map / Fog of War */}
        <div className={getLayoutClass('MAP')}>
            <SlideMap 
                currentImageData={currentImageData} 
                stagePosition={stagePosition}
                lastAnalysis={lastAnalysis} 
            />
        </div>
        
        {/* Window 3: Focus Stack (0.5 FPS) */}
        <div className={getLayoutClass('STACK')}>
            <FocusStack 
                currentImageData={currentImageData}
                currentDepth={currentDepth}
                maxDepth={maxDepth}
                onReset={handleReset}
                onStack={handleStack}
            />
        </div>
        
        {/* Window 4: 3D Model */}
        <div className={getLayoutClass('MODEL')}>
            <BioModel3D 
                analysis={lastAnalysis} 
                history={analysisHistory} 
                currentImageData={currentImageData} 
                stagePosition={stagePosition}
                currentDepth={currentDepth}
                onReset={handleReset}
            />
        </div>
      </div>

    </div>
  );
};

export default App;