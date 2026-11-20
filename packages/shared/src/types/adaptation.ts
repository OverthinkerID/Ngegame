import type { AIActionType, GameGenreTemplate } from './ai.js';

export type SupportedPlatform = 'win32' | 'darwin' | 'linux';

export interface SteamScanProgress {
  stage: 'detecting_install' | 'reading_libraries' | 'parsing_manifests' | 'validating_exes' | 'completed';
  percent: number;
  message: string;
  currentLibrary?: string;
}

export interface SteamScannerDiagnostics {
  scannerName: 'WindowsSteamScanner' | 'MacOSSteamScanner' | 'LinuxSteamScanner';
  platform: string;
  candidatePathsChecked: string[];
  registryQueried: boolean;
  registrySteamPath: string | null;
  librariesFound: string[];
  manifestsParsed: number;
  staleManifests: Array<{ appId: number; file: string; reason: string }>;
  permissionWarnings: string[];
  progress: SteamScanProgress;
}

export type GameMechanicId =
  | 'movement'
  | 'navigation'
  | 'interaction'
  | 'inventory'
  | 'combat'
  | 'resource_management'
  | 'dialogue'
  | 'quest_objectives'
  | 'time_management'
  | 'building_crafting';

export type StardewCapabilityLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface GameInputBinding {
  actionType: AIActionType;
  keyboard?: string;
  mouse?: string;
  gamepad?: string;
  holdDurationMs: number;
  cooldownMs: number;
  requiresFocus: boolean;
  notes?: string;
}

export interface GameUIRegion {
  id: string;
  label: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  purpose: 'viewport' | 'ocr' | 'hud_bar' | 'minimap' | 'inventory' | 'dialog' | 'clock';
}

export interface GameProfile {
  gameId: string;
  gameName: string;
  platform: SupportedPlatform | 'all';
  executablePath: string | null;
  installationPath: string | null;
  genre: GameGenreTemplate;
  cameraPerspective: 'top_down' | 'isometric' | 'first_person' | 'third_person' | 'side_scroller';
  gameEngine: string;
  resolution: { width: number; height: number };
  controlScheme: 'keyboard_mouse' | 'keyboard_only' | 'gamepad' | 'hybrid';
  inputMapping: GameInputBinding[];
  visionProfile: {
    targetIntervalMs: number;
    motionThreshold: number;
    enableOcr: boolean;
    screenStates: string[];
    objectDetectors: string[];
  };
  uiProfile: {
    regions: GameUIRegion[];
  };
  mechanicsProfile: {
    enabledMechanics: GameMechanicId[];
  };
  objectiveProfile: {
    primaryGoal: string;
    dailyTasks: string[];
  };
  difficultyProfile: {
    level: 'casual' | 'standard' | 'intensive';
    maxActionsPerMinute: number;
  };
  aiStrategy: {
    preferredProvider: 'ollama' | 'openai';
    rules: string[];
    recoveryOnFailure: string;
  };
  memoryConfiguration: {
    shortTermLimit: number;
    longTermEnabled: boolean;
    trackFailedActions: boolean;
  };
  safetyConfiguration: {
    minConfidence: number;
    requireFocus: boolean;
    maxHoldDurationMs: number;
    allowAutoExecute: boolean;
    dryRunByDefault: boolean;
  };
  adapterType: 'stardew_valley' | 'genre_template' | 'custom' | 'universal';
  profileVersion: number;
  isBuiltin?: boolean;
  stardewLevel?: StardewCapabilityLevel;
  calibrationStatus?: {
    completedSteps: number[];
    lastCalibratedAt: string | null;
  };
  updatedAt?: string;
}

export interface StructuredVisionObservation {
  gameId: string;
  screenState: 'title_screen' | 'gameplay' | 'pause_menu' | 'inventory' | 'dialogue' | 'unknown';
  player: {
    position: { x: number; y: number } | null;
    confidence: number;
  };
  visibleObjects: Array<{ label: string; confidence: number; region?: string }>;
  interactableObjects: Array<{ label: string; actionHint: string; confidence: number }>;
  uiElements: Array<{ regionId: string; label: string; textValue: string }>;
  extractedText: string;
  confidence: number;
  timestamp: string;
}

export interface PipelineStageDiagnostic {
  stage:
    | 'game_detection'
    | 'game_identification'
    | 'process_detection'
    | 'screen_capture'
    | 'image_preprocessing'
    | 'vision_inference'
    | 'state_interpretation'
    | 'ai_decision_making'
    | 'control_mapping'
    | 'input_execution'
    | 'action_verification'
    | 'memory_and_learning';
  label: string;
  status: 'healthy' | 'degraded' | 'offline';
  detail: string;
}

export interface PipelineDiagnosticsReport {
  platform: string;
  checkedAt: string;
  overallStatus: 'healthy' | 'degraded' | 'offline';
  captureStatus: string;
  visionStatus: string;
  aiInferenceStatus: string;
  decisionStatus: string;
  controllerStatus: string;
  inputExecutionStatus: string;
  actionVerificationStatus: string;
  stages: PipelineStageDiagnostic[];
}

export interface GameMemoryRecord {
  id: number;
  gameId: string;
  memoryType: 'short_term' | 'long_term' | 'failed_action';
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  createdAt: string;
}

export interface GameBrainCycleResult {
  gameId: string;
  cycleId: string;
  dryRun: boolean;
  observe: StructuredVisionObservation;
  interpret: {
    screenState: string;
    activeMechanics: GameMechanicId[];
    summary: string;
  };
  plan: {
    goal: string;
    subTasks: string[];
    chosenAction: AIActionType;
    target: string;
    durationMs: number;
    confidence: number;
    rationale: string;
  };
  confidenceCheck: {
    passed: boolean;
    threshold: number;
    actual: number;
    reason: string;
  };
  approvalStatus: 'auto_approved' | 'queued_for_human' | 'blocked_low_confidence' | 'blocked_safety';
  execution: {
    executed: boolean;
    status: string;
    mappedInput: string;
    activeWindow: string;
    reason: string;
  };
  verification: {
    verified: boolean;
    note: string;
  };
  memoryUpdate: {
    recorded: boolean;
    memoryType: 'short_term' | 'long_term' | 'failed_action';
  };
  timestamp: string;
}

export interface CalibrationStepResult {
  step: number;
  name: string;
  ok: boolean;
  detail: string;
  checkedAt: string;
}

export interface CalibrationSessionState {
  gameId: string;
  completedSteps: number[];
  results: CalibrationStepResult[];
  displayResolution: { width: number; height: number } | null;
  detectedWindow: string | null;
  savedAt: string | null;
}

export interface GameProfileVersionRecord {
  id: number;
  gameId: string;
  profileVersion: number;
  changeSummary: string;
  author: string;
  createdAt: string;
}

export interface AdaptationProposalRecord {
  id: number;
  gameId: string;
  title: string;
  rationale: string;
  proposedChanges: Record<string, unknown>;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}
