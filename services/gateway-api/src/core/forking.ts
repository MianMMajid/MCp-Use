import { randomUUID } from "node:crypto";
import type { Trace, TraceDiff, TraceDiffChange, TraceForkEdits, TraceStep } from "@maple/types";

function summarize(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function applyEdits(step: TraceStep, edits: TraceForkEdits): TraceStep {
  const patched: TraceStep = {
    ...step,
    guardStatus: "pending",
    metadata: {
      ...(step.metadata ?? {}),
      forkEdited: true,
    },
  };

  if (edits.prompt !== undefined) {
    patched.prompt = edits.prompt;
  }
  if (edits.output !== undefined) {
    patched.output = edits.output;
  }
  if (edits.command !== undefined) {
    patched.command = edits.command;
  }
  if (edits.toolName !== undefined) {
    patched.toolCall = {
      ...(patched.toolCall ?? { name: edits.toolName }),
      name: edits.toolName,
    };
  }
  if (edits.toolResponse !== undefined) {
    patched.toolCall = {
      ...(patched.toolCall ?? { name: "simulated_tool" }),
      output: edits.toolResponse,
    };
  }

  return patched;
}

function normalizeStepIndexes(steps: TraceStep[]): TraceStep[] {
  return steps.map((step, index) => ({
    ...step,
    index,
  }));
}

function buildDiff(original: Trace, forked: Trace): TraceDiff {
  const changeLog: TraceDiffChange[] = [];
  const changedSteps = new Set<number>();
  const addedSteps: number[] = [];

  const minLength = Math.min(original.steps.length, forked.steps.length);

  for (let index = 0; index < minLength; index += 1) {
    const before = original.steps[index];
    const after = forked.steps[index];

    if (before.prompt !== after.prompt) {
      changedSteps.add(index);
      changeLog.push({
        stepIndex: index,
        field: "prompt",
        before: summarize(before.prompt),
        after: summarize(after.prompt),
      });
    }

    if (before.output !== after.output) {
      changedSteps.add(index);
      changeLog.push({
        stepIndex: index,
        field: "output",
        before: summarize(before.output),
        after: summarize(after.output),
      });
    }

    if (before.command !== after.command) {
      changedSteps.add(index);
      changeLog.push({
        stepIndex: index,
        field: "command",
        before: summarize(before.command),
        after: summarize(after.command),
      });
    }

    if (before.toolCall?.name !== after.toolCall?.name) {
      changedSteps.add(index);
      changeLog.push({
        stepIndex: index,
        field: "toolCall.name",
        before: summarize(before.toolCall?.name),
        after: summarize(after.toolCall?.name),
      });
    }

    const beforeToolOutput = summarize(before.toolCall?.output);
    const afterToolOutput = summarize(after.toolCall?.output);
    if (beforeToolOutput !== afterToolOutput) {
      changedSteps.add(index);
      changeLog.push({
        stepIndex: index,
        field: "toolCall.output",
        before: beforeToolOutput,
        after: afterToolOutput,
      });
    }
  }

  if (forked.steps.length > original.steps.length) {
    for (let index = original.steps.length; index < forked.steps.length; index += 1) {
      addedSteps.push(index);
      changeLog.push({
        stepIndex: index,
        field: "step",
        after: summarize(forked.steps[index]),
      });
    }
  }

  return {
    changedSteps: [...changedSteps].sort((a, b) => a - b),
    addedSteps,
    changeLog,
  };
}

export function forkTrace(
  original: Trace,
  forkStepIndex: number,
  edits: TraceForkEdits
): { forkedTrace: Trace; diff: TraceDiff } {
  if (forkStepIndex < 0 || forkStepIndex >= original.steps.length) {
    throw new Error(`Invalid forkStepIndex ${forkStepIndex}. Trace has ${original.steps.length} step(s).`);
  }

  const seedSteps = structuredClone(original.steps.slice(0, forkStepIndex + 1));
  const editedStep = applyEdits(seedSteps[forkStepIndex], edits);
  seedSteps[forkStepIndex] = editedStep;

  const simulationStep: TraceStep = {
    index: seedSteps.length,
    timestamp: new Date().toISOString(),
    actor: "system",
    type: "system",
    output:
      edits.appendSimulationNote ??
      "Simulated replay after fork: downstream actions paused for safe review.",
    metadata: {
      replayMode: "dry-run",
      derivedFromTrace: original.id,
    },
    riskScore: 0,
    riskFlags: [],
    guardStatus: "pending",
  };

  const nextSteps = normalizeStepIndexes([...seedSteps, simulationStep]);
  const hasBlockedSteps = nextSteps.some((step) => step.guardStatus === "block");

  const forkedTrace: Trace = {
    ...structuredClone(original),
    id: randomUUID(),
    parentTraceId: original.id,
    forkedFromStep: forkStepIndex,
    source: "manual",
    status: hasBlockedSteps ? "quarantined" : "active",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {
      ...(original.metadata ?? {}),
      forkedAt: new Date().toISOString(),
      replayMode: "dry-run",
      edits,
    },
    steps: nextSteps,
  };

  const diff = buildDiff(original, forkedTrace);
  return { forkedTrace, diff };
}
