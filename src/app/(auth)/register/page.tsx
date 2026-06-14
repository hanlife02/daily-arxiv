import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle>注册账号</CardTitle>
        </CardHeader>
        <CardContent>
          <RegisterForm />
          <p className="mt-4 text-sm text-muted-foreground">
            已有账号？<Link className="text-accent underline" href="/login">登录</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
