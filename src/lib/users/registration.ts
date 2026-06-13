export function getEmailDomain(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) throw new Error("Invalid email");
  return domain;
}

export function isEmailAllowed(email: string, allowedDomains: string[]) {
  const domain = getEmailDomain(email);
  return allowedDomains.map((item) => item.toLowerCase()).includes(domain);
}
