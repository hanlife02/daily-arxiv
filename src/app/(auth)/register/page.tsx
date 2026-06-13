import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle>注册账号</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/api/auth/sign-up/email" method="post" className="grid gap-3">
            <input className="neu-input h-11 px-4 text-sm" name="name" placeholder="姓名" required />
            <input className="neu-input h-11 px-4 text-sm" name="email" type="email" placeholder="邮箱" required />
            <input className="neu-input h-11 px-4 text-sm" name="password" type="password" placeholder="密码" required />
            <Button type="submit" className="mt-1">注册并发送验证邮件</Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            已有账号？<Link className="text-accent underline" href="/login">登录</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
