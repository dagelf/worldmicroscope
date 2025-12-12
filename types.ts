export interface BiologicalEntity {
  id: string;
  name: string;
  confidence: number;
  description: string;
  tags: string[];
  coordinates: { x: number; y: number };
  timestamp: number;
  depthEstimate: number; // 0-1 normalized
}

export interface MapTile {
  id: string;
  x: number; // Grid X
  y: number; // Grid Y
  image: string; // Base64
  analyzed: boolean;
}

export enum ViewMode {
  LIVE = 'LIVE',
  MAP = 'MAP',
  STACK = 'STACK',
  MODEL = 'MODEL'
}

export interface AnalysisResponse {
  entities: {
    name: string;
    description: string;
    confidence: number;
    tags: string[];
  }[];
  structuralNotes: string;
  depthMapHint: string;
}
