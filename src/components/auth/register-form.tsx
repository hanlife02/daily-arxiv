"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RegisterForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? "")
      }),
      credentials: "same-origin"
    });

    if (response.ok) {
      setSuccess("注册成功，请查收邮箱验证邮件。");
      event.currentTarget.reset();
      setLoading(false);
      return;
    }

    const data = await response.json().catch(() => null);
    setError(data?.message ?? "注册失败，请检查邮箱后缀和密码。");
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input className="neu-input h-11 px-4 text-sm" name="name" placeholder="姓名" required />
      <input className="neu-input h-11 px-4 text-sm" name="email" type="email" placeholder="邮箱" required />
      <input className="neu-input h-11 px-4 text-sm" name="password" type="password" placeholder="密码" required />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {success ? <p className="text-sm text-muted-foreground">{success}</p> : null}
      <Button type="submit" className="mt-1" disabled={loading}>
        {loading ? "发送中" : "注册并发送验证邮件"}
      </Button>
    </form>
  );
}
