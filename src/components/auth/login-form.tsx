"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? "")
      }),
      credentials: "same-origin"
    });

    if (response.ok) {
      window.location.href = "/dashboard";
      return;
    }

    const data = await response.json().catch(() => null);
    setError(data?.message ?? "登录失败，请检查邮箱和密码。");
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input className="neu-input h-11 px-4 text-sm" name="email" type="email" placeholder="邮箱" required />
      <input className="neu-input h-11 px-4 text-sm" name="password" type="password" placeholder="密码" required />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Button type="submit" className="mt-1" disabled={loading}>
        {loading ? "登录中" : "登录"}
      </Button>
    </form>
  );
}
