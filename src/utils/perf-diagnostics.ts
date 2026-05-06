import type { ScanScope } from "@/core/injection/scan-scope";

const MAX_EVENTS = 80;
const MAX_SUMMARIES = 80;
const MAX_QUERY_EVENTS = 240;
const QUERY_RETENTION_MS = 30_000;
const LONG_TASK_CORRELATION_PADDING_MS = 100;

export const PERF_DIAGNOSTIC_THRESHOLDS = {
  slowRuleScanMs: 16,
  slowRuleApplyMs: 8,
  slowFlowMs: 50,
} as const;

export interface RuleScanDiagnostic {
  id: number;
  time: number;
  ruleName: string;
  mode: string;
  selector: string;
  scopeType: string;
  matchCount: number;
  queryMs: number;
  totalMs: number;
  slow: boolean;
}

export interface RuleApplyDiagnostic {
  id: number;
  time: number;
  ruleName: string;
  mode: string;
  element: string;
  uidResolved: boolean;
  applied: boolean;
  totalMs: number;
  slow: boolean;
}

export interface FlowDiagnostic {
  id: number;
  time: number;
  source: string;
  ruleName?: string;
  mode?: string;
  scopeType?: string;
  ruleCount?: number;
  durationMs: number;
  chunked: boolean;
  slow: boolean;
}

export interface LongTaskDiagnostic {
  id: number;
  time: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  relatedFlow: string;
  relatedKind: "flow" | "query" | "scan" | "apply" | "unrelated";
  relatedDeltaMs?: number;
}

export interface QueryDiagnostic {
  id: number;
  time: number;
  kind: "one" | "all";
  selector: string;
  caller: string;
  scopeType: string;
  matchCount: number;
  durationMs: number;
  slow: boolean;
  error?: string;
}

export interface RulePerfSummary {
  id: string;
  ruleName: string;
  mode: string;
  selector: string;
  matchCount: number;
  scanMs: number;
  queryMs: number;
  applyCount: number;
  applyMs: number;
  lastSeen: number;
  slow: boolean;
}

export interface PerfDiagnosticsSnapshot {
  thresholds: typeof PERF_DIAGNOSTIC_THRESHOLDS;
  queryRetentionMs: number;
  slowRules: RulePerfSummary[];
  recentScans: RuleScanDiagnostic[];
  recentApplications: RuleApplyDiagnostic[];
  recentFlows: FlowDiagnostic[];
  longTasks: LongTaskDiagnostic[];
  recentQueries: QueryDiagnostic[];
  slowQueries: QueryDiagnostic[];
}

let nextId = 1;
const ruleSummaries = new Map<string, RulePerfSummary>();
const recentScans: RuleScanDiagnostic[] = [];
const recentApplications: RuleApplyDiagnostic[] = [];
const recentFlows: FlowDiagnostic[] = [];
const longTasks: LongTaskDiagnostic[] = [];
const recentQueries: QueryDiagnostic[] = [];

function pushBounded<T>(target: T[], item: T) {
  target.unshift(item);
  if (target.length > MAX_EVENTS) {
    target.length = MAX_EVENTS;
  }
}

