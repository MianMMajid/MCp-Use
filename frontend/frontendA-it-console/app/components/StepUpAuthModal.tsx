/**
 * StepUpAuthModal.tsx
 *
 * Modal dialog for step-up authentication. Prompts the user to re-enter
 * their password before performing an elevated-privilege operation
 * (e.g., approving a dangerous modifier execution).
 */
"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useStepUpAuth } from "../hooks/useStepUpAuth";

interface StepUpAuthModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (token: string) => void;
  tenantId: string;
  orgId: string;
}

export function StepUpAuthModal({
  open,
  onClose,
  onVerified,
  tenantId,
  orgId,
}: StepUpAuthModalProps) {
  const { loading, error, challengeToken, requestChallenge, verifyChallenge, reset } =
    useStepUpAuth();
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"idle" | "challenged">("idle");

  const handleOpen = useCallback(async () => {
    if (!challengeToken) {
      const token = await requestChallenge(tenantId, orgId);
      if (token) setStep("challenged");
    }
  }, [challengeToken, requestChallenge, tenantId, orgId]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!password.trim() || !challengeToken) return;

      const success = await verifyChallenge();
      if (success) {
        onVerified(challengeToken);
        setPassword("");
        setStep("idle");
        reset();
        onClose();
      }
    },
    [password, challengeToken, verifyChallenge, onVerified, onClose, reset]
  );

  const handleClose = useCallback(() => {
    setPassword("");
    setStep("idle");
    reset();
    onClose();
  }, [onClose, reset]);

  // Auto-request challenge when opened
  if (open && step === "idle" && !challengeToken && !loading) {
    handleOpen();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2
          id="step-up-title"
          className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Step-Up Authentication Required
        </h2>

        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          This action requires elevated privileges. Please re-enter your password
          to continue.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="step-up-password"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Password
          </label>
          <input
            id="step-up-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="mb-4 w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="Enter your password"
            autoFocus
          />

          {error && (
            <div className="mb-4 rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="rounded px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
