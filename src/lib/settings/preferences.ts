const DEFAULT_SEND_TIME = "09:00";
const DEFAULT_TIMEZONE = "Asia/Shanghai";

export function normalizeSendTime(value: string | null | undefined) {
  const sendTime = (value ?? "").trim();
  if (!sendTime) return DEFAULT_SEND_TIME;

  const match = /^(\d{2}):(\d{2})$/.exec(sendTime);
  if (!match) throw new Error("Invalid send time");

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Invalid send time");

  return sendTime;
}

export function normalizeTimezone(value: string | null | undefined) {
  const timezone = (value ?? "").trim();
  if (!timezone) return DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("Invalid timezone");
  }

  return timezone;
}
