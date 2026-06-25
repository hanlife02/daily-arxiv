import { classifyLlmFailure, llmFailureActionHint, llmFailureLabel, type LlmFailureCategory } from "@/lib/llm/failure";

export { classifyLlmFailure, type LlmFailureCategory } from "@/lib/llm/failure";

export type LlmUsageLogInput = {
  userId?: string | null;
  endpoint: string;
  model: string;
  status: string;
  error?: string | null;
  promptChars: number;
  completionChars: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  usedPdfText: boolean;
  startedAt?: Date;
  finishedAt?: Date | null;
  createdAt: Date;
};

export type LlmModelCostRate = {
  promptUsdPerMillionTokens: number;
  completionUsdPerMillionTokens: number;
};

export type LlmUsageCostSettings = {
  charsPerToken: number;
  rates: Record<string, LlmModelCostRate>;
};

export type LlmUsageGroup = {
  key: string;
  label: string;
  calls: number;
  failed: number;
  failureRate: number;
  promptChars: number;
  completionChars: number;
  totalChars: number;
  pdfCalls: number;
  durationSamples: number;
  averageDurationMs: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  measuredTokenCalls: number;
  measuredPromptTokens: number;
  measuredCompletionTokens: number;
  measuredTotalTokens: number;
  estimatedCostUsd: number;
};

export type LlmUsageWindow = {
  days: number;
  calls: number;
  failed: number;
  succeeded: number;
  running: number;
  failureRate: number;
  promptChars: number;
  completionChars: number;
  totalChars: number;
  pdfCalls: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  measuredTokenCalls: number;
  measuredPromptTokens: number;
  measuredCompletionTokens: number;
  measuredTotalTokens: number;
  estimatedCostUsd: number;
  byEndpoint: LlmUsageGroup[];
  byModel: LlmUsageGroup[];
  byUser: LlmUsageGroup[];
};

export type LlmUsageTrendDay = {
  day: string;
  calls: number;
  failed: number;
  succeeded: number;
  running: number;
  failureRate: number;
  promptChars: number;
  completionChars: number;
  totalChars: number;
  pdfCalls: number;
  averageDurationMs: number;
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  measuredTokenCalls: number;
  measuredPromptTokens: number;
  measuredCompletionTokens: number;
  measuredTotalTokens: number;
  estimatedCostUsd: number;
};

export type LlmFailureDiagnostic = {
  category: LlmFailureCategory;
  label: string;
  count: number;
  lastAt?: Date;
  lastModel?: string;
  lastEndpoint?: string;
  lastError?: string | null;
  actionHint: string;
};

export type LlmUsageSummary = {
  windows: LlmUsageWindow[];
  trend: LlmUsageTrendDay[];
  costEstimate: {
    configured: boolean;
    charsPerToken: number;
    pricedModels: string[];
    unpricedModels: string[];
  };
  insights: {
    days: number;
    highFailureModels: LlmUsageGroup[];
    highLatencyEndpoints: LlmUsageGroup[];
    highUsageUsers: LlmUsageGroup[];
    failureDiagnostics: LlmFailureDiagnostic[];
  };
};

function roundedUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function tokenValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function estimateRowCost(row: LlmUsageLogInput, settings: LlmUsageCostSettings) {
  const rate = settings.rates[row.model];
  const measuredPromptTokens = tokenValue(row.promptTokens);
  const measuredCompletionTokens = tokenValue(row.completionTokens);
  const measuredTotalTokens = tokenValue(row.totalTokens)
    ?? (measuredPromptTokens !== undefined || measuredCompletionTokens !== undefined
      ? (measuredPromptTokens ?? 0) + (measuredCompletionTokens ?? 0)
      : undefined);
  const estimatedPromptTokens = measuredPromptTokens ?? Math.ceil(row.promptChars / settings.charsPerToken);
  const estimatedCompletionTokens = measuredCompletionTokens ?? Math.ceil(row.completionChars / settings.charsPerToken);
  const estimatedCostUsd = rate
    ? estimatedPromptTokens * rate.promptUsdPerMillionTokens / 1_000_000
      + estimatedCompletionTokens * rate.completionUsdPerMillionTokens / 1_000_000
    : 0;
  return {
    estimatedPromptTokens,
    estimatedCompletionTokens,
    measuredTokenCalls: measuredPromptTokens !== undefined || measuredCompletionTokens !== undefined || measuredTotalTokens !== undefined ? 1 : 0,
    measuredPromptTokens: measuredPromptTokens ?? 0,
    measuredCompletionTokens: measuredCompletionTokens ?? 0,
    measuredTotalTokens: measuredTotalTokens ?? 0,
    estimatedCostUsd
  };
}

