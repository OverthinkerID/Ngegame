import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type {
  GameBrainCycleResult,
  GameProfile,
  UserProfileRecord,
  VisionAnalysisResult,
  VisionSessionRecord,
  VoiceEmotion,
  VoiceSpeechResult,
} from '@ngegame/shared';
import { backendService } from '../services/backendService.js';
import { wsManager, type WsConnectionStatus } from '../services/wsManager.js';

export interface AdaptationUiState {
  selectedId: string;
  activeSection: string;
  draftProfile: GameProfile | null;
  isDirty: boolean;
  goalOverride: string;
  brainResult: GameBrainCycleResult | null;
}

export interface VoiceUiState {
  text: string;
  emotion: VoiceEmotion;
  selectedSampleId: string | null;
  lastResult: VoiceSpeechResult | null;
}

export interface LibraryUiState {
  viewMode: 'grid' | 'list';
  sortBy: 'name' | 'status' | 'size';
  searchQuery: string;
}

interface AppStateContextValue {
  profiles: UserProfileRecord[];
  activeProfile: UserProfileRecord | null;
  refreshProfiles: () => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  wsStatus: WsConnectionStatus;
  visionSession: VisionSessionRecord | null;
  latestVisionFrame: VisionAnalysisResult | null;
  setLatestVisionFrame: (frame: VisionAnalysisResult | null) => void;
  setVisionSession: (session: VisionSessionRecord | null) => void;
  refreshVisionSession: () => Promise<void>;
  adaptationState: AdaptationUiState;
  setAdaptationState: (updater: (prev: AdaptationUiState) => AdaptationUiState) => void;
  voiceState: VoiceUiState;
  setVoiceState: (updater: (prev: VoiceUiState) => VoiceUiState) => void;
  libraryState: LibraryUiState;
  setLibraryState: (updater: (prev: LibraryUiState) => LibraryUiState) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [profiles, setProfiles] = useState<UserProfileRecord[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfileRecord | null>(null);
  const [wsStatus, setWsStatus] = useState<WsConnectionStatus>(wsManager.getStatus());
  const [visionSession, setVisionSession] = useState<VisionSessionRecord | null>(null);
  const [latestVisionFrame, setLatestVisionFrame] = useState<VisionAnalysisResult | null>(null);

  const [adaptationState, setAdaptationState] = useState<AdaptationUiState>({
    selectedId: '',
    activeSection: 'overview',
    draftProfile: null,
    isDirty: false,
    goalOverride: '',
    brainResult: null,
  });

  const [voiceState, setVoiceState] = useState<VoiceUiState>({
    text: 'Halo semuanya! Selamat datang di sesi bermain Overthinker hari ini.',
    emotion: 'neutral',
    selectedSampleId: null,
    lastResult: null,
  });

  const [libraryState, setLibraryState] = useState<LibraryUiState>({
    viewMode: 'grid',
    sortBy: 'name',
    searchQuery: '',
  });

  const refreshProfiles = useCallback(async () => {
    try {
      const data = await backendService.listUserProfiles();
      setProfiles(data.profiles);
      setActiveProfile(data.activeProfile);
    } catch {
      // Backend mungkin belum siap saat boot awal
    }
  }, []);

  const switchProfile = useCallback(async (id: string) => {
    const activated = await backendService.activateUserProfile(id);
    setActiveProfile(activated);
    setProfiles((prev) =>
      prev.map((p) => ({ ...p, isActive: p.id === activated.id })),
    );
  }, []);

  const refreshVisionSession = useCallback(async () => {
    try {
      const session = await backendService.getVisionSession();
      setVisionSession(session);
      if (session.lastAnalysis && session.snapshotUrl) {
        const last = session.lastAnalysis as unknown as VisionAnalysisResult;
        setLatestVisionFrame((prev) => prev ?? { ...last, snapshotUrl: session.snapshotUrl });
      }
    } catch {
      // ignore if backend offline
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
    void refreshVisionSession();

    const unsubStatus = wsManager.subscribeStatus((st) => {
      setWsStatus(st);
    });
    const unsubEvents = wsManager.subscribe((msg) => {
      if (msg.type === 'vision:frame' && msg.payload) {
        const frame = msg.payload as VisionAnalysisResult;
        setLatestVisionFrame(frame);
      }
    });
    const unsubResync = wsManager.onReconnectResync(() => {
      void refreshProfiles();
      void refreshVisionSession();
    });

    return () => {
      unsubStatus();
      unsubEvents();
      unsubResync();
    };
  }, [refreshProfiles, refreshVisionSession]);

  return (
    <AppStateContext.Provider
      value={{
        profiles,
        activeProfile,
        refreshProfiles,
        switchProfile,
        wsStatus,
        visionSession,
        latestVisionFrame,
        setLatestVisionFrame,
        setVisionSession,
        refreshVisionSession,
        adaptationState,
        setAdaptationState,
        voiceState,
        setVoiceState,
        libraryState,
        setLibraryState,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return ctx;
}
