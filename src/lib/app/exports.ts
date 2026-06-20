import { normalizeAllowedEmailDomain } from "@/lib/users/registration";

type TimestampValue = Date | string | null | undefined;

type UserExportInput = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  };
  preference?: {
    categories: string[];
    includeKeywords: string[];
    excludeKeywords: string[];
    categoryWeights: Record<string, number>;
    topN: number;
    sendTime: string;
    timezone: string;
    summaryFocus: string | null;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  } | null;
  llmConfig?: {
    baseUrl: string;
    model: string;
    encryptedApiKey: string;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  } | null;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    from: string;
    username: string | null;
    encryptedPassword: string | null;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  } | null;
  reports: Array<{
    id: string;
    batchDate: string;
    status: string;
    emailStatus: string;
    reason: string | null;
    latestVersion: number;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  }>;
  reportVersions: Array<{
    reportId: string;
    version: number;
    selectedPaperIds: string[];
    markdown: string;
    model: string | null;
    promptVersion: string;
    createdAt: TimestampValue;
  }>;
  paperStates: Array<{
    paperId: string;
    favorited: boolean;
    read: boolean;
    ignored: boolean;
    recommendedAt: TimestampValue;
    updatedAt: TimestampValue;
    paper?: {
      arxivId: string;
      title: string;
      authors: string[];
      categories: string[];
      primaryCategory: string;
      arxivUrl: string;
      pdfUrl: string | null;
      publishedAt: TimestampValue;
      updatedAt: TimestampValue;
    } | null;
  }>;
};

type AdminExportInput = {
  admin: {
    id: string;
    email: string;
  };
  settings: {
    notificationFallbackEnabled: boolean;
    dailyEmailLimit: number;
    emailRetryCount: number;
    arxivMaxResultsPerCategory: number;
    manualLlmCallsPerUserPerDay: number;
    concurrentManualLlmCallsPerUser: number;
    userRoleManualLlmCallsPerUserPerDay: number | null;
    userRoleConcurrentManualLlmCallsPerUser: number | null;
    adminRoleManualLlmCallsPerUserPerDay: number | null;
    adminRoleConcurrentManualLlmCallsPerUser: number | null;
    logRetentionDays: number;
    pdfTextRetentionDays: number;
    backupRetentionDays: number;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  };
  notificationSmtp?: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    from: string;
    username: string | null;
    encryptedPassword: string | null;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  } | null;
  allowedEmailDomains: Array<{
    id: string;
    domain: string;
    enabled: boolean;
    createdAt: TimestampValue;
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    emailVerified: boolean;
    disabled: boolean;
    notificationDisabled: boolean;
    manualLlmCallsPerUserPerDayOverride: number | null;
    concurrentManualLlmCallsPerUserOverride: number | null;
    createdAt: TimestampValue;
    updatedAt: TimestampValue;
  }>;
};

type PortableUserPreference = {
  categories: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  categoryWeights: Record<string, number>;
  topN: number;
  sendTime: string;
  timezone: string;
  summaryFocus: string | null;
};

type PortableReadingState = {
  paperId: string;
  favorited: boolean;
  read: boolean;
  ignored: boolean;
  recommendedAt: Date | null;
};

export type UserPortableImportPlan = {
  version: "daily-arxiv-user-export-v1";
  preference: PortableUserPreference | null;
  readingStates: PortableReadingState[];
  ignoredSections: string[];
};

type PortableAdminSettings = {
  notificationFallbackEnabled: boolean;
  dailyEmailLimit: number;
  emailRetryCount: number;
  arxivMaxResultsPerCategory: number;
  manualLlmCallsPerUserPerDay: number;
  concurrentManualLlmCallsPerUser: number;
  userRoleManualLlmCallsPerUserPerDay: number | null;
  userRoleConcurrentManualLlmCallsPerUser: number | null;
  adminRoleManualLlmCallsPerUserPerDay: number | null;
  adminRoleConcurrentManualLlmCallsPerUser: number | null;
  logRetentionDays: number;
  pdfTextRetentionDays: number;
  backupRetentionDays: number;
};

type PortableAllowedDomain = {
  domain: string;
  enabled: boolean;
};

type PortableAdminUserState = {
  email: string;
  notificationDisabled: boolean;
  manualLlmCallsPerUserPerDayOverride: number | null;
  concurrentManualLlmCallsPerUserOverride: number | null;
};

