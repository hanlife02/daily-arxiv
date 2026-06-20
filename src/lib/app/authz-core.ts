export function assertActiveDatabaseUser<T extends { disabled: boolean; emailVerified: boolean }>(fullUser: T | null | undefined): T {
  if (!fullUser) {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (fullUser.disabled) {
    throw new Response("Forbidden", { status: 403 });
  }
  if (!fullUser.emailVerified) {
    throw new Response("Email not verified", { status: 403 });
  }
  return fullUser;
}
