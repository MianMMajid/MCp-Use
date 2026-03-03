/**
 * useStepUpAuth.ts
 *
 * React hook for step-up authentication flow.
 * Manages challenge/verify lifecycle for elevated-privilege operations.
 */
import { useState, useCallback } from "react";

export interface StepUpAuthState {
  needed: boolean;
  loading: boolean;
  error: string | null;
  challengeToken: string | null;
}

interface StepUpAuthActions {
  requestChallenge: (tenantId: string, orgId: string) => Promise<string | null>;
  verifyChallenge: () => Promise<boolean>;
  submitWithStepUp: (
    approvalId: string,
    action: string,
    reason: string,
    challengeToken: string
  ) => Promise<{ ok: boolean; error?: string }>;
  reset: () => void;
}

export type UseStepUpAuthReturn = StepUpAuthState & StepUpAuthActions;

const API_BASE = "/api/operations/orchestrations/step-up";
const APPROVAL_API = "/api/openclaw/modifier/approvals/step-up-decide";

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  // Check for session token in cookie or localStorage
  const match = document.cookie.match(/(?:^|;\s*)maple_session=([^;]*)/);
  return match?.[1] ?? localStorage.getItem("maple_session") ?? null;
}

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export function useStepUpAuth(): UseStepUpAuthReturn {
  const [state, setState] = useState<StepUpAuthState>({
    needed: false,
    loading: false,
    error: null,
    challengeToken: null,
  });

  const requestChallenge = useCallback(
    async (tenantId: string, orgId: string): Promise<string | null> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const resp = await fetch(`${API_BASE}/challenge`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ tenantId, orgId }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? `Challenge request failed (${resp.status})`);
        }

        const data = await resp.json();
        const challengeToken = data.challengeToken ?? null;
        setState((s) => ({
          ...s,
          loading: false,
          challengeToken,
          needed: true,
        }));
        return challengeToken;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, loading: false, error: message }));
        return null;
      }
    },
    []
  );

  const verifyChallenge = useCallback(
    async (): Promise<boolean> => {
      if (!state.challengeToken) return false;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const resp = await fetch(`${API_BASE}/verify`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            challengeToken: state.challengeToken,
          }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? `Verification failed (${resp.status})`);
        }

        setState((s) => ({ ...s, loading: false, needed: false }));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, loading: false, error: message }));
        return false;
      }
    },
    [state.challengeToken]
  );

  const submitWithStepUp = useCallback(
    async (
      approvalId: string,
      action: string,
      reason: string,
      challengeToken: string
    ): Promise<{ ok: boolean; error?: string }> => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const resp = await fetch(APPROVAL_API, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            approvalId,
            action,
            reason,
            challengeToken,
          }),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          throw new Error(data.error ?? `Step-up decision failed (${resp.status})`);
        }

        setState((s) => ({ ...s, loading: false, needed: false }));
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, loading: false, error: message }));
        return { ok: false, error: message };
      }
    },
    []
  );

  const reset = useCallback(() => {
    setState({ needed: false, loading: false, error: null, challengeToken: null });
  }, []);

  return {
    ...state,
    requestChallenge,
    verifyChallenge,
    submitWithStepUp,
    reset,
  };
}
