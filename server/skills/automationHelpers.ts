const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
  'metadata.goog',
  '169.254.169.253',
  'fd00:ec2::254',
  'metadata.aliyun.com',
  '100.100.100.200',
  '169.254.169.250',
  '169.254.169.251',
]);

const BLOCKED_IP_PREFIXES = [
  '127.',
  '0.',
  '10.',
  '192.168.',
  '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
  '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
  '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '169.254.',
  '::1',
  'fc',
  'fd',
  'fe80',
];

/**
 * When non-empty, navigation is restricted to these domains (exact or subdomain).
 * Defaults to empty (permissive) for backward-compatibility; populate at startup
 * via AUTOMATION_ALLOWED_DOMAINS env (comma-separated) for production hardening.
 */
let ALLOWED_DOMAINS: string[] = (process.env.AUTOMATION_ALLOWED_DOMAINS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function addAllowedDomain(domain: string) {
  const d = domain.trim().toLowerCase();
  if (d && !ALLOWED_DOMAINS.includes(d)) ALLOWED_DOMAINS.push(d);
}

function isPrivateIp(hostname: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return BLOCKED_IP_PREFIXES.some((p) => hostname.startsWith(p));
  }
  if (hostname.includes(':')) {
    const lower = hostname.toLowerCase();
    return BLOCKED_IP_PREFIXES.slice(-3).some((p) => lower.startsWith(p));
  }
  return false;
}

function matchesDomainList(hostname: string, list: string[]): boolean {
  const h = hostname.toLowerCase();
  return list.some((d) => h === d || h.endsWith('.' + d));
}

export function assertSafeUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: `URL invalide: ${rawUrl}` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: `Schéma d'URL non autorisé: ${parsed.protocol} (seuls http/https sont acceptés).` };
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, error: `Hôte non autorisé: ${parsed.hostname}.` };
  }
  if (isPrivateIp(host)) {
    return { ok: false, error: `Navigation vers adresses privées/boucle locale interdite: ${parsed.hostname}.` };
  }

  if (ALLOWED_DOMAINS.length > 0 && !matchesDomainList(host, ALLOWED_DOMAINS)) {
    return {
      ok: false,
      error: `Domaine "${host}" hors allowlist. Domaines autorisés: ${ALLOWED_DOMAINS.join(', ')}.`,
    };
  }

  return { ok: true, url: parsed.toString() };
}

export function parseIntervalToMs(args: {
  intervalSeconds?: number;
  intervalMinutes?: number;
  intervalHours?: number;
  interval?: string;
}): number | null {
  const explicitSeconds = args.intervalSeconds;
  const explicitMinutes = args.intervalMinutes;
  const explicitHours = args.intervalHours;
  const explicitInterval = args.interval;

  if (typeof explicitSeconds === 'number' && explicitSeconds > 0) return explicitSeconds * 1000;
  if (typeof explicitMinutes === 'number' && explicitMinutes > 0) return explicitMinutes * 60 * 1000;
  if (typeof explicitHours === 'number' && explicitHours > 0) return explicitHours * 60 * 60 * 1000;

  if (explicitInterval) {
    const match = explicitInterval.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/i);
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 's': case 'sec': case 'secs': case 'second': case 'seconds':
        return value * 1000;
      case 'm': case 'min': case 'mins': case 'minute': case 'minutes':
        return value * 60 * 1000;
      case 'h': case 'hr': case 'hrs': case 'hour': case 'hours':
        return value * 60 * 60 * 1000;
    }
  }

  return null;
}
