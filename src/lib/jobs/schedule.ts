export function localHourMinute(now: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hour}:${minute}`;
  } catch {
    return localHourMinute(now, "UTC");
  }
}

function minutesSinceMidnight(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isDueSendTime(sendTime: string, timezone: string, now = new Date()) {
  const current = minutesSinceMidnight(localHourMinute(now, timezone));
  const scheduled = minutesSinceMidnight(sendTime);
  if (current === null || scheduled === null) return false;
  return current >= scheduled;
}
