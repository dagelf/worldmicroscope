import React, { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Mountain, Grid3X3, Sliders, RotateCcw } from 'lucide-react';
import { BiologicalEntity } from '../types';
import { computeSharpnessMap, SETTINGS } from '../services/vision';
import * as THREE from 'three';

// --- CONFIG ---
const MODEL_RES_X = 256;
const MODEL_RES_Y = 144; 
const MAX_POINTS = 500000; // Max points for point cloud buffer
const WORLD_WIDTH = 4;
const WORLD_HEIGHT = 2.25;

// Global JSX augmentation
declare global {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
      pointsMaterial: any;
      group: any;
      planeGeometry: any;
      meshStandardMaterial: any;
      gridHelper: any;
      ambientLight: any;
      pointLight: any;
      directionalLight: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      points: any;
      bufferGeometry: any;
      bufferAttribute: any;
      pointsMaterial: any;
      group: any;
      planeGeometry: any;
      meshStandardMaterial: any;
      gridHelper: any;
      ambientLight: any;
      pointLight: any;
      directionalLight: any;
    }
  }
}

interface BioModel3DProps {
  analysis: BiologicalEntity | null;
  history: BiologicalEntity[];
  currentImageData: ImageData | null;
  stagePosition: { x: number; y: number };
  currentDepth: number; 
  onReset: () => void;
}

// --- POINT CLOUD COMPONENT ---
const PointCloudViz = ({ 
    currentImageData, 
    currentDepth, 
    stagePosition, 
    visible, 
    depthScale 
}: {
    currentImageData: ImageData | null,
    currentDepth: number,
    stagePosition: { x: number, y: number },
    visible: boolean,
    depthScale: number
}) => {
    const geometryRef = useRef<THREE.BufferGeometry>(null);
    const cursor = useRef(0);
    const lastDepth = useRef(-1);
    
    // Pre-allocate buffer attributes
    const positions = useMemo(() => new Float32Array(MAX_POINTS * 3), []);
    
    useEffect(() => {
        // Reset Logic
        if (currentDepth === 0) {
            cursor.current = 0;
            if (geometryRef.current) {
                geometryRef.current.setDrawRange(0, 0);
            }
            lastDepth.current = 0;
            return;
        }

        // Processing Logic
        if (!currentImageData || currentDepth === lastDepth.current) return;
        
        const w = currentImageData.width;
        const h = currentImageData.height;
        const sharpness = computeSharpnessMap(currentImageData.data, w, h);
        
        // Downsample for point cloud to save GPU (every 2nd pixel)
        const step = 2; 

        for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
                const idx = y * w + x;
                
                // Only add sharp points (Edges)
                if (sharpness[idx] > SETTINGS.SHARPNESS_THRESHOLD * 1.5) {
                    if (cursor.current >= MAX_POINTS * 3) break;

                    // Map 2D Image (0..W, 0..H) to 3D World (-2..2, -1.125..1.125)
                    const u = (x / w) - 0.5;
                    const v = (y / h) - 0.5;
                    
                    const wx = u * WORLD_WIDTH;
                    const wy = -v * WORLD_HEIGHT; // Flip Y
                    
                    // Base Z is just the layer index. Scaling happens via prop.
                    // Slight random jitter to Z to prevent z-fighting patterns
                    const wz = (currentDepth * 0.05) + (Math.random() * 0.01);

                    positions[cursor.current] = wx;
                    positions[cursor.current + 1] = wy;
                    positions[cursor.current + 2] = wz;
                    cursor.current += 3;
                }
            }
        }

        if (geometryRef.current) {
            geometryRef.current.attributes.position.needsUpdate = true;
            geometryRef.current.setDrawRange(0, cursor.current / 3);
        }

        lastDepth.current = currentDepth;

    }, [currentDepth, currentImageData, positions]);

    return (
        <points visible={visible} scale={[1, 1, depthScale]}>
            <bufferGeometry ref={geometryRef}>
                <bufferAttribute
                    attach="attributes-position"
                    count={MAX_POINTS}
                    array={positions}
                    itemSize={3}
                    usage={THREE.DynamicDrawUsage}
                />
            </bufferGeometry>
            <pointsMaterial 
                size={0.02} 
                color="white" 
                transparent={true} 
                opacity={0.8} 
                sizeAttenuation={true} 
            />
        </points>
    );
};

