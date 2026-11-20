export interface VisionCapabilities {
  platform: string;
  captureBackend: 'mss' | 'macos-screencapture' | 'windows-gdi' | 'file-only';
  opencvAvailable: boolean;
  ocrAvailable: boolean;
  pillowAvailable: boolean;
}

export interface DetectedWindow {
  id: string;
  title: string;
  owner: string;
  pid?: number;
  focused?: boolean;
}

export interface VisionHudRegion {
  region: string;
  label: string;
  value: string;
  confidence: number;
}

export interface VisionDetectedObject {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface VisionGameEvent {
  type: string;
  description: string;
  severity: 'info' | 'warning' | 'highlight';
  timestamp: string;
}

export interface VisionAnalysisResult {
  id?: number;
  windowTitle: string;
  platform: string;
  width: number;
  height: number;
  imageBase64: string;
  sceneLabel: string;
  motionScore: number;
  brightness: number;
  processingMs: number;
  samplingIntervalMs: number;
  ocrText: string;
  hud: VisionHudRegion[];
  objects: VisionDetectedObject[];
  events: VisionGameEvent[];
  capabilities: VisionCapabilities;
  createdAt: string;
}

export interface VisionMonitorStatus {
  running: boolean;
  targetWindow: string | null;
  samplingIntervalMs: number;
  lastCaptureAt: string | null;
  lastProcessingMs: number | null;
  framesCaptured: number;
  capabilities: VisionCapabilities | null;
}