export type AdminPortableImportPlan = {
  version: "daily-arxiv-admin-export-v1";
  settings: PortableAdminSettings | null;
  allowedEmailDomains: PortableAllowedDomain[];
  users: PortableAdminUserState[];
  ignoredSections: string[];
};

function iso(value: TimestampValue) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function groupVersionsByReport(reportVersions: UserExportInput["reportVersions"]) {
  const grouped = new Map<string, UserExportInput["reportVersions"]>();
  for (const version of reportVersions) {
    const current = grouped.get(version.reportId) ?? [];
    current.push(version);
    grouped.set(version.reportId, current);
  }
  for (const versions of grouped.values()) {
    versions.sort((a, b) => a.version - b.version);
  }
  return grouped;
}

export function buildUserPortableExport(input: UserExportInput, exportedAt = new Date()) {
  const versionsByReport = groupVersionsByReport(input.reportVersions);
  const readingStates = input.paperStates.map((state) => ({
    paperId: state.paperId,
    favorited: state.favorited,
    read: state.read,
    ignored: state.ignored,
    recommendedAt: iso(state.recommendedAt),
    updatedAt: iso(state.updatedAt),
    paper: state.paper
      ? {
          arxivId: state.paper.arxivId,
          title: state.paper.title,
          authors: state.paper.authors,
          categories: state.paper.categories,
          primaryCategory: state.paper.primaryCategory,
          arxivUrl: state.paper.arxivUrl,
          pdfUrl: state.paper.pdfUrl,
          publishedAt: iso(state.paper.publishedAt),
          updatedAt: iso(state.paper.updatedAt)
        }
      : null
  }));

  return {
    version: "daily-arxiv-user-export-v1",
    exportedAt: exportedAt.toISOString(),
    scope: "portable-user-data",
    note: "This export intentionally excludes API keys, SMTP passwords, encrypted secrets, sessions, and account credentials. Full service recovery still requires database backups plus FIELD_ENCRYPTION_KEY.",
    user: {
      id: input.user.id,
      name: input.user.name,
      email: input.user.email,
      role: input.user.role,
      createdAt: iso(input.user.createdAt),
      updatedAt: iso(input.user.updatedAt)
    },
    preference: input.preference
      ? {
          categories: input.preference.categories,
          categoryWeights: input.preference.categoryWeights,
          includeKeywords: input.preference.includeKeywords,
          excludeKeywords: input.preference.excludeKeywords,
          topN: input.preference.topN,
          sendTime: input.preference.sendTime,
          timezone: input.preference.timezone,
          summaryFocus: input.preference.summaryFocus,
          createdAt: iso(input.preference.createdAt),
          updatedAt: iso(input.preference.updatedAt)
        }
      : null,
    llmConfig: input.llmConfig
      ? {
          baseUrl: input.llmConfig.baseUrl,
          model: input.llmConfig.model,
          hasApiKey: Boolean(input.llmConfig.encryptedApiKey),
          createdAt: iso(input.llmConfig.createdAt),
          updatedAt: iso(input.llmConfig.updatedAt)
        }
      : null,
    smtpConfig: input.smtpConfig
      ? {
          host: input.smtpConfig.host,
          port: input.smtpConfig.port,
          secure: input.smtpConfig.secure,
          from: input.smtpConfig.from,
          username: input.smtpConfig.username,
          hasPassword: Boolean(input.smtpConfig.encryptedPassword),
          createdAt: iso(input.smtpConfig.createdAt),
          updatedAt: iso(input.smtpConfig.updatedAt)
        }
      : null,
    reports: input.reports.map((report) => ({
      id: report.id,
      batchDate: report.batchDate,
      status: report.status,
      emailStatus: report.emailStatus,
      reason: report.reason,
      latestVersion: report.latestVersion,
      createdAt: iso(report.createdAt),
      updatedAt: iso(report.updatedAt),
      versions: (versionsByReport.get(report.id) ?? []).map((version) => ({
        version: version.version,
        selectedPaperIds: version.selectedPaperIds,
        markdown: version.markdown,
        model: version.model,
        promptVersion: version.promptVersion,
        createdAt: iso(version.createdAt)
      }))
    })),
    favorites: readingStates.filter((state) => state.favorited),
    readingStates
  };
}

