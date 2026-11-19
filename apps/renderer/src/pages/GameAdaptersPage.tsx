import { useCallback, useEffect, useState } from 'react';
import { Puzzle, Search } from 'lucide-react';
import type { GameAdapterDefinition } from '@ngegame/shared';
import { ErrorState } from '../components/ui/FeedbackComponents.js';
import { Panel } from '../components/ui/Panel.js';
import { StatusBadge } from '../components/ui/StatusBadge.js';
import { backendService } from '../services/backendService.js';

export function GameAdaptersPage(): React.JSX.Element {
  const [adapters, setAdapters] = useState<GameAdapterDefinition[]>([]);
  const [selected, setSelected] = useState<GameAdapterDefinition | null>(null);
  const [testTitle, setTestTitle] = useState('Stardew Valley');
  const [error, setError] = useState<string | null>(null);

  const loadAdapters = useCallback(async () => {
    setError(null);
    try {
      const list = await backendService.listAdapters();
      setAdapters(list);
      if (list.length > 0 && !selected) {
        setSelected(list[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar adaptor.');
    }
  }, [selected]);

  useEffect(() => {
    void loadAdapters();
  }, [loadAdapters]);

  const handleResolveTest = async (): Promise<void> => {
    setError(null);
    try {
      const resolved = await backendService.resolveAdapter({
        windowTitle: testTitle,
      });
      setSelected(resolved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal melakukan resolusi adaptor.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Registri Adaptor Game
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          Arsitektur plugin untuk 7 genre game, adaptor cadangan Universal, serta profil Stardew Valley.
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={() => void loadAdapters()} />}

      <Panel
        title="Daftar Adaptor Terdaftar"
        subtitle="Uji resolusi adaptor otomatis berdasarkan judul jendela game."
        action={
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              placeholder="Uji nama jendela game..."
              className="studio-input h-9 rounded-lg px-3 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleResolveTest()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent-primary)]/45 bg-[var(--accent-primary-soft)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:opacity-90"
            >
              <Search className="h-3.5 w-3.5" />
              Uji Resolusi
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adapters.map((adapter) => {
            const isSelected = selected?.metadata.id === adapter.metadata.id;
            return (
              <button
                key={adapter.metadata.id}
                type="button"
                onClick={() => setSelected(adapter)}
                className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                      <Puzzle className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                      {adapter.metadata.name}
                    </h3>
                    <StatusBadge
                      variant={
                        adapter.compatibilityStatus === 'verified'
                          ? 'healthy'
                          : adapter.compatibilityStatus === 'experimental'
                            ? 'warning'
                            : 'neutral'
                      }
                      label={adapter.compatibilityStatus}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {adapter.metadata.description}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-[11px] text-[var(--text-muted)]">
                  <span>Genre: {adapter.metadata.genre}</span>
                  <span className="tabular-nums">{adapter.objectiveDefinition.length} Objektif</span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      {selected && (
        <Panel
          title={`Detail Adaptor: ${selected.metadata.name}`}
          subtitle={`ID: ${selected.metadata.id} • Versi ${selected.metadata.version}`}
        >
          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
              <div className="font-semibold text-[var(--text-primary)]">
                Pemetaan Kontrol &amp; Aturan Strategi
              </div>
              {selected.controlMapping.map((bind) => (
                <div
                  key={bind.actionType}
                  className="flex justify-between text-[var(--text-secondary)]"
                >
                  <span className="font-mono text-[var(--accent-primary)]">{bind.actionType}</span>
                  <span className="tabular-nums">
                    {bind.key} ({bind.defaultDurationMs}ms)
                  </span>
                </div>
              ))}
              <div className="pt-2 font-semibold text-[var(--text-primary)]">Aturan Strategi</div>
              {selected.strategyRules.map((rule, i) => (
                <div key={i} className="text-[var(--text-secondary)]">
                  • {rule}
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
              <div className="font-semibold text-[var(--text-primary)]">
                Tata Letak Layar &amp; Objektif
              </div>
              {selected.screenLayout.map((reg) => (
                <div key={reg.name} className="flex justify-between text-[var(--text-secondary)]">
                  <span>{reg.name}</span>
                  <span className="tabular-nums font-mono">
                    {reg.xPercent}%,{reg.yPercent}% ({reg.widthPercent}×{reg.heightPercent}%)
                  </span>
                </div>
              ))}
              <div className="pt-2 font-semibold text-[var(--text-primary)]">Objektif</div>
              {selected.objectiveDefinition.map((obj) => (
                <div key={obj.id} className="text-[var(--text-secondary)]">
                  • <strong className="text-[var(--text-primary)]">{obj.title}</strong>:{' '}
                  {obj.description}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
