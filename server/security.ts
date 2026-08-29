import path from 'path';
import { SELF_ROOT } from './utils/selfRoot';

export interface AuthOptions {
  apiToken?: string;
}

export interface AuthResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export function authenticateRequest(req: { headers?: Record<string, string | string[] | undefined> }, options: AuthOptions = {}): AuthResult {
  const configuredToken = options.apiToken;
  if (!configuredToken) {
    return { ok: true };
  }

  const headerValue = req.headers?.['x-Leanna-token'];
  const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (token === configuredToken) {
    return { ok: true };
  }

  return { ok: false, status: 401, error: 'Unauthorized' };
}

export interface RateLimiter {
  check: (key: string) => boolean;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }

      if (existing.count >= limit) {
        return false;
      }

      existing.count += 1;
      return true;
    },
  };
}

export function resolveWorkspacePath(requestedPath: string, workspaceRoot: string): { ok: true; absolutePath: string } | { ok: false; status: number; error: string } {
  const absolutePath = path.resolve(workspaceRoot, requestedPath);
  const normalizedRoot = path.resolve(workspaceRoot);
  const normalizedTarget = path.resolve(absolutePath);

  if (!normalizedTarget.startsWith(normalizedRoot + path.sep) && normalizedTarget !== normalizedRoot) {
    return { ok: false, status: 403, error: 'Path outside workspace' };
  }

  return { ok: true, absolutePath: normalizedTarget };
}

/**
 * Returns the default workspace root (the project root).
 */
export function getDefaultWorkspaceRoot(): string {
  return SELF_ROOT;
}

/**
 * Authenticate a raw token string (e.g. from a WebSocket query param).
 * If no apiToken is configured, access is granted by default.
 */
export function authenticateToken(token: string | null | undefined, apiToken: string | undefined): AuthResult {
  if (!apiToken) {
    return { ok: true };
  }
  if (token === apiToken) {
    return { ok: true };
  }
  return { ok: false, status: 401, error: 'Unauthorized' };
}