// --- RELIEF COMPONENT (SPECTRUM NORMALIZED) ---
const ReliefViz = ({ 
  currentImageData, 
  stagePosition,
  currentDepth,
  visible,
  depthScale
}: { 
  currentImageData: ImageData | null, 
  stagePosition: { x: number, y: number },
  currentDepth: number,
  visible: boolean,
  depthScale: number
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const [heightTexture] = useState(() => new THREE.DataTexture(
    new Float32Array(MODEL_RES_X * MODEL_RES_Y), 
    MODEL_RES_X, 
    MODEL_RES_Y, 
    THREE.RedFormat, 
    THREE.FloatType
  ));
  
  const [colorTexture] = useState(() => new THREE.DataTexture(
    new Uint8Array(MODEL_RES_X * MODEL_RES_Y * 4), 
    MODEL_RES_X, 
    MODEL_RES_Y, 
    THREE.RGBAFormat, 
    THREE.UnsignedByteType
  ));

  const initializedRef = useRef(false);
  const startStagePos = useRef({ x: 0, y: 0 });

  // Reset
  useEffect(() => {
    if(currentDepth === 0) {
        heightTexture.image.data.fill(0);
        colorTexture.image.data.fill(0);
        heightTexture.needsUpdate = true;
        colorTexture.needsUpdate = true;
        initializedRef.current = false;
    }
  }, [currentDepth, heightTexture, colorTexture]);

  useEffect(() => {
    if (!currentImageData || currentDepth === 0) return;

    if (!initializedRef.current) {
       startStagePos.current = { ...stagePosition }; 
       initializedRef.current = true;
    }

    const deltaX = startStagePos.current.x - stagePosition.x;
    const deltaY = startStagePos.current.y - stagePosition.y;

    const srcW = currentImageData.width;
    const srcH = currentImageData.height;
    const srcData = currentImageData.data;

    const scaleX = srcW / MODEL_RES_X;
    const scaleY = srcH / MODEL_RES_Y;

    const hData = heightTexture.image.data;
    const cData = colorTexture.image.data;
    
    // Normalize layer depth
    const layerHeight = (currentDepth * 0.02); 

    const sharpnessMap = computeSharpnessMap(currentImageData.data, srcW, srcH);
    
    // Temporary color object for HSL conversion
    const tempColor = new THREE.Color();

    for (let y = 0; y < MODEL_RES_Y; y++) {
        for (let x = 0; x < MODEL_RES_X; x++) {
            
            const modelDeltaX = deltaX / scaleX; 
            const modelDeltaY = deltaY / scaleY;

            const camX = Math.floor(x - modelDeltaX);
            const camY = Math.floor(y - modelDeltaY);

            if (camX >= 0 && camX < MODEL_RES_X && camY >= 0 && camY < MODEL_RES_Y) {
                 const sx = Math.floor(camX * scaleX);
                 const sy = Math.floor(camY * scaleY);
                 
                 if (sx >= 0 && sx < srcW && sy >= 0 && sy < srcH) {
                    const srcIdxPixel = sy * srcW + sx;
                    const srcIdx = srcIdxPixel * 4;
                    const sharpness = sharpnessMap[srcIdxPixel];

                    // Stack only if sharp
                    if (sharpness > SETTINGS.SHARPNESS_THRESHOLD) {
                        const modelIdx = y * MODEL_RES_X + x;

                        const r = srcData[srcIdx];
                        const g = srcData[srcIdx+1];
                        const b = srcData[srcIdx+2];

                        // NORMALIZE COLORS: SPECTRUM MAPPING
                        // Calculate intensity (0-255)
                        const intensity = (r + g + b) / 3;
                        
                        // Map Intensity to Hue
                        // Dark (0) -> Red (0 degrees)
                        // Light (255) -> Blue (240 degrees)
                        const hue = (intensity / 255) * (240 / 360);
                        
                        tempColor.setHSL(hue, 1.0, 0.5);

                        cData[modelIdx * 4] = tempColor.r * 255;
                        cData[modelIdx * 4 + 1] = tempColor.g * 255;
                        cData[modelIdx * 4 + 2] = tempColor.b * 255;
                        cData[modelIdx * 4 + 3] = 255; // Alpha
                        
                        // Write Height
                        hData[modelIdx] = layerHeight;
                    }
                 }
            }
        }
    }

    heightTexture.needsUpdate = true;
    colorTexture.needsUpdate = true;

  }, [currentDepth]); 

  return (
    <mesh ref={meshRef} visible={visible}>
        <planeGeometry args={[WORLD_WIDTH, WORLD_HEIGHT, MODEL_RES_X - 1, MODEL_RES_Y - 1]} />
        <meshStandardMaterial 
            map={colorTexture}
            displacementMap={heightTexture}
            displacementScale={depthScale} 
            wireframe={false}
            roughness={0.5}
            metalness={0.4}
            emissive="#111111"
        />
    </mesh>
  );
};


const BioModel3D: React.FC<BioModel3DProps> = ({ currentImageData, stagePosition, currentDepth, onReset }) => {
  const [mode, setMode] = useState<'RELIEF' | 'POINTS'>('RELIEF');
  const [depthScale, setDepthScale] = useState(2.0);

  const toggleMode = () => {
    setMode(prev => prev === 'RELIEF' ? 'POINTS' : 'RELIEF');
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
     if(e.button === 1) { // Middle
         e.stopPropagation();
         e.preventDefault();
         onReset();
     }
  }

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    toggleMode();
  }

  return (
    <div 
        className="relative w-full h-full bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col cursor-pointer group overflow-hidden"
        onContextMenu={handleRightClick}
        onMouseDown={handleMiddleClick}
    >
       {/* HUD */}
       <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-black/60 px-2 py-1 rounded text-cyan-400 text-xs border border-cyan-900/50 pointer-events-none">
        {mode === 'RELIEF' ? <Mountain size={14} /> : <Grid3X3 size={14} />}
        <span>
            {mode === 'RELIEF' ? "SPECTRUM RELIEF MAP" : "SHARPNESS POINT CLOUD"}
        </span>
      </div>

      <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
         <div 
            className="flex items-center gap-2 bg-zinc-900/80 p-1 px-2 rounded border border-zinc-700"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
         >
             <Sliders size={10} className="text-zinc-400"/>
             <input 
                type="range" 
                min="0.1" max="5.0" step="0.1" 
                value={depthScale} 
                onChange={(e) => setDepthScale(parseFloat(e.target.value))}
                className="w-16 h-1 bg-zinc-600 rounded-lg appearance-none cursor-ew-resize accent-cyan-500"
             />
         </div>
      </div>

      {/* 3D CANVAS */}
      <div className="flex-1 relative">
        <Canvas camera={{ position: [0, -2, 4], fov: 45 }}>
            <color attach="background" args={['#050505']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={2.0} castShadow />
            <pointLight position={[10, 10, 10]} intensity={1.5} />
            <pointLight position={[-10, -10, 5]} intensity={0.8} color="#4c1d95" />
            
            <Suspense fallback={null}>
                
                {/* We keep both mounted so they both accumulate data from the stack stream */}
                <ReliefViz 
                    currentImageData={currentImageData} 
                    stagePosition={stagePosition}
                    currentDepth={currentDepth}
                    visible={mode === 'RELIEF'}
                    depthScale={depthScale}
                />
                
                <PointCloudViz 
                    currentImageData={currentImageData}
                    stagePosition={stagePosition}
                    currentDepth={currentDepth}
                    visible={mode === 'POINTS'}
                    depthScale={depthScale}
                />

                <gridHelper args={[10, 20, 0x333333, 0x111111]} rotation={[Math.PI/2, 0, 0]} position={[0,0,-0.5]} />
                <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
            </Suspense>
            
            <OrbitControls 
                enableZoom={true} 
                enablePan={true}
                rotateSpeed={0.5}
                zoomSpeed={0.8}
            />
        </Canvas>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 pointer-events-none">
            <div className="text-[10px] text-zinc-500 font-mono space-y-1">
                <p className="text-cyan-600 font-bold">{'>'} MODE: {mode}</p>
                <p>{'>'} R-CLICK: TOGGLE VIEW</p>
                <p>{'>'} STACKER: ADDS LAYERS</p>
                <p>{'>'} M-CLICK: RESET</p>
            </div>
      </div>
      
      {/* Reset Button (Visual backup for middle click) */}
      <button 
        onClick={(e) => { e.stopPropagation(); onReset(); }}
        className="absolute bottom-4 right-4 z-20 p-2 bg-red-900/20 text-red-500 border border-red-900/50 rounded hover:bg-red-900/40 transition-colors"
        title="Reset 3D Model"
      >
        <RotateCcw size={14} />
      </button>

    </div>
  );
};

export default BioModel3D;