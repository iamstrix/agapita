const configuredServerUrl = import.meta.env.VITE_SERVER_URL?.trim();

const isLoopbackUrl = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
};

export const SERVER_URL = configuredServerUrl && !isLoopbackUrl(configuredServerUrl)
  ? configuredServerUrl.replace(/\/+$/, '')
  : window.location.origin;