function emptyGroup(key: string, label = key): LlmUsageGroup {
  return {
    key,
    label,
    calls: 0,
    failed: 0,
    failureRate: 0,
    promptChars: 0,
    completionChars: 0,
    totalChars: 0,
    pdfCalls: 0,
    durationSamples: 0,
    averageDurationMs: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
    measuredTokenCalls: 0,
    measuredPromptTokens: 0,
    measuredCompletionTokens: 0,
    measuredTotalTokens: 0,
    estimatedCostUsd: 0
  };
}

function addToGroup(group: LlmUsageGroup, row: LlmUsageLogInput, costSettings: LlmUsageCostSettings) {
  group.calls += 1;
  if (row.status === "failed") group.failed += 1;
  group.promptChars += row.promptChars;
  group.completionChars += row.completionChars;
  group.totalChars = group.promptChars + group.completionChars;
  if (row.usedPdfText) group.pdfCalls += 1;
  const cost = estimateRowCost(row, costSettings);
  group.estimatedPromptTokens += cost.estimatedPromptTokens;
  group.estimatedCompletionTokens += cost.estimatedCompletionTokens;
  group.measuredTokenCalls += cost.measuredTokenCalls;
  group.measuredPromptTokens += cost.measuredPromptTokens;
  group.measuredCompletionTokens += cost.measuredCompletionTokens;
  group.measuredTotalTokens += cost.measuredTotalTokens;
  group.estimatedCostUsd = roundedUsd(group.estimatedCostUsd + cost.estimatedCostUsd);
  if (row.startedAt && row.finishedAt && row.finishedAt >= row.startedAt) {
    group.averageDurationMs = Math.round(
      (group.averageDurationMs * group.durationSamples + row.finishedAt.getTime() - row.startedAt.getTime()) /
        (group.durationSamples + 1)
    );
    group.durationSamples += 1;
  }
  group.failureRate = group.calls > 0 ? group.failed / group.calls : 0;
}

