/**
 * ApprovalPanel.tsx
 *
 * Panel for making modifier approval decisions.
 * Integrates with StepUpAuthModal when step-up authentication is required.
 */
"use client";

import { useState, useCallback } from "react";
import { StepUpAuthModal } from "./StepUpAuthModal";

interface Approval {
  approvalId: string;
  tool: string;
  targetProfile: string;
  status: string;
  tenantId: string;
  orgId: string;
  reason?: string;
  createdAt: string;
}

interface ApprovalPanelProps {
  approval: Approval;
  onDecided?: (result: { approvalId: string; action: string }) => void;
}

function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)maple_session=([^;]*)/);
  return match?.[1] ?? localStorage.getItem("maple_session") ?? null;
}

export function ApprovalPanel({ approval, onDecided }: ApprovalPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStepUp, setShowStepUp] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    action: string;
    reason: string;
  } | null>(null);

  const submitDecision = useCallback(
    async (action: string, reason: string, challengeToken?: string) => {
      setLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const token = getSessionToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const endpoint = challengeToken
          ? "/api/openclaw/modifier/approvals/step-up-decide"
          : "/api/openclaw/modifier/approvals/decide";

        const body: Record<string, string> = {
          approvalId: approval.approvalId,
          action,
          reason,
        };
        if (challengeToken) body.challengeToken = challengeToken;

        const resp = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        const data = await resp.json().catch(() => ({}));

        if (resp.status === 403 && data.stepUpRequired) {
          // Step-up auth needed — show modal
          setPendingAction({ action, reason });
          setShowStepUp(true);
          setLoading(false);
          return;
        }

        if (!resp.ok) {
          throw new Error(data.error ?? `Decision failed (${resp.status})`);
        }

        onDecided?.({ approvalId: approval.approvalId, action });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [approval.approvalId, onDecided]
  );

  const handleStepUpVerified = useCallback(
    (token: string) => {
      if (pendingAction) {
        submitDecision(pendingAction.action, pendingAction.reason, token);
      }
      setShowStepUp(false);
      setPendingAction(null);
    },
    [pendingAction, submitDecision]
  );

  if (approval.status !== "pending_approval") {
    return (
      <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
        <p className="text-sm text-zinc-500">
          Approval <strong>{approval.approvalId}</strong> is{" "}
          <span className="font-medium">{approval.status}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Approval Required
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Tool: <code>{approval.tool}</code> | Target:{" "}
          <code>{approval.targetProfile}</code>
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => submitDecision("approve", "Approved by operator")}
          disabled={loading}
          className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "..." : "Approve"}
        </button>
        <button
          onClick={() => submitDecision("deny", "Denied by operator")}
          disabled={loading}
          className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "..." : "Deny"}
        </button>
      </div>

      <StepUpAuthModal
        open={showStepUp}
        onClose={() => {
          setShowStepUp(false);
          setPendingAction(null);
        }}
        onVerified={handleStepUpVerified}
        tenantId={approval.tenantId}
        orgId={approval.orgId}
      />
    </div>
  );
}
