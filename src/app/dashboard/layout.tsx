import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardAuthGate } from "@/components/DashboardAuthGate";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="mx-auto min-h-[calc(100vh-4.5rem)] max-w-5xl px-6 py-10 md:px-10">
      <DashboardAuthGate>{children}</DashboardAuthGate>
    </div>
  );
}
