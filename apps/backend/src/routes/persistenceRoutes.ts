import { Router } from 'express';
import type { AppBackupPayload } from '@ngegame/shared';
import type { PersistenceService } from '../services/persistence/persistenceService.js';
import type { UserDataStorageService } from '../services/persistence/userDataStorage.js';

export function createPersistenceRouter(
  storage: UserDataStorageService,
  persistence: PersistenceService,
): Router {
  const router = Router();

  router.get('/storage-info', async (_req, res, next) => {
    try {
      res.json(await persistence.getStorageOverview());
    } catch (err) {
      next(err);
    }
  });

  router.get('/assets/:id/content', async (req, res, next) => {
    try {
      const data = await storage.readAssetBuffer(req.params.id);
      if (!data) {
        res.status(404).json({ error: { message: 'Asset tidak ditemukan.' } });
        return;
      }
      res.setHeader('Content-Type', data.asset.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(data.buffer);
    } catch (err) {
      next(err);
    }
  });

  router.get('/profiles', async (_req, res, next) => {
    try {
      const profiles = await persistence.listUserProfiles();
      const active = profiles.find((p) => p.isActive) ?? profiles[0] ?? null;
      res.json({ profiles, activeProfile: active });
    } catch (err) {
      next(err);
    }
  });

  router.post('/profiles', async (req, res, next) => {
    try {
      const body = req.body as {
        displayName?: string;
        handle?: string;
        bio?: string;
        preferredLanguage?: string;
        defaultGameId?: string | null;
        defaultVoiceProfileId?: string | null;
        preferences?: Record<string, unknown>;
        activate?: boolean;
      };
      const profile = await persistence.createUserProfile({
        displayName: body.displayName ?? 'Profil Baru',
        handle: body.handle,
        bio: body.bio,
        preferredLanguage: body.preferredLanguage,
        defaultGameId: body.defaultGameId,
        defaultVoiceProfileId: body.defaultVoiceProfileId,
        preferences: body.preferences,
        activate: body.activate,
      });
      res.status(201).json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.put('/profiles/:id', async (req, res, next) => {
    try {
      const profile = await persistence.updateUserProfile(req.params.id, req.body);
      res.json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.post('/profiles/:id/activate', async (req, res, next) => {
    try {
      const profile = await persistence.setActiveUserProfile(req.params.id);
      res.json({ profile });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/profiles/:id', async (req, res, next) => {
    try {
      const deleted = await persistence.deleteUserProfile(req.params.id);
      res.json({ deleted });
    } catch (err) {
      next(err);
    }
  });

  router.get('/theme', async (_req, res, next) => {
    try {
      res.json(await persistence.getThemeSettings());
    } catch (err) {
      next(err);
    }
  });

  router.put('/theme', async (req, res, next) => {
    try {
      const updated = await persistence.updateThemeSettings(req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.get('/state', async (_req, res, next) => {
    try {
      res.json({ state: await persistence.getRuntimeStateMap() });
    } catch (err) {
      next(err);
    }
  });

  router.put('/state/:key', async (req, res, next) => {
    try {
      const { value } = req.body as { value?: unknown };
      await persistence.setRuntimeState(req.params.key, value);
      res.json({ ok: true, key: req.params.key });
    } catch (err) {
      next(err);
    }
  });

  router.get('/backup/export', async (_req, res, next) => {
    try {
      const payload = await persistence.exportFullBackup();
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  router.post('/backup/import', async (req, res, next) => {
    try {
      const summary = await persistence.importFullBackup(req.body as Partial<AppBackupPayload>);
      res.json({ ok: true, summary });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
