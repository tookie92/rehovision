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
    <div className="mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl px-5 pb-16 pt-6 md:px-8 md:pt-8 [&:has([data-atelier-workspace])]:max-w-none [&:has([data-atelier-workspace])]:p-0 [&:has([data-atelier-workspace])]:pb-0">
      <DashboardAuthGate>{children}</DashboardAuthGate>
    </div>
  );
}
