import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers()
  });
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}

export async function requireAppUser() {
  const sessionUser = await requireUser();
  const fullUser = await db.query.user.findFirst({
    where: eq(userTable.id, sessionUser.id)
  });
  if (!fullUser || fullUser.disabled) {
    redirect("/login");
  }
  return fullUser;
}

export async function requireAdmin() {
  const fullUser = await requireAppUser();
  if (fullUser?.role !== "admin") {
    redirect("/dashboard");
  }
  return fullUser;
}

export async function requireApiUser() {
  const session = await getCurrentSession();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session.user;
}

export async function requireApiAdmin() {
  const sessionUser = await requireApiUser();
  const fullUser = await db.query.user.findFirst({
    where: eq(userTable.id, sessionUser.id)
  });
  if (fullUser?.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return fullUser;
}
