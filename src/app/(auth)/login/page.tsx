import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle>登录 daily-arxiv</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
          <p className="mt-4 text-sm text-muted-foreground">
            还没有账号？<Link className="text-accent underline" href="/register">注册</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
