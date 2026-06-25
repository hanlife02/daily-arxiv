export type SmtpConfigInput = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  username?: string | null;
  password?: string | null;
};

export type OptionalSmtpConfigIntent = {
  enabled?: boolean;
  host: string;
  from: string;
  username?: string | null;
  password?: string | null;
};

export function normalizeSmtpHost(host: string) {
  const normalized = host.trim();
  if (!normalized) throw new Error("SMTP host is required");
  if (normalized.includes("://") || /[\/\\\s]/.test(normalized)) {
    throw new Error("SMTP host must be a host name or IP address, without protocol or path");
  }
  return normalized;
}

export function normalizeSmtpPort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP port must be an integer between 1 and 65535");
  }
  return port;
}

export function normalizeSmtpFrom(from: string) {
  const normalized = from.trim();
  if (!normalized) throw new Error("SMTP from is required");
  return normalized;
}

export function normalizeSmtpConfig(input: SmtpConfigInput) {
  return {
    host: normalizeSmtpHost(input.host),
    port: normalizeSmtpPort(input.port),
    secure: input.secure,
    from: normalizeSmtpFrom(input.from),
    username: input.username?.trim() || null,
    password: input.password ?? null
  };
}

export function hasSmtpConfigIntent(input: OptionalSmtpConfigIntent) {
  return Boolean(
    input.enabled ||
      input.host.trim() ||
      input.from.trim() ||
      input.username?.trim() ||
      input.password?.trim()
  );
}