export function buildAdminPortableExport(input: AdminExportInput, exportedAt = new Date()) {
  return {
    version: "daily-arxiv-admin-export-v1",
    exportedAt: exportedAt.toISOString(),
    scope: "portable-admin-configuration",
    note: "This export intentionally excludes SMTP passwords, encrypted secrets, sessions, account credentials, report bodies, and paper cache. Full service recovery still requires database backups plus FIELD_ENCRYPTION_KEY.",
    exportedBy: {
      id: input.admin.id,
      email: input.admin.email
    },
    settings: {
      notificationFallbackEnabled: input.settings.notificationFallbackEnabled,
      dailyEmailLimit: input.settings.dailyEmailLimit,
      emailRetryCount: input.settings.emailRetryCount,
      arxivMaxResultsPerCategory: input.settings.arxivMaxResultsPerCategory,
      manualLlmCallsPerUserPerDay: input.settings.manualLlmCallsPerUserPerDay,
      concurrentManualLlmCallsPerUser: input.settings.concurrentManualLlmCallsPerUser,
      userRoleManualLlmCallsPerUserPerDay: input.settings.userRoleManualLlmCallsPerUserPerDay,
      userRoleConcurrentManualLlmCallsPerUser: input.settings.userRoleConcurrentManualLlmCallsPerUser,
      adminRoleManualLlmCallsPerUserPerDay: input.settings.adminRoleManualLlmCallsPerUserPerDay,
      adminRoleConcurrentManualLlmCallsPerUser: input.settings.adminRoleConcurrentManualLlmCallsPerUser,
      logRetentionDays: input.settings.logRetentionDays,
      pdfTextRetentionDays: input.settings.pdfTextRetentionDays,
      backupRetentionDays: input.settings.backupRetentionDays,
      createdAt: iso(input.settings.createdAt),
      updatedAt: iso(input.settings.updatedAt)
    },
    notificationSmtp: input.notificationSmtp
      ? {
          enabled: input.notificationSmtp.enabled,
          host: input.notificationSmtp.host,
          port: input.notificationSmtp.port,
          secure: input.notificationSmtp.secure,
          from: input.notificationSmtp.from,
          username: input.notificationSmtp.username,
          hasPassword: Boolean(input.notificationSmtp.encryptedPassword),
          createdAt: iso(input.notificationSmtp.createdAt),
          updatedAt: iso(input.notificationSmtp.updatedAt)
        }
      : null,
    allowedEmailDomains: input.allowedEmailDomains.map((domain) => ({
      id: domain.id,
      domain: domain.domain,
      enabled: domain.enabled,
      createdAt: iso(domain.createdAt)
    })),
    users: input.users.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      emailVerified: item.emailVerified,
      disabled: item.disabled,
      notificationDisabled: item.notificationDisabled,
      manualLlmCallsPerUserPerDayOverride: item.manualLlmCallsPerUserPerDayOverride,
      concurrentManualLlmCallsPerUserOverride: item.concurrentManualLlmCallsPerUserOverride,
      createdAt: iso(item.createdAt),
      updatedAt: iso(item.updatedAt)
    }))
  };
}

export function jsonExportResponse(payload: unknown, filename: string) {
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberRecord(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, Number(item)] as const)
      .filter(([, item]) => Number.isFinite(item))
  );
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalIntegerOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function optionalDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildUserPortableImportPlan(payload: unknown, maxReadingStates = 5000): UserPortableImportPlan {
  if (!isRecord(payload) || payload.version !== "daily-arxiv-user-export-v1") {
    throw new Error("Unsupported user export JSON");
  }

  const preferenceRecord = isRecord(payload.preference) ? payload.preference : null;
  const preference = preferenceRecord
    ? {
        categories: stringArray(preferenceRecord.categories),
        categoryWeights: numberRecord(preferenceRecord.categoryWeights),
        includeKeywords: stringArray(preferenceRecord.includeKeywords),
        excludeKeywords: stringArray(preferenceRecord.excludeKeywords),
        topN: optionalNumber(preferenceRecord.topN, 5),
        sendTime: optionalString(preferenceRecord.sendTime) || "09:00",
        timezone: optionalString(preferenceRecord.timezone) || "Asia/Shanghai",
        summaryFocus: optionalNullableString(preferenceRecord.summaryFocus)
      }
    : null;

  const statesByPaperId = new Map<string, PortableReadingState>();
  const readingStates = Array.isArray(payload.readingStates) ? payload.readingStates : [];
  for (const rawState of readingStates) {
    if (!isRecord(rawState) || typeof rawState.paperId !== "string") continue;
    const paperId = rawState.paperId.trim();
    if (!paperId) continue;
    statesByPaperId.set(paperId, {
      paperId,
      favorited: booleanValue(rawState.favorited),
      read: booleanValue(rawState.read),
      ignored: booleanValue(rawState.ignored),
      recommendedAt: optionalDate(rawState.recommendedAt)
    });
  }

  const ignoredSections = ["llmConfig", "smtpConfig", "reports", "favorites"]
    .filter((key) => payload[key] !== undefined);

  return {
    version: "daily-arxiv-user-export-v1",
    preference,
    readingStates: [...statesByPaperId.values()].slice(0, maxReadingStates),
    ignoredSections
  };
}

