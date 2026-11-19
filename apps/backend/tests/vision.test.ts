import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { VisionService } from '../src/services/vision/visionService.js';
import { PythonWorkerClient } from '../src/workers/pythonWorkerClient.js';

function createTestPng(width: number, height: number): Buffer {
  const chunk = (tag: string, data: Buffer): Buffer => {
    const tagBuf = Buffer.from(tag, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([tagBuf, data])) >>> 0, 0);
    return Buffer.concat([lenBuf, tagBuf, data, crcBuf]);
  };

  const row = Buffer.alloc(1 + width * 3, 120);
  row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('Vision Engine Integration', () => {
  it('captures, analyzes, and stores synthetic screenshot in SQLite', async () => {
    const workerScript = path.resolve(process.cwd(), '..', 'python-worker', 'main.py');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const workerClient = new PythonWorkerClient({
      pythonBin,
      workerScriptPath: workerScript,
      timeoutMs: 10000,
    });

    const tmpPng = path.join(os.tmpdir(), `ngegame-vision-test-${Date.now()}.png`);
    await fs.writeFile(tmpPng, createTestPng(128, 72));

    let createdId: number | undefined;
    try {
      const broadcasted: string[] = [];
      const visionService = new VisionService(workerClient, (eventType) => {
        broadcasted.push(eventType);
      });

      const result = await visionService.captureOnce({
        windowTitle: 'Vision Test Frame',
        sourcePath: tmpPng,
      });

      createdId = result.id;
      assert.ok(typeof createdId === 'number');
      assert.equal(result.width, 128);
      assert.equal(result.height, 72);
      assert.ok(result.processingMs < 5000);
      assert.deepEqual(broadcasted, ['vision:frame']);
    } finally {
      if (createdId !== undefined) {
        const { getPrismaClient, disconnectDatabase } = await import('../src/db/prisma.js');
        const prisma = getPrismaClient();
        await prisma.visionCapture.deleteMany({ where: { id: createdId } });
        await disconnectDatabase();
      }
      await workerClient.stop();
      await fs.rm(tmpPng, { force: true });
    }
  });
});
