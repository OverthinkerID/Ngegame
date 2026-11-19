# Dokumentasi REST API & WebSocket — Overthinker-Ngegame

Base URL lokal default: `http://localhost:47800`
WebSocket endpoint: `ws://localhost:47800/ws`

## Keamanan & Konvensi

- **CORS**: Hanya mengizinkan origin `localhost`, `127.0.0.1`, `file://`, atau permintaan tanpa origin (Electron main process).
- **Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- **Payload Limit**: Maksimum `2mb` JSON body.
- **Format Error Terpusat**: `{ "ok": false, "error": { "name", "code", "statusCode", "message" } }`.

## Daftar Grup Endpoint (`/api`)

- **Health & Logs**: `GET /api/health`, `GET /api/logs`, `POST /api/worker/ping`
- **Steam Manager**: `GET /api/steam/status`, `GET /api/steam/games`, `POST /api/steam/scan`, `POST /api/steam/games/:appId/launch`, `POST /api/steam/games/:appId/stop`
- **Vision Engine**: `GET /api/vision/status`, `GET /api/vision/windows`, `POST /api/vision/capture`, `POST /api/vision/start`, `POST /api/vision/stop`, `GET /api/vision/history`
- **AI Brain**: `GET /api/ai/config`, `PUT /api/ai/config`, `GET /api/ai/providers/health`, `POST /api/ai/think`, `GET /api/ai/history`
- **Game Controller**: `GET /api/controller/status`, `POST /api/controller/execute`, `POST /api/controller/pause`, `POST /api/controller/resume`, `POST /api/controller/release-all`, `POST /api/controller/emergency-stop`, `POST /api/controller/reset-emergency`, `GET /api/controller/history`
- **Game Adapters**: `GET /api/adapters`, `POST /api/adapters/resolve`
- **Human Supervision**: `GET /api/supervision/state`, `PUT /api/supervision/permission`, `PUT /api/supervision/policy`, `POST /api/supervision/pause-ai`, `POST /api/supervision/resume-ai`, `POST /api/supervision/takeover`, `POST /api/supervision/return-ai`, `POST /api/supervision/emergency-stop`, `POST /api/supervision/reset-emergency`, `GET /api/supervision/queue`, `POST /api/supervision/submit`, `POST /api/supervision/queue/:id/approve`, `POST /api/supervision/queue/:id/reject`, `GET /api/supervision/audit`
- **AI Voice Studio**: `GET /api/voice/status`, `GET /api/voice/settings`, `PUT /api/voice/settings`, `GET /api/voice/profiles`, `POST /api/voice/speak`, `POST /api/voice/commentary`, `GET /api/voice/history`
- **OBS & Multistream**: `GET /api/streaming/status`, `POST /api/streaming/obs/connect`, `POST /api/streaming/obs/disconnect`, `POST /api/streaming/scene`, `POST /api/streaming/source/toggle`, `POST /api/streaming/audio/mute`, `POST /api/streaming/credentials`, `DELETE /api/streaming/credentials/:platform`, `POST /api/streaming/start`, `POST /api/streaming/stop`, `POST /api/streaming/preview`
- **Analytics & System**: `GET /api/analytics/summary`, `GET /api/analytics/throttling`, `PUT /api/analytics/throttling`, `GET /api/analytics/export`, `GET /api/system/integrity`, `GET /api/system/env-check`, `GET /api/system/backups`, `POST /api/system/backup`, `POST /api/system/restore`
