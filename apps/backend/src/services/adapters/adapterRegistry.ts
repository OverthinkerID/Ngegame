import {
  AppError,
  ErrorCode,
  type AdapterResolveRequest,
  type GameAdapterDefinition,
} from '@ngegame/shared';
import {
  GENRE_BASE_ADAPTERS,
  STARDEW_VALLEY_ADAPTER,
  UNIVERSAL_ADAPTER,
} from './builtinAdapters.js';

export class AdapterRegistry {
  private readonly adapters = new Map<string, GameAdapterDefinition>();

  constructor(initialAdapters?: GameAdapterDefinition[]) {
    const defaults = initialAdapters ?? [
      STARDEW_VALLEY_ADAPTER,
      ...GENRE_BASE_ADAPTERS,
      UNIVERSAL_ADAPTER,
    ];
    for (const adapter of defaults) {
      this.register(adapter);
    }
  }

  public register(adapter: GameAdapterDefinition): void {
    if (!adapter.metadata?.id) {
      throw new AppError(
        'Adapter metadata.id is required',
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }
    this.adapters.set(adapter.metadata.id, adapter);
  }

  public list(): GameAdapterDefinition[] {
    return Array.from(this.adapters.values());
  }

  public getById(id: string): GameAdapterDefinition {
    const found = this.adapters.get(id);
    if (!found) {
      throw new AppError(`Adapter '${id}' not found`, ErrorCode.NOT_FOUND, 404);
    }
    return found;
  }

  public resolve(request: AdapterResolveRequest): GameAdapterDefinition {
    const all = this.list();

    // 1. Exact Steam AppID match (preferring non-generic / verified PoC adapters)
    if (typeof request.steamAppId === 'number') {
      const byAppId = all.find((a) =>
        a.gameIdentification.steamAppIds.includes(request.steamAppId as number),
      );
      if (byAppId) return byAppId;
    }

    // 2. Window title pattern match
    if (typeof request.windowTitle === 'string' && request.windowTitle.trim()) {
      const titleLower = request.windowTitle.toLowerCase();
      const byTitle = all.find(
        (a) =>
          a.metadata.id !== UNIVERSAL_ADAPTER.metadata.id &&
          a.gameIdentification.windowTitlePatterns.some(
            (pat) => pat !== '*' && titleLower.includes(pat.toLowerCase()),
          ),
      );
      if (byTitle) return byTitle;
    }

    // 3. Genre match
    if (request.genre && request.genre !== 'Universal') {
      const byGenre = all.find(
        (a) =>
          a.metadata.genre === request.genre &&
          a.metadata.id !== UNIVERSAL_ADAPTER.metadata.id,
      );
      if (byGenre) return byGenre;
    }

    // 4. Universal fallback
    return this.adapters.get(UNIVERSAL_ADAPTER.metadata.id) ?? UNIVERSAL_ADAPTER;
  }
}
