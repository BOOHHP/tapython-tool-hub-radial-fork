import { useEffect, useState } from 'react';
import { getHubSession, isFeishuLoginEnabled, type HubUser } from '../../services/auth';

export interface HubSessionState {
  ready: boolean;
  enabled: boolean;
  user?: HubUser;
}

export function useHubSession(): HubSessionState & { clear: () => void } {
  const [state, setState] = useState<HubSessionState>({ ready: false, enabled: false });

  useEffect(() => {
    let cancelled = false;
    void isFeishuLoginEnabled().then(async (enabled) => {
      const session = enabled ? await getHubSession() : undefined;
      if (!cancelled) {
        setState({ ready: true, enabled, user: session?.authenticated ? session.user : undefined });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, clear: () => setState((current) => ({ ...current, user: undefined })) };
}
