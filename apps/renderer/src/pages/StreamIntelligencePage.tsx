import {
  Activity,
  Bot,
  Clapperboard,
  FileText,
  MessageSquare,
  Mic,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Tv,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type {
  ChatAutomationMode,
  ChatIntelligenceStatusResponse,
  CommentaryLanguage,
  CommentaryPersonality,
  CommentaryStatusResponse,
  SceneIntelligenceStatusResponse,
  StreamHighlightsStatusResponse,
  StreamIntelligenceStatus,
  StreamSessionSummaryResponse,
  VoicePersonalityStatusResponse,
} from '@ngegame/shared';
import { AppSelect } from '../components/ui/AppSelect.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { Panel } from '../components/ui/Panel.js';
import { StatCard } from '../components/ui/StatCard.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';

interface StreamIntelligencePageProps {
  onNotify?: (message: string, type?: 'info' | 'success' | 'error') => void;
}

type StreamIntelTab =
  | 'events'
  | 'commentary'
  | 'voice'
  | 'chat'
  | 'scene'
  | 'highlights'
  | 'summary';

const TABS: { id: StreamIntelTab; label: string; icon: typeof Activity }[] = [
  { id: 'events', label: 'Live Event Monitor', icon: Activity },
  { id: 'commentary', label: 'Commentary Studio', icon: Sparkles },
  { id: 'voice', label: 'Voice Personality', icon: Mic },
  { id: 'chat', label: 'Chat Intelligence', icon: MessageSquare },
  { id: 'scene', label: 'OBS Scene Intelligence', icon: Tv },
  { id: 'highlights', label: 'Highlight Manager', icon: Clapperboard },
  { id: 'summary', label: 'Session Summary', icon: FileText },
];

export function StreamIntelligencePage({
  onNotify,
}: StreamIntelligencePageProps): React.JSX.Element {
  const [tab, setTab] = useState<StreamIntelTab>('events');
  const [eventStatus, setEventStatus] = useState<StreamIntelligenceStatus | null>(null);
  const [commentaryStatus, setCommentaryStatus] = useState<CommentaryStatusResponse | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoicePersonalityStatusResponse | null>(null);
  const [chatStatus, setChatStatus] = useState<ChatIntelligenceStatusResponse | null>(null);
  const [sceneStatus, setSceneStatus] = useState<SceneIntelligenceStatusResponse | null>(null);
  const [highlightStatus, setHighlightStatus] = useState<StreamHighlightsStatusResponse | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<StreamSessionSummaryResponse | null>(null);

  const [manualComment, setManualComment] = useState('');
  const [voiceText, setVoiceText] = useState('Halo semuanya, panen hari ini lancar jaya!');
  const [chatAuthor, setChatAuthor] = useState('Penonton01');
  const [chatMessage, setChatMessage] = useState('Bang ini game apa ya?');
  const [exportedText, setExportedText] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [ev, com, voc, ch, sc, hl, sum] = await Promise.all([
      backendService.getStreamIntelligenceStatus().catch(() => null),
      backendService.getCommentaryStatus().catch(() => null),
      backendService.getVoicePersonalityStatus().catch(() => null),
      backendService.getChatIntelligenceStatus().catch(() => null),
      backendService.getSceneIntelligenceStatus().catch(() => null),
      backendService.getHighlightsStatus().catch(() => null),
      backendService.getStreamSessionSummary().catch(() => null),
    ]);
    if (ev) setEventStatus(ev);
    if (com) setCommentaryStatus(com);
    if (voc) setVoiceStatus(voc);
    if (ch) setChatStatus(ch);
    if (sc) setSceneStatus(sc);
    if (hl) setHighlightStatus(hl);
    if (sum) setSummaryStatus(sum);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Stream Intelligence"
        description="Pusat kendali event gameplay real-time, komentar AI, kepribadian suara, chat penonton, rekomendasi scene OBS, highlight, dan ringkasan sesi."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Muat Ulang
            </button>
            {eventStatus?.emergencyStopped ? (
              <button
                type="button"
                onClick={() =>
                  void backendService.resetStreamIntelligenceEmergency().then(() => {
                    onNotify?.('Emergency Stop Stream Intelligence direset.', 'success');
                    void loadAll();
                  })
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-400"
              >
                Aktifkan Kembali
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  void backendService.emergencyStopStreamIntelligence().then(() => {
                    onNotify?.('Emergency Stop AI Stream Intelligence diaktifkan.', 'error');
                    void loadAll();
                  })
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/45 bg-rose-500/15 px-3 text-xs font-semibold text-rose-400"
              >
                <ShieldAlert className="h-3.5 w-3.5" /> Emergency Stop
              </button>
            )}
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Mode Operasi"
          value={eventStatus?.mode === 'automatic' ? 'Automatic' : 'Semi-Auto'}
          meta={eventStatus?.activeWindowTitle ?? 'Menunggu frame visi'}
          badge={
            <StatusBadge
              variant={eventStatus?.emergencyStopped ? 'warning' : 'healthy'}
              label={eventStatus?.emergencyStopped ? 'Stop' : 'Aktif'}
            />
          }
        />
        <StatCard
          label="Event Terverifikasi"
          value={String(eventStatus?.totalEventsDetected ?? 0)}
          meta="Berbasis Vision & OCR nyata"
        />
        <StatCard
          label="Komentar & Chat"
          value={`${commentaryStatus?.history.length ?? 0} / ${chatStatus?.interactions.length ?? 0}`}
          meta={commentaryStatus?.silenceDetected ? 'Diam terdeteksi' : 'Aliran normal'}
        />
        <StatCard
          label="Kandidat Highlight"
          value={String(highlightStatus?.candidates.length ?? 0)}
          meta={highlightStatus?.recordingActive ? 'OBS Merekam' : 'OBS Tidak Merekam'}
        />
      </section>

      <div className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-[var(--accent-primary-soft)] font-semibold text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'events' && (
        <Panel
          title="Live Event Monitor"
          subtitle="Deteksi event terverifikasi dari Monitor Visi & OCR (input kontroler tanpa bukti visual tidak dianggap berhasil)."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <AppSelect
                value={eventStatus?.mode ?? 'semi-automatic'}
                onChange={(v) =>
                  void backendService
                    .setStreamIntelligenceMode(v as 'semi-automatic' | 'automatic')
                    .then(() => {
                      onNotify?.(`Mode diubah ke ${v}.`, 'info');
                      void loadAll();
                    })
                }
                options={[
                  { value: 'semi-automatic', label: 'Semi-Automatic' },
                  { value: 'automatic', label: 'Automatic' },
                ]}
                className="w-40"
              />
              <button
                type="button"
                onClick={() =>
                  void backendService.analyzeStreamIntelligenceEvents().then((res) => {
                    onNotify?.(
                      res.verified
                        ? `${res.events.length} event terverifikasi.`
                        : res.reason ?? 'Belum ada event baru.',
                      res.verified ? 'success' : 'info',
                    );
                    void loadAll();
                  })
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                <Bot className="h-3.5 w-3.5" /> Analisis Frame Visi
              </button>
            </div>
          }
        >
          <div className="space-y-2 text-xs">
            {(eventStatus?.recentEvents ?? []).length === 0 ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-[var(--text-secondary)]">
                Belum ada event gameplay terverifikasi. Jalankan Monitor Visi terlebih dahulu atau klik Analisis Frame Visi.
              </div>
            ) : (
              eventStatus?.recentEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5"
                >
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">
                      [{ev.eventType}] {ev.title}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {ev.description} • Verifikasi: {ev.verifiedBy.join(', ')}
                    </div>
                  </div>
                  <StatusBadge
                    variant={ev.severity === 'critical' ? 'warning' : 'healthy'}
                    label={`${Math.round(ev.confidence * 100)}%`}
                  />
                </div>
              ))
            )}
          </div>
        </Panel>
      )}

      {tab === 'commentary' && (
        <Panel
          title="Commentary Studio"
          subtitle="Kepribadian narator, multi-bahasa, cooldown, pencegahan duplikasi, dan silence detection."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <AppSelect
                value={commentaryStatus?.config.personality ?? 'casual'}
                onChange={(v) =>
                  void backendService
                    .updateCommentaryConfig({ personality: v as CommentaryPersonality })
                    .then(() => void loadAll())
                }
                options={[
                  { value: 'casual', label: 'Casual Gaming' },
                  { value: 'funny', label: 'Funny' },
                  { value: 'professional', label: 'Professional' },
                  { value: 'cinematic', label: 'Cinematic' },
                ]}
                className="w-40"
              />
              <AppSelect
                value={commentaryStatus?.config.language ?? 'id'}
                onChange={(v) =>
                  void backendService
                    .updateCommentaryConfig({ language: v as CommentaryLanguage })
                    .then(() => void loadAll())
                }
                options={[
                  { value: 'id', label: 'Indonesia' },
                  { value: 'en', label: 'English' },
                  { value: 'ja', label: '日本語' },
                ]}
                className="w-32"
              />
              <button
                type="button"
                onClick={() =>
                  void backendService.stopStreamCommentary(true).then(() => {
                    onNotify?.('Antrean komentar dihentikan & di-mute.', 'info');
                    void loadAll();
                  })
                }
                className="inline-flex h-8 items-center rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs text-rose-400"
              >
                Stop &amp; Mute
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={manualComment}
                onChange={(e) => setManualComment(e.target.value)}
                placeholder="Tulis komentar manual atau kosongkan untuk komentar dari event terbaru..."
                className="h-9 min-w-[260px] flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={() =>
                  void backendService
                    .generateStreamCommentary({
                      text: manualComment.trim() || undefined,
                      bypassCooldown: true,
                    })
                    .then((res) => {
                      onNotify?.(
                        res.accepted ? 'Komentar ditambahkan.' : res.reason ?? 'Komentar dilewati.',
                        res.accepted ? 'success' : 'info',
                      );
                      setManualComment('');
                      void loadAll();
                    })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-4 font-semibold text-[var(--text-primary)]"
              >
                <Sparkles className="h-3.5 w-3.5" /> Buat Komentar
              </button>
            </div>
            <div className="space-y-2">
              {(commentaryStatus?.history ?? []).slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5"
                >
                  <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                    <span>{c.personality} • {c.language.toUpperCase()} • prioritas {c.priority}</span>
                    <span className="font-mono">{c.status}</span>
                  </div>
                  <div className="mt-1 text-[var(--text-primary)]">{c.editedText ?? c.text}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {tab === 'voice' && (
        <Panel
          title="Voice Personality"
          subtitle="Profil suara, kecepatan, pitch, ekspresivitas, antrean TTS berprioritas, dan routing ke OBS."
          action={
            <button
              type="button"
              onClick={() =>
                void backendService.interruptVoicePersonality().then(() => {
                  onNotify?.('Pemutaran suara diinterupsi.', 'info');
                  void loadAll();
                })
              }
              className="inline-flex h-8 items-center rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 text-xs text-rose-400"
            >
              Interupsi / Stop
            </button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <AppSelect
                value={voiceStatus?.config.activeProfileId ?? 'overthinker-casual-id'}
                onChange={(v) =>
                  void backendService
                    .updateVoicePersonalityConfig({ activeProfileId: v })
                    .then(() => void loadAll())
                }
                options={(voiceStatus?.profiles ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
              />
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2">
                <span>Kecepatan: {voiceStatus?.config.speed ?? 1}x</span>
                <span>Pitch: {voiceStatus?.config.pitch ?? 1}x</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2">
                <span>Route OBS: {voiceStatus?.config.routeToObs ? 'Aktif' : 'Nonaktif'}</span>
                <span>Lokal TTS: {voiceStatus?.config.preferLocalTts ? 'Prioritas' : 'Fallback'}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                className="h-9 min-w-[260px] flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={() =>
                  void backendService
                    .speakVoicePersonality({ text: voiceText, priority: 3, playAudio: false })
                    .then(() => {
                      onNotify?.('Suara dimasukkan ke antrean prioritas.', 'success');
                      void loadAll();
                    })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-4 font-semibold text-[var(--text-primary)]"
              >
                <Mic className="h-3.5 w-3.5" /> Uji Antrean Suara
              </button>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'chat' && (
        <Panel
          title="Chat Intelligence (YouTube &amp; Twitch)"
          subtitle="Deteksi pertanyaan penonton, spam, kata terlarang, FAQ, serta mode persetujuan balasan."
          action={
            <AppSelect
              value={chatStatus?.config.mode ?? 'approval_required'}
              onChange={(v) =>
                void backendService
                  .updateChatIntelligenceConfig({ mode: v as ChatAutomationMode })
                  .then(() => void loadAll())
              }
              options={[
                { value: 'observe_only', label: 'Observe Only' },
                { value: 'suggest_reply', label: 'Suggest Reply' },
                { value: 'approval_required', label: 'Approval Required' },
                { value: 'automatic_reply', label: 'Automatic Reply' },
              ]}
              className="w-44"
            />
          }
        >
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={chatAuthor}
                onChange={(e) => setChatAuthor(e.target.value)}
                placeholder="Nama penonton"
                className="h-9 w-36 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs"
              />
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Pesan chat..."
                className="h-9 min-w-[220px] flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  void backendService
                    .ingestChatIntelligenceMessage({
                      platform: 'youtube',
                      author: chatAuthor,
                      message: chatMessage,
                    })
                    .then(() => void loadAll())
                }
                className="inline-flex h-9 items-center rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-4 font-semibold"
              >
                Proses Pesan Chat
              </button>
            </div>
            <div className="space-y-2">
              {(chatStatus?.interactions ?? []).slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      [{item.platform}] {item.author}: {item.message}
                    </span>
                    <StatusBadge
                      variant={item.isSpam || item.category === 'toxic' ? 'warning' : 'healthy'}
                      label={item.category}
                    />
                  </div>
                  {item.proposedReply && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                      <span>Usulan: {item.finalReply ?? item.proposedReply} ({item.replyStatus})</span>
                      {item.replyStatus === 'proposed' && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              void backendService
                                .approveChatIntelligenceReply(item.id)
                                .then(() => void loadAll())
                            }
                            className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-emerald-400"
                          >
                            Setujui
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void backendService
                                .rejectChatIntelligenceReply(item.id)
                                .then(() => void loadAll())
                            }
                            className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-rose-400"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {tab === 'scene' && (
        <Panel
          title="OBS Scene Intelligence"
          subtitle="Analisis konteks gameplay untuk rekomendasi perpindahan scene OBS, overlay, dan kamera."
          action={
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(sceneStatus?.config.autoSwitchEnabled)}
                  onChange={(e) =>
                    void backendService
                      .updateSceneIntelligenceConfig({ autoSwitchEnabled: e.target.checked })
                      .then(() => void loadAll())
                  }
                />
                Otomatisasi Scene OBS
              </label>
              <button
                type="button"
                onClick={() =>
                  void backendService.analyzeSceneIntelligence().then(() => void loadAll())
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold"
              >
                <Radio className="h-3.5 w-3.5" /> Analisis Konteks OBS
              </button>
            </div>
          }
        >
          <div className="space-y-2 text-xs">
            {(sceneStatus?.recommendations ?? []).slice(0, 8).map((rec) => (
              <div
                key={rec.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5"
              >
                <div>
                  <div className="font-semibold">
                    Saran Scene: {rec.recommendedScene ?? '-'} • Overlay: {rec.recommendedOverlay ?? '-'}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {rec.reason} • Kamera: {rec.cameraVisible ? 'Tampil' : 'Sembunyi'} • Status: {rec.status}
                  </div>
                </div>
                {rec.status === 'pending' && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        void backendService.approveSceneIntelligence(rec.id).then(() => void loadAll())
                      }
                      className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-emerald-400"
                    >
                      Terapkan
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void backendService.rejectSceneIntelligence(rec.id).then(() => void loadAll())
                      }
                      className="rounded border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-rose-400"
                    >
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'highlights' && (
        <Panel
          title="Highlight Manager"
          subtitle="Deteksi momen penting beserta skor dan offset timestamp (klip fisik hanya tersedia jika rekaman OBS atau replay buffer aktif)."
          action={
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void backendService.detectHighlight().then(() => void loadAll())}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold"
              >
                <Clapperboard className="h-3.5 w-3.5" /> Deteksi Highlight
              </button>
              <button
                type="button"
                onClick={() =>
                  void backendService.exportHighlights('json').then((txt) => setExportedText(txt))
                }
                className="inline-flex h-8 items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 text-xs"
              >
                Ekspor JSON
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            {(highlightStatus?.candidates ?? []).slice(0, 8).map((hl) => (
              <div
                key={hl.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5"
              >
                <div>
                  <div className="font-semibold">
                    {hl.title} (Skor: {hl.highlightScore})
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Offset {hl.startOffsetSeconds}s–{hl.endOffsetSeconds}s • Klip:{' '}
                    {hl.clipSupported ? hl.recordingSource : 'Rekaman OBS belum aktif'} • {hl.status}
                  </div>
                </div>
                {hl.status === 'pending' && (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        void backendService.approveHighlight(hl.id).then(() => void loadAll())
                      }
                      className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-emerald-400"
                    >
                      Setujui Klip
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void backendService.rejectHighlight(hl.id).then(() => void loadAll())
                      }
                      className="rounded border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-rose-400"
                    >
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            ))}
            {exportedText && (
              <pre className="max-h-48 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] p-3 text-[11px]">
                {exportedText}
              </pre>
            )}
          </div>
        </Panel>
      )}

      {tab === 'summary' && (
        <Panel
          title="Session Summary"
          subtitle="Ringkasan durasi, event penting, interaksi chat, komentar AI, kandidat highlight, dan performa siaran."
          action={
            <button
              type="button"
              onClick={() =>
                void backendService.generateStreamSessionSummary(1800).then(() => {
                  onNotify?.('Laporan ringkasan sesi dibuat.', 'success');
                  void loadAll();
                })
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold"
            >
              <FileText className="h-3.5 w-3.5" /> Buat Laporan Sesi
            </button>
          }
        >
          <div className="space-y-3 text-xs">
            {summaryStatus?.latest ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                <div className="font-semibold text-[var(--text-primary)]">
                  {summaryStatus.latest.summaryText}
                </div>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {summaryStatus.latest.reportMarkdown}
                </pre>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-[var(--text-secondary)]">
                Belum ada ringkasan sesi. Klik Buat Laporan Sesi untuk mengagregasi data sesi terbaru.
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
