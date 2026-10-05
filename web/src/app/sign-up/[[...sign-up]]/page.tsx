import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-[var(--shadow)]",
          },
        }}
      />
    </div>
  );
}