function pushQueryEvent(item: QueryDiagnostic) {
  recentQueries.unshift(item);
  pruneQueryEvents();
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

function ruleKey(ruleName: string, mode: string) {
  return `${mode}:${ruleName}`;
}

function modeLabel(mode: number | string) {
  switch (mode) {
    case 1:
      return "Static";
    case 2:
      return "Dynamic";
    default:
      return String(mode);
  }
}

export function getScopeType(scope: ScanScope): string {
  if (scope === document) return "document";
  // ShadowRoot 没有 tagName，HTMLElement 有 tagName
  return "tagName" in scope ? scope.tagName.toLowerCase() : "shadow";
}

export function describeElementForDiagnostics(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classNames = Array.from(element.classList).slice(0, 2);
  const classText = classNames.length > 0 ? `.${classNames.join(".")}` : "";
  return `${tag}${id}${classText}`;
}

export function recordRuleScanDiagnostic(input: {
  ruleName: string;
  mode: number;
  selector: string;
  scopeType: string;
  matchCount: number;
  queryMs: number;
  totalMs: number;
}) {
  if (!__IS_DEBUG__) return;

  const mode = modeLabel(input.mode);
  const scanMs = roundMs(input.totalMs);
  const queryMs = roundMs(input.queryMs);
  const slow = scanMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowRuleScanMs;
  const event: RuleScanDiagnostic = {
    id: nextId++,
    time: Date.now(),
    ruleName: input.ruleName,
    mode,
    selector: input.selector,
    scopeType: input.scopeType,
    matchCount: input.matchCount,
    queryMs,
    totalMs: scanMs,
    slow,
  };
  pushBounded(recentScans, event);

  const key = ruleKey(input.ruleName, mode);
  const summary: RulePerfSummary = {
    id: key,
    ruleName: input.ruleName,
    mode,
    selector: input.selector,
    matchCount: input.matchCount,
    scanMs,
    queryMs,
    applyCount: 0,
    applyMs: 0,
    lastSeen: event.time,
    slow,
  };
  ruleSummaries.set(key, summary);
  trimSummaries();
}

export function recordRuleApplyDiagnostic(input: {
  ruleName: string;
  mode: number;
  element: string;
  uidResolved: boolean;
  applied: boolean;
  totalMs: number;
}) {
  if (!__IS_DEBUG__) return;

  const mode = modeLabel(input.mode);
  const totalMs = roundMs(input.totalMs);
  const slow = totalMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowRuleApplyMs;
  const event: RuleApplyDiagnostic = {
    id: nextId++,
    time: Date.now(),
    ruleName: input.ruleName,
    mode,
    element: input.element,
    uidResolved: input.uidResolved,
    applied: input.applied,
    totalMs,
    slow,
  };
  pushBounded(recentApplications, event);

  const key = ruleKey(input.ruleName, mode);
  const summary = ruleSummaries.get(key);
  if (summary) {
    summary.applyCount += 1;
    summary.applyMs = roundMs(summary.applyMs + totalMs);
    summary.lastSeen = event.time;
    summary.slow =
      summary.slow ||
      slow ||
      summary.applyMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowFlowMs;
  }
}

export function recordFlowDiagnostic(input: {
  source: string;
  ruleName?: string;
  mode?: number | string;
  scopeType?: string;
  ruleCount?: number;
  durationMs?: number;
  chunked?: boolean;
}) {
  if (!__IS_DEBUG__) return;

  const durationMs = roundMs(input.durationMs ?? 0);
  const event: FlowDiagnostic = {
    id: nextId++,
    time: Date.now(),
    source: input.source,
    ruleName: input.ruleName,
    mode: input.mode === undefined ? undefined : modeLabel(input.mode),
    scopeType: input.scopeType,
    ruleCount: input.ruleCount,
    durationMs,
    chunked: Boolean(input.chunked),
    slow: durationMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowFlowMs,
  };
  pushBounded(recentFlows, event);
}

export function recordLongTaskDiagnostic(durationMs: number, startTime?: number) {
  if (!__IS_DEBUG__) return;

  const startWallTime =
    startTime === undefined
      ? Date.now() - durationMs
      : Math.round(performance.timeOrigin + startTime);
  const endWallTime = Math.round(startWallTime + durationMs);
  const related = findLongTaskRelation(startWallTime, endWallTime);
  pushBounded(longTasks, {
    id: nextId++,
    time: endWallTime,
    startTime: startWallTime,
    endTime: endWallTime,
    durationMs: roundMs(durationMs),
    relatedFlow: related.label,
    relatedKind: related.kind,
    relatedDeltaMs: related.deltaMs,
  });
}

export function recordQueryDiagnostic(input: {
  kind: "one" | "all";
  selector: string;
  caller: string | undefined;
  matchCount: number;
  durationMs: number;
  scopeType?: string;
  error?: string;
}) {
  if (!__IS_DEBUG__) return;

  const durationMs = roundMs(input.durationMs);
  pushQueryEvent({
    id: nextId++,
    time: Date.now(),
    kind: input.kind,
    selector: input.selector,
    caller: input.caller || "unknown caller",
    scopeType: input.scopeType || "document",
    matchCount: input.matchCount,
    durationMs,
    slow:
      durationMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowRuleScanMs ||
      Boolean(input.error),
    error: input.error,
  });
}

export function getPerfDiagnosticsSnapshot(): PerfDiagnosticsSnapshot {
  pruneQueryEvents();
  const slowRules = Array.from(ruleSummaries.values())
    .filter((summary) => summary.slow)
    .sort((a, b) => {
      const aTotal = a.scanMs + a.applyMs;
      const bTotal = b.scanMs + b.applyMs;
      return bTotal - aTotal;
    })
    .slice(0, 20);

  return {
    thresholds: PERF_DIAGNOSTIC_THRESHOLDS,
    queryRetentionMs: QUERY_RETENTION_MS,
    slowRules,
    recentScans: [...recentScans],
    recentApplications: [...recentApplications],
    recentFlows: [...recentFlows],
    longTasks: [...longTasks],
    recentQueries: [...recentQueries],
    slowQueries: [...recentQueries]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 20),
  };
}

