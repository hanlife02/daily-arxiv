import { NextResponse } from "next/server";

export function redirectToApp(path: string, request: Request) {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? request.url;
  return NextResponse.redirect(new URL(path, appUrl));
}
