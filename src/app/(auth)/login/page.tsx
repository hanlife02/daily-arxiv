import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle>登录 daily-arxiv</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/api/auth/sign-in/email" method="post" className="grid gap-3">
            <input className="neu-input h-11 px-4 text-sm" name="email" type="email" placeholder="邮箱" required />
            <input className="neu-input h-11 px-4 text-sm" name="password" type="password" placeholder="密码" required />
            <Button type="submit" className="mt-1">登录</Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            还没有账号？<Link className="text-accent underline" href="/register">注册</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
