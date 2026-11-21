import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SERVICE_NAME = 'Overthinker-Ngegame-Stream';

export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 4) {
    return '****';
  }
  return `${'*'.repeat(Math.min(trimmed.length - 4, 12))}${trimmed.slice(-4)}`;
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/live_[a-zA-Z0-9_-]{8,}/g, 'live_***REDACTED***')
    .replace(/ya29\.[a-zA-Z0-9._-]{12,}/g, 'ya29.***REDACTED***')
    .replace(/oauth:[a-zA-Z0-9_-]{8,}/g, 'oauth:***REDACTED***')
    .replace(/(Bearer\s+)[a-zA-Z0-9._-]{8,}/gi, '$1***REDACTED***')
    .replace(/(streamKey|client_secret|access_token|refresh_token|password)["']?\s*[:=]\s*["']?[^\s,"'}]+/gi, '$1=***REDACTED***');
}

/**
 * Stores stream credentials & OAuth tokens in OS Credential Manager:
 * - Windows: cmdkey (Windows Credential Manager)
 * - macOS: security add-generic-password (macOS Keychain)
 * Falls back to AES-256-GCM encrypted memory vault if OS keychain is unavailable in headless tests.
 * Never persists plaintext keys, passwords, or tokens to SQLite or logs.
 */
export class StreamCredentialStore {
  private readonly sessionKey = crypto.randomBytes(32);
  private readonly memoryVault = new Map<string, { iv: string; tag: string; data: string }>();
  private lastBackend: 'os-credential-manager' | 'memory-encrypted' =
    process.platform === 'darwin' || process.platform === 'win32'
      ? 'os-credential-manager'
      : 'memory-encrypted';

  public getVaultBackend(): 'os-credential-manager' | 'memory-encrypted' {
    return this.lastBackend;
  }

  private encryptInMemory(account: string, secret: string): void {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.sessionKey, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    this.memoryVault.set(account, {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
    });
  }

  private decryptInMemory(account: string): string | null {
    const entry = this.memoryVault.get(account);
    if (!entry) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.sessionKey,
      Buffer.from(entry.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(entry.data, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  public async saveSecret(
    account: string,
    secret: string,
  ): Promise<'os-credential-manager' | 'memory-encrypted'> {
    const trimmed = secret.trim();
    this.encryptInMemory(account, trimmed);

    try {
      if (process.platform === 'darwin') {
        await execFileAsync('security', [
          'add-generic-password',
          '-a',
          account,
          '-s',
          SERVICE_NAME,
          '-w',
          trimmed,
          '-U',
        ]);
        this.lastBackend = 'os-credential-manager';
        return 'os-credential-manager';
      }

      if (process.platform === 'win32') {
        await execFileAsync('cmdkey', [
          `/generic:${SERVICE_NAME}:${account}`,
          `/user:${account}`,
          `/pass:${trimmed}`,
        ]);
        this.lastBackend = 'os-credential-manager';
        return 'os-credential-manager';
      }
    } catch {
      // Fallback to encrypted memory vault when OS keychain is locked or unavailable
    }

    this.lastBackend = 'memory-encrypted';
    return 'memory-encrypted';
  }

  public async getSecret(account: string): Promise<string | null> {
    const mem = this.decryptInMemory(account);
    if (mem) return mem;

    try {
      if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync('security', [
          'find-generic-password',
          '-a',
          account,
          '-s',
          SERVICE_NAME,
          '-w',
        ]);
        const found = stdout.trim();
        if (found) {
          this.encryptInMemory(account, found);
          return found;
        }
      }
    } catch {
      // fallback to memory vault
    }

    return null;
  }

  public async hasSecret(account: string): Promise<boolean> {
    const val = await this.getSecret(account);
    return Boolean(val && val.length > 0);
  }

  public async deleteSecret(account: string): Promise<void> {
    this.memoryVault.delete(account);
    try {
      if (process.platform === 'darwin') {
        await execFileAsync('security', [
          'delete-generic-password',
          '-a',
          account,
          '-s',
          SERVICE_NAME,
        ]);
      } else if (process.platform === 'win32') {
        await execFileAsync('cmdkey', [`/delete:${SERVICE_NAME}:${account}`]);
      }
    } catch {
      // ignore if not present in OS store
    }
  }
}
