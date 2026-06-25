import { Sidebar } from "@/components/sidebar";
import { requireAppUser } from "@/lib/app/authz";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAppUser();
  return (
    <div className="flex min-h-screen flex-col md:h-dvh md:min-h-0 md:flex-row md:overflow-hidden">
      <Sidebar role={user.role} />
      <main className="min-w-0 flex-1 p-4 md:h-dvh md:overflow-y-auto md:p-8">
        {children}
      </main>
    </div>
  );
}