function sortedGroups(groups: Map<string, LlmUsageGroup>, limit = 6) {
  return [...groups.values()]
    .sort((a, b) => b.calls - a.calls || b.totalChars - a.totalChars || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function sortByFailure(groups: LlmUsageGroup[], limit = 3) {
  return groups
    .filter((group) => group.failed > 0)
    .sort((a, b) => b.failureRate - a.failureRate || b.failed - a.failed || b.calls - a.calls || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function sortByLatency(groups: LlmUsageGroup[], limit = 3) {
  return groups
    .filter((group) => group.durationSamples > 0)
    .sort((a, b) => b.averageDurationMs - a.averageDurationMs || b.calls - a.calls || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function sortByUsage(groups: LlmUsageGroup[], limit = 3) {
  return groups
    .filter((group) => group.totalChars > 0)
    .sort((a, b) => b.totalChars - a.totalChars || b.calls - a.calls || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function summarizeFailureDiagnostics(rows: LlmUsageLogInput[], days: number, now: Date, limit = 6): LlmFailureDiagnostic[] {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const diagnostics = new Map<LlmFailureCategory, LlmFailureDiagnostic>();

  for (const row of rows) {
    if (row.createdAt < since || row.createdAt > now || row.status !== "failed") continue;
    const category = classifyLlmFailure(row.error);
    const previous = diagnostics.get(category);
    if (!previous || row.createdAt > (previous.lastAt ?? new Date(0))) {
      diagnostics.set(category, {
        category,
        label: llmFailureLabel(category),
        count: (previous?.count ?? 0) + 1,
        lastAt: row.createdAt,
        lastModel: row.model,
        lastEndpoint: row.endpoint,
        lastError: row.error,
        actionHint: llmFailureActionHint(category)
      });
    } else {
      previous.count += 1;
    }
  }

  return [...diagnostics.values()]
    .sort((a, b) => b.count - a.count || (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function summarizeWindow(
  rows: LlmUsageLogInput[],
  days: number,
  now: Date,
  userLabels: Record<string, string> = {},
  costSettings: LlmUsageCostSettings
): LlmUsageWindow {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const scoped = rows.filter((row) => row.createdAt >= since && row.createdAt <= now);
  const byEndpoint = new Map<string, LlmUsageGroup>();
  const byModel = new Map<string, LlmUsageGroup>();
  const byUser = new Map<string, LlmUsageGroup>();

  let failed = 0;
  let succeeded = 0;
  let running = 0;
  let promptChars = 0;
  let completionChars = 0;
  let pdfCalls = 0;
  let estimatedPromptTokens = 0;
  let estimatedCompletionTokens = 0;
  let measuredTokenCalls = 0;
  let measuredPromptTokens = 0;
  let measuredCompletionTokens = 0;
  let measuredTotalTokens = 0;
  let estimatedCostUsd = 0;

  for (const row of scoped) {
    if (row.status === "failed") failed += 1;
    else if (row.status === "succeeded") succeeded += 1;
    else running += 1;
    promptChars += row.promptChars;
    completionChars += row.completionChars;
    if (row.usedPdfText) pdfCalls += 1;
    const cost = estimateRowCost(row, costSettings);
    estimatedPromptTokens += cost.estimatedPromptTokens;
    estimatedCompletionTokens += cost.estimatedCompletionTokens;
    measuredTokenCalls += cost.measuredTokenCalls;
    measuredPromptTokens += cost.measuredPromptTokens;
    measuredCompletionTokens += cost.measuredCompletionTokens;
    measuredTotalTokens += cost.measuredTotalTokens;
    estimatedCostUsd += cost.estimatedCostUsd;

    const endpointGroup = byEndpoint.get(row.endpoint) ?? emptyGroup(row.endpoint);
    addToGroup(endpointGroup, row, costSettings);
    byEndpoint.set(row.endpoint, endpointGroup);

    const modelGroup = byModel.get(row.model) ?? emptyGroup(row.model);
    addToGroup(modelGroup, row, costSettings);
    byModel.set(row.model, modelGroup);

    const userKey = row.userId ?? "system";
    const userGroup = byUser.get(userKey) ?? emptyGroup(userKey, userLabels[userKey] ?? userKey);
    addToGroup(userGroup, row, costSettings);
    byUser.set(userKey, userGroup);
  }

  const calls = scoped.length;
  const totalChars = promptChars + completionChars;
  return {
    days,
    calls,
    failed,
    succeeded,
    running,
    failureRate: calls > 0 ? failed / calls : 0,
    promptChars,
    completionChars,
    totalChars,
    pdfCalls,
    estimatedPromptTokens,
    estimatedCompletionTokens,
    measuredTokenCalls,
    measuredPromptTokens,
    measuredCompletionTokens,
    measuredTotalTokens,
    estimatedCostUsd: roundedUsd(estimatedCostUsd),
    byEndpoint: sortedGroups(byEndpoint),
    byModel: sortedGroups(byModel),
    byUser: sortedGroups(byUser)
  };
}

function utcDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastUtcDayKeys(days: number, now: Date) {
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(anchor);
    day.setUTCDate(anchor.getUTCDate() - (days - 1 - index));
    return utcDayKey(day);
  });
}

function emptyTrendDay(day: string): LlmUsageTrendDay & { durationSamples: number } {
  return {
    day,
    calls: 0,
    failed: 0,
    succeeded: 0,
    running: 0,
    failureRate: 0,
    promptChars: 0,
    completionChars: 0,
    totalChars: 0,
    pdfCalls: 0,
    averageDurationMs: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
    measuredTokenCalls: 0,
    measuredPromptTokens: 0,
    measuredCompletionTokens: 0,
    measuredTotalTokens: 0,
    estimatedCostUsd: 0,
    durationSamples: 0
  };
}

function summarizeTrend(rows: LlmUsageLogInput[], days: number, now: Date, costSettings: LlmUsageCostSettings): LlmUsageTrendDay[] {
  const dayKeys = lastUtcDayKeys(days, now);
  const buckets = new Map(dayKeys.map((day) => [day, emptyTrendDay(day)]));
  const start = new Date(`${dayKeys[0]}T00:00:00.000Z`);

  for (const row of rows) {
    if (row.createdAt < start || row.createdAt > now) continue;
    const bucket = buckets.get(utcDayKey(row.createdAt));
    if (!bucket) continue;

    bucket.calls += 1;
    if (row.status === "failed") bucket.failed += 1;
    else if (row.status === "succeeded") bucket.succeeded += 1;
    else bucket.running += 1;
    bucket.promptChars += row.promptChars;
    bucket.completionChars += row.completionChars;
    bucket.totalChars = bucket.promptChars + bucket.completionChars;
    if (row.usedPdfText) bucket.pdfCalls += 1;
    const cost = estimateRowCost(row, costSettings);
    bucket.estimatedPromptTokens += cost.estimatedPromptTokens;
    bucket.estimatedCompletionTokens += cost.estimatedCompletionTokens;
    bucket.measuredTokenCalls += cost.measuredTokenCalls;
    bucket.measuredPromptTokens += cost.measuredPromptTokens;
    bucket.measuredCompletionTokens += cost.measuredCompletionTokens;
    bucket.measuredTotalTokens += cost.measuredTotalTokens;
    bucket.estimatedCostUsd += cost.estimatedCostUsd;
    if (row.startedAt && row.finishedAt && row.finishedAt >= row.startedAt) {
      bucket.averageDurationMs += row.finishedAt.getTime() - row.startedAt.getTime();
      bucket.durationSamples += 1;
    }
    bucket.failureRate = bucket.calls > 0 ? bucket.failed / bucket.calls : 0;
  }

  return dayKeys.map((day) => {
    const bucket = buckets.get(day) ?? emptyTrendDay(day);
    return {
      day: bucket.day,
      calls: bucket.calls,
      failed: bucket.failed,
      succeeded: bucket.succeeded,
      running: bucket.running,
      failureRate: bucket.failureRate,
      promptChars: bucket.promptChars,
      completionChars: bucket.completionChars,
      totalChars: bucket.totalChars,
      pdfCalls: bucket.pdfCalls,
      averageDurationMs: bucket.durationSamples > 0 ? Math.round(bucket.averageDurationMs / bucket.durationSamples) : 0,
      estimatedPromptTokens: bucket.estimatedPromptTokens,
      estimatedCompletionTokens: bucket.estimatedCompletionTokens,
      measuredTokenCalls: bucket.measuredTokenCalls,
      measuredPromptTokens: bucket.measuredPromptTokens,
      measuredCompletionTokens: bucket.measuredCompletionTokens,
      measuredTotalTokens: bucket.measuredTotalTokens,
      estimatedCostUsd: roundedUsd(bucket.estimatedCostUsd)
    };
  });
}

function summarizeInsights(
  rows: LlmUsageLogInput[],
  days: number,
  now: Date,
  userLabels: Record<string, string> = {},
  costSettings: LlmUsageCostSettings
) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const byEndpoint = new Map<string, LlmUsageGroup>();
  const byModel = new Map<string, LlmUsageGroup>();
  const byUser = new Map<string, LlmUsageGroup>();

  for (const row of rows) {
    if (row.createdAt < since || row.createdAt > now) continue;

    const endpointGroup = byEndpoint.get(row.endpoint) ?? emptyGroup(row.endpoint);
    addToGroup(endpointGroup, row, costSettings);
    byEndpoint.set(row.endpoint, endpointGroup);

    const modelGroup = byModel.get(row.model) ?? emptyGroup(row.model);
    addToGroup(modelGroup, row, costSettings);
    byModel.set(row.model, modelGroup);

    const userKey = row.userId ?? "system";
    const userGroup = byUser.get(userKey) ?? emptyGroup(userKey, userLabels[userKey] ?? userKey);
    addToGroup(userGroup, row, costSettings);
    byUser.set(userKey, userGroup);
  }

  return {
    days,
    highFailureModels: sortByFailure([...byModel.values()]),
    highLatencyEndpoints: sortByLatency([...byEndpoint.values()]),
    highUsageUsers: sortByUsage([...byUser.values()]),
    failureDiagnostics: summarizeFailureDiagnostics(rows, days, now)
  };
}

export function summarizeLlmUsage(
  rows: LlmUsageLogInput[],
  options: {
    now?: Date;
    windows?: number[];
    trendDays?: number;
    insightDays?: number;
    userLabels?: Record<string, string>;
    costSettings?: Partial<LlmUsageCostSettings>;
  } = {}
): LlmUsageSummary {
  const now = options.now ?? new Date();
  const windows = options.windows ?? [7, 30];
  const trendDays = options.trendDays ?? 30;
  const insightDays = options.insightDays ?? 30;
  const costSettings = {
    charsPerToken: options.costSettings?.charsPerToken && options.costSettings.charsPerToken > 0
      ? options.costSettings.charsPerToken
      : 4,
    rates: options.costSettings?.rates ?? {}
  };
  const pricedModels = Object.keys(costSettings.rates).sort();
  const usedModels = [...new Set(rows.map((row) => row.model))].sort();
  return {
    windows: windows.map((days) => summarizeWindow(rows, days, now, options.userLabels, costSettings)),
    trend: summarizeTrend(rows, trendDays, now, costSettings),
    costEstimate: {
      configured: pricedModels.length > 0,
      charsPerToken: costSettings.charsPerToken,
      pricedModels,
      unpricedModels: usedModels.filter((model) => !costSettings.rates[model])
    },
    insights: summarizeInsights(rows, insightDays, now, options.userLabels, costSettings)
  };
}