function pruneQueryEvents() {
  const cutoff = Date.now() - QUERY_RETENTION_MS;
  let nextLength = recentQueries.length;
  while (
    nextLength > 0 &&
    (nextLength > MAX_QUERY_EVENTS || recentQueries[nextLength - 1].time < cutoff)
  ) {
    nextLength -= 1;
  }
  recentQueries.length = nextLength;
}

function formatFlowLabel(flow: FlowDiagnostic) {
  const parts = [flow.source];
  if (flow.ruleName) parts.push(flow.ruleName);
  if (flow.durationMs > 0) parts.push(`${flow.durationMs}ms`);
  return parts.join(" -> ");
}

function findLongTaskRelation(startTime: number, endTime: number): {
  kind: LongTaskDiagnostic["relatedKind"];
  label: string;
  deltaMs?: number;
} {
  const candidates: Array<{
    kind: LongTaskDiagnostic["relatedKind"];
    label: string;
    time: number;
    durationMs: number;
  }> = [
    ...recentFlows
      .filter((flow) => flow.durationMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowFlowMs)
      .map((flow) => ({
        kind: "flow" as const,
        label: formatFlowLabel(flow),
        time: flow.time,
        durationMs: flow.durationMs,
      })),
    ...recentQueries
      .filter(
        (query) =>
          query.durationMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowRuleScanMs ||
          Boolean(query.error),
      )
      .map((query) => ({
        kind: "query" as const,
        label: formatQueryLabel(query),
        time: query.time,
        durationMs: query.durationMs,
      })),
    ...recentScans
      .filter((scan) => scan.totalMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowRuleScanMs)
      .map((scan) => ({
        kind: "scan" as const,
        label: `${scan.ruleName} scan -> ${scan.totalMs}ms / ${scan.matchCount} hits`,
        time: scan.time,
        durationMs: scan.totalMs,
      })),
    ...recentApplications
      .filter(
        (apply) => apply.totalMs >= PERF_DIAGNOSTIC_THRESHOLDS.slowRuleApplyMs,
      )
      .map((apply) => ({
        kind: "apply" as const,
        label: `${apply.ruleName} apply -> ${apply.totalMs}ms / ${apply.element}`,
        time: apply.time,
        durationMs: apply.totalMs,
      })),
  ];

  const nearest = candidates
    .map((candidate) => ({
      ...candidate,
      deltaMs: getDistanceToLongTask(candidate.time, startTime, endTime),
    }))
    .filter((candidate) => candidate.deltaMs <= LONG_TASK_CORRELATION_PADDING_MS)
    .sort((a, b) => {
      if (a.deltaMs !== b.deltaMs) return a.deltaMs - b.deltaMs;
      return b.durationMs - a.durationMs;
    })[0];

  if (!nearest) {
    return {
      kind: "unrelated",
      label:
        "likely unrelated: no slow rule/query/app event near this long task",
    };
  }

  return {
    kind: nearest.kind,
    label: nearest.label,
    deltaMs: nearest.deltaMs,
  };
}

function getDistanceToLongTask(
  eventTime: number,
  startTime: number,
  endTime: number,
) {
  if (eventTime >= startTime && eventTime <= endTime) return 0;
  if (eventTime < startTime) return startTime - eventTime;
  return eventTime - endTime;
}

function formatQueryLabel(query: QueryDiagnostic) {
  const suffix = query.error ? ` / ${query.error}` : "";
  return `query ${query.kind} -> ${query.durationMs}ms / ${query.matchCount} hits / ${query.caller}${suffix}`;
}

function trimSummaries() {
  if (ruleSummaries.size <= MAX_SUMMARIES) return;

  const stale = Array.from(ruleSummaries.values()).sort(
    (a, b) => a.lastSeen - b.lastSeen,
  );
  for (const summary of stale.slice(0, ruleSummaries.size - MAX_SUMMARIES)) {
    ruleSummaries.delete(summary.id);
  }
}
