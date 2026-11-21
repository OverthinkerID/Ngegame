export type PageId =
  | 'dashboard'
  | 'library'
  | 'ai-control'
  | 'vision'
  | 'adapters'
  | 'adaptation-studio'
  | 'streaming'
  | 'stream-intelligence'
  | 'voice'
  | 'analytics'
  | 'history'
  | 'system-monitor'
  | 'settings';

export type ThemeMode = 'dark' | 'light';
export type ThemeAccent = 'violet' | 'cyan' | 'emerald' | 'overthinker';

export interface NavItem {
  id: PageId;
  label: string;
  description: string;
  badge?: string;
}

export interface DummyGameItem {
  id: string;
  steamAppId: number;
  title: string;
  genre: string;
  compatibility: 'verified' | 'experimental' | 'unsupported';
  adapterName: string;
  lastPlayed: string;
}

export interface DummyActionQueueItem {
  id: string;
  action: string;
  target: string;
  confidence: number;
  permissionLevel: 'L1' | 'L2' | 'L3';
  status: 'pending' | 'approved' | 'rejected';
  timestamp: string;
}

export interface DummyAdapterItem {
  id: string;
  name: string;
  genre: string;
  status: 'ready' | 'planned';
  objectivesCount: number;
  description: string;
}

export interface DummySessionItem {
  id: string;
  gameTitle: string;
  duration: string;
  aiActions: number;
  streamPlatform: string;
  status: 'completed' | 'aborted';
  date: string;
}
