import { ThemeSelect } from "../components/shared/ThemeSelect";

export default function LoginPage() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6"
      data-shot="login"
    >
      <div className="absolute right-4 top-4">
        <ThemeSelect />
      </div>
      <img src="/icon.svg" alt="" className="h-16 w-16" />
      <h1 className="text-xl font-medium text-fg">Pendant</h1>
      <p className="max-w-sm text-center text-sm text-muted">
        Sign in with Google. Only allowlisted accounts reach a crane.
      </p>
      <a
        className="rounded-xl border border-accent-line bg-accent-soft px-4 py-2 text-sm text-mark"
        href="/api/auth/google"
      >
        Continue with Google
      </a>
    </main>
  );
}