export function buildAdminPortableImportPlan(payload: unknown, maxUsers = 5000): AdminPortableImportPlan {
  if (!isRecord(payload) || payload.version !== "daily-arxiv-admin-export-v1") {
    throw new Error("Unsupported admin export JSON");
  }

  const settingsRecord = isRecord(payload.settings) ? payload.settings : null;
  const settings = settingsRecord
    ? {
        notificationFallbackEnabled: booleanValue(settingsRecord.notificationFallbackEnabled),
        dailyEmailLimit: optionalNumber(settingsRecord.dailyEmailLimit, 10),
        emailRetryCount: optionalNumber(settingsRecord.emailRetryCount, 2),
        arxivMaxResultsPerCategory: optionalNumber(settingsRecord.arxivMaxResultsPerCategory, 100),
        manualLlmCallsPerUserPerDay: optionalNumber(settingsRecord.manualLlmCallsPerUserPerDay, 50),
        concurrentManualLlmCallsPerUser: optionalNumber(settingsRecord.concurrentManualLlmCallsPerUser, 1),
        userRoleManualLlmCallsPerUserPerDay: optionalIntegerOrNull(settingsRecord.userRoleManualLlmCallsPerUserPerDay),
        userRoleConcurrentManualLlmCallsPerUser: optionalIntegerOrNull(settingsRecord.userRoleConcurrentManualLlmCallsPerUser),
        adminRoleManualLlmCallsPerUserPerDay: optionalIntegerOrNull(settingsRecord.adminRoleManualLlmCallsPerUserPerDay),
        adminRoleConcurrentManualLlmCallsPerUser: optionalIntegerOrNull(settingsRecord.adminRoleConcurrentManualLlmCallsPerUser),
        logRetentionDays: optionalNumber(settingsRecord.logRetentionDays, 30),
        pdfTextRetentionDays: optionalNumber(settingsRecord.pdfTextRetentionDays, 30),
        backupRetentionDays: optionalNumber(settingsRecord.backupRetentionDays, 7)
      }
    : null;

  const domainByName = new Map<string, PortableAllowedDomain>();
  const rawDomains = Array.isArray(payload.allowedEmailDomains) ? payload.allowedEmailDomains : [];
  for (const rawDomain of rawDomains) {
    if (!isRecord(rawDomain) || typeof rawDomain.domain !== "string") continue;
    try {
      const domain = normalizeAllowedEmailDomain(rawDomain.domain);
      domainByName.set(domain, { domain, enabled: rawDomain.enabled !== false });
    } catch {
      // Ignore malformed portable rows; the import summary reports only rows that can be applied safely.
    }
  }

  const userByEmail = new Map<string, PortableAdminUserState>();
  const rawUsers = Array.isArray(payload.users) ? payload.users : [];
  for (const rawUser of rawUsers) {
    if (!isRecord(rawUser) || typeof rawUser.email !== "string") continue;
    const email = rawUser.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    userByEmail.set(email, {
      email,
      notificationDisabled: booleanValue(rawUser.notificationDisabled),
      manualLlmCallsPerUserPerDayOverride: optionalIntegerOrNull(rawUser.manualLlmCallsPerUserPerDayOverride),
      concurrentManualLlmCallsPerUserOverride: optionalIntegerOrNull(rawUser.concurrentManualLlmCallsPerUserOverride)
    });
  }

  const ignoredSections = ["notificationSmtp", "exportedBy"]
    .filter((key) => payload[key] !== undefined);

  return {
    version: "daily-arxiv-admin-export-v1",
    settings,
    allowedEmailDomains: [...domainByName.values()],
    users: [...userByEmail.values()].slice(0, maxUsers),
    ignoredSections
  };
}
