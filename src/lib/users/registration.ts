export function normalizeAllowedEmailDomain(domain: string) {
  const normalized = domain.trim().toLowerCase();
  if (!normalized || normalized.length > 253) throw new Error("Invalid email domain");
  if (normalized.includes("@") || normalized.includes("://") || /[\/\\\s]/.test(normalized)) {
    throw new Error("Invalid email domain");
  }

  const labels = normalized.split(".");
  if (
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9]/.test(label) ||
        !/[a-z0-9]$/.test(label) ||
        !/^[a-z0-9-]+$/.test(label)
    )
  ) {
    throw new Error("Invalid email domain");
  }

  return normalized;
}

export function getEmailDomain(email: string) {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Invalid email");
  return normalizeAllowedEmailDomain(parts[1]);
}

export function isEmailAllowed(email: string, allowedDomains: string[]) {
  if (allowedDomains.length === 0) return false;

  try {
    const domain = getEmailDomain(email);
    const normalizedAllowedDomains = allowedDomains
      .map((item) => {
        try {
          return normalizeAllowedEmailDomain(item);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    return normalizedAllowedDomains.includes(domain);
  } catch {
    return false;
  }
}

export function resolveAllowedRegistrationDomains(input: {
  enabledDomains: string[];
  hasConfiguredDomains: boolean;
  adminEmail?: string | null;
}) {
  const enabledDomains = Array.from(
    new Set(
      input.enabledDomains
        .map((domain) => {
          try {
            return normalizeAllowedEmailDomain(domain);
          } catch {
            return "";
          }
        })
        .filter(Boolean)
    )
  );
  if (enabledDomains.length > 0) return enabledDomains;
  if (input.hasConfiguredDomains || !input.adminEmail) return [];
  try {
    return [getEmailDomain(input.adminEmail)];
  } catch {
    return [];
  }
}
