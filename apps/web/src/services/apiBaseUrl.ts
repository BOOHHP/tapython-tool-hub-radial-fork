const devLikePorts = new Set(['5174', '4174']);

function resolveDefaultApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8787';
  }

  const { origin, port, protocol, hostname } = window.location;

  if (import.meta.env.DEV || devLikePorts.has(port)) {
    return `${protocol}//${hostname}:8787`;
  }

  return origin;
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? resolveDefaultApiBaseUrl();