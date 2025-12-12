export const SETTINGS = {
  ALIGNMENT_DOWNSAMPLE: 128, // Lower res for speed
  SEARCH_WINDOW: 40, 
  SHARPNESS_THRESHOLD: 20, // Default Threshold
  CROP_RATIO: 0.6, 
  DRIFT_DEADBAND: 0.8,
  FINGERPRINT_SIZE: 16 
};

// Helper: Resize & Crop ImageData
const resizeAndCropImageData = (src: ImageData, targetWidth: number): ImageData => {
  const cropW = src.width * SETTINGS.CROP_RATIO;
  const cropH = src.height * SETTINGS.CROP_RATIO;
  const cropX = (src.width - cropW) / 2;
  const cropY = (src.height - cropH) / 2;

  const ratio = targetWidth / cropW;
  const targetHeight = Math.round(cropH * ratio);
  
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("No context");
  
  const tempC = new OffscreenCanvas(src.width, src.height);
  const tempCtx = tempC.getContext('2d');
  tempCtx?.putImageData(src, 0, 0);
  
  ctx.drawImage(
      tempC, 
      cropX, cropY, cropW, cropH, 
      0, 0, targetWidth, targetHeight
  );
  
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
};

const toGrayscale = (data: ImageData): Uint8Array => {
  const gray = new Uint8Array(data.width * data.height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data.data[i * 4] + 0.587 * data.data[i * 4 + 1] + 0.114 * data.data[i * 4 + 2];
  }
  return gray;
};

const fastBlur = (pixels: Uint8Array, width: number, height: number): Uint8Array => {
  const output = new Uint8Array(pixels.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const sum = 
        pixels[idx - width - 1] + pixels[idx - width] + pixels[idx - width + 1] +
        pixels[idx - 1] + pixels[idx] + pixels[idx + 1] +
        pixels[idx + width - 1] + pixels[idx + width] + pixels[idx + width + 1];
      output[idx] = sum / 9;
    }
  }
  return output;
};

const computeEdgeMap = (pixels: Uint8Array, width: number, height: number): Float32Array => {
  const edges = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = 
        -1 * pixels[idx - width - 1] + 1 * pixels[idx - width + 1] +
        -2 * pixels[idx - 1] + 2 * pixels[idx + 1] +
        -1 * pixels[idx + width - 1] + 1 * pixels[idx + width + 1];
        
      const gy = 
        -1 * pixels[idx - width - 1] - 2 * pixels[idx - width] - 1 * pixels[idx - width + 1] +
         1 * pixels[idx + width - 1] + 2 * pixels[idx + width] + 1 * pixels[idx + width + 1];
         
      edges[idx] = Math.sqrt(gx*gx + gy*gy);
    }
  }
  return edges;
};

export const alignFrames = (prev: ImageData, curr: ImageData): { x: number, y: number, confidence: number } => {
  const w = SETTINGS.ALIGNMENT_DOWNSAMPLE;
  const cropW = prev.width * SETTINGS.CROP_RATIO;
  const scale = cropW / w;
  
  const smallPrev = resizeAndCropImageData(prev, w);
  const smallCurr = resizeAndCropImageData(curr, w);
  
  const grayPrev = toGrayscale(smallPrev);
  const grayCurr = toGrayscale(smallCurr);

  const blurPrev = fastBlur(grayPrev, w, smallPrev.height);
  const blurCurr = fastBlur(grayCurr, w, smallCurr.height);
  
  const edgePrev = computeEdgeMap(blurPrev, w, smallPrev.height);
  const edgeCurr = computeEdgeMap(blurCurr, w, smallCurr.height);

  const sw = SETTINGS.SEARCH_WINDOW;
  const width = w;
  const height = smallPrev.height;

  let bestX = 0;
  let bestY = 0;
  let minDiff = Infinity;
  let scores: Record<string, number> = {};
  const padding = sw + 2;
  
  for (let dy = -sw; dy <= sw; dy += 1) { 
    for (let dx = -sw; dx <= sw; dx += 1) {
      let diff = 0;
      let count = 0;

      for (let y = padding; y < height - padding; y += 2) {
        for (let x = padding; x < width - padding; x += 2) {
          const idx1 = y * width + x;
          const idx2 = (y + dy) * width + (x + dx);
          
          const val1 = edgePrev[idx1];
          const val2 = edgeCurr[idx2];
          const d = val1 - val2;
          diff += d * d; 
          count++;
        }
      }

      if (count > 0) {
        scores[`${dx},${dy}`] = diff;
        if (diff < minDiff) {
          minDiff = diff;
          bestX = dx;
          bestY = dy;
        }
      }
    }
  }

  let subPixelX = bestX;
  let subPixelY = bestY;

  const v0 = minDiff;
  const vxMinus = scores[`${bestX - 1},${bestY}`] ?? v0;
  const vxPlus = scores[`${bestX + 1},${bestY}`] ?? v0;
  const vyMinus = scores[`${bestX},${bestY - 1}`] ?? v0;
  const vyPlus = scores[`${bestX},${bestY + 1}`] ?? v0;

  const denomX = vxMinus - 2 * v0 + vxPlus;
  const denomY = vyMinus - 2 * v0 + vyPlus;

  if (Math.abs(denomX) > 1e-5) subPixelX += (vxMinus - vxPlus) / (2 * denomX);
  if (Math.abs(denomY) > 1e-5) subPixelY += (vyMinus - vyPlus) / (2 * denomY);

  let finalX = subPixelX * scale;
  let finalY = subPixelY * scale;

  const dist = Math.sqrt(finalX*finalX + finalY*finalY);
  if (dist < SETTINGS.DRIFT_DEADBAND) {
    finalX = 0;
    finalY = 0;
  }

  const confidence = Math.max(0, 1 - (minDiff / (width * height * 100))); 

  return {
    x: finalX,
    y: finalY,
    confidence
  };
};

export const computeSharpnessMap = (pixels: Uint8ClampedArray, width: number, height: number): Float32Array => {
  const map = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const gh = Math.abs(pixels[idx - 4] - pixels[idx + 4]);
      const gv = Math.abs(pixels[idx - width * 4] - pixels[idx + width * 4]);
      const mag = Math.sqrt(gh * gh + gv * gv);
      map[y * width + x] = mag;
    }
  }
  return map;
};

export const mergeFocusStack = (
  accImageData: ImageData, 
  accSharpness: Float32Array, 
  newImageData: ImageData, 
  offsetX: number, 
  offsetY: number,
  sensitivity: number,
  threshold: number,
  debugMode: boolean
): { imageData: ImageData, sharpness: Float32Array } => {
  
  const width = accImageData.width;
  const height = accImageData.height;
  const len = width * height;

  const resultPixels = new Uint8ClampedArray(len * 4);
  const resultSharpness = new Float32Array(len);

  // Shift accumulator logic:
  // We apply the offset to map new image coordinates to the accumulator space
  const shiftX = -offsetX;
  const shiftY = -offsetY;
  
  // First, copy existing accumulator
  resultPixels.set(accImageData.data);
  resultSharpness.set(accSharpness);
  
  const newSharpness = computeSharpnessMap(newImageData.data, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const targetIdx = y * width + x;
      
      // Calculate coordinate in NEW image based on alignment offset
      const srcX = Math.round(x + offsetX); 
      const srcY = Math.round(y + offsetY);

      // Check if coordinate is valid in NEW image
      if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
        const srcIdx = srcY * width + srcX;
        
        const newVal = newSharpness[srcIdx];
        const oldVal = resultSharpness[targetIdx];
        
        // 1. Is the new pixel sharp enough to be visible?
        const isNewSharp = newVal > threshold;
        
        // 2. Is the old pixel sharp enough?
        const isOldSharp = oldVal > threshold;
        
        // Logic for Transparent Stacking:
        // If New is sharper than Old AND New is Sharp -> Replace with New.
        // If Old is NOT sharp (background) -> Check if New is sharp. If not, ensure it stays transparent.
        
        if (isNewSharp && (newVal > (oldVal + sensitivity) || !isOldSharp)) {
            // Take New Pixel
            if (debugMode) {
              // DEBUG MODE: Pink for sharp areas
              resultPixels[targetIdx * 4] = 255;
              resultPixels[targetIdx * 4 + 1] = 0;
              resultPixels[targetIdx * 4 + 2] = 255;
              resultPixels[targetIdx * 4 + 3] = 255;
            } else {
              resultPixels[targetIdx * 4] = newImageData.data[srcIdx * 4];
              resultPixels[targetIdx * 4 + 1] = newImageData.data[srcIdx * 4 + 1];
              resultPixels[targetIdx * 4 + 2] = newImageData.data[srcIdx * 4 + 2];
              resultPixels[targetIdx * 4 + 3] = 255; 
            }
            resultSharpness[targetIdx] = newVal;
        } else if (!isOldSharp) {
            // Neither is sharp, force transparent
            resultPixels[targetIdx * 4 + 3] = 0;
            resultSharpness[targetIdx] = 0;
        } else if (isOldSharp) {
            // Old is sharp, keep it. 
            // If debug mode is on, ensure it is pink if it was previously sharp.
            if (debugMode) {
               resultPixels[targetIdx * 4] = 255;
               resultPixels[targetIdx * 4 + 1] = 0;
               resultPixels[targetIdx * 4 + 2] = 255;
               resultPixels[targetIdx * 4 + 3] = 255;
            }
        }
      } 
      // If outside bounds, keep accumulator state
    }
  }

  return {
    imageData: new ImageData(resultPixels, width, height),
    sharpness: resultSharpness
  };
};

export const getFingerprint = (data: ImageData): Uint8Array => {
  const size = SETTINGS.FINGERPRINT_SIZE;
  const small = resizeAndCropImageData(data, size);
  return toGrayscale(small);
};

export const getFingerprintSimilarity = (fp1: Uint8Array, fp2: Uint8Array): number => {
  let diff = 0;
  for (let i = 0; i < fp1.length; i++) {
    diff += Math.abs(fp1[i] - fp2[i]);
  }
  return 1 - (diff / (fp1.length * 255));
};

export const getAverageColor = (data: ImageData): string => {
  let r = 0, g = 0, b = 0;
  const len = data.data.length;
  const pixelCount = len / 4;
  
  // Sample every 40th pixel for speed (approx 1% of pixels)
  for (let i = 0; i < len; i += 40) {
    r += data.data[i];
    g += data.data[i+1];
    b += data.data[i+2];
  }
  
  // Adjust count based on sampling loop
  const count = Math.ceil(len / 40);
  
  return `rgb(${Math.round(r/count)}, ${Math.round(g/count)}, ${Math.round(b/count)})`;
};