const devLikePorts = new Set(['5174', '4174']);
const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);

function isLocalHostname(hostname: string): boolean {
  return localHostnames.has(hostname) || hostname.startsWith('127.');
}

function resolveDefaultApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8787';
  }

  const { origin, port, protocol, hostname } = window.location;

  if (isLocalHostname(hostname)) {
    return `${protocol}//127.0.0.1:8787`;
  }

  if (import.meta.env.DEV || devLikePorts.has(port)) {
    return `${protocol}//${hostname}:8787`;
  }

  return origin;
}

function resolveConfiguredApiBaseUrl(): string | undefined {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured || configured.toLowerCase() === 'auto') {
    return undefined;
  }
  return configured;
}

export const apiBaseUrl = resolveConfiguredApiBaseUrl() ?? resolveDefaultApiBaseUrl();