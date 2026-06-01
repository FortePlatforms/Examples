"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ForteClient, type LoginUserResponse } from "@forteplatforms/sdk";
import { setSessionToken } from "@/lib/session";

// Login is the one place that talks to Forte directly from the browser, using the end-user
// API (`forte.users.*`). No API token is involved. On success we keep the returned session
// token and forward it to our backend service on subsequent calls.
const forte = new ForteClient();

type Tab = "password" | "otp";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";
  const [tab, setTab] = useState<Tab>("password");

  // In production NEXT_PUBLIC_FORTE_PROJECT_ID is injected by Forte; locally it comes from
  // .env.local. When it's missing we render a clear message instead of the forms.
  const projectId = process.env.NEXT_PUBLIC_FORTE_PROJECT_ID;

  function onSuccess(login: LoginUserResponse) {
    const token = login.sessionToken?.sessionToken;
    if (!token) {
      return;
    }
    setSessionToken(token);
    router.push(next);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        This website calls the Forte SDK from the browser to sign you in, then talks to a
        separate backend service for everything else.
      </p>

      <div className="mt-8 flex gap-1 rounded-lg bg-neutral-200/60 p-1 dark:bg-neutral-800">
        <TabButton active={tab === "password"} onClick={() => setTab("password")}>
          Password
        </TabButton>
        <TabButton active={tab === "otp"} onClick={() => setTab("otp")}>
          One-time code
        </TabButton>
      </div>

      <div className="mt-6">
        {!projectId ? (
          <ErrorMessage message="NEXT_PUBLIC_FORTE_PROJECT_ID is not set. On Forte it is injected into your website automatically; locally, set it in .env.local." />
        ) : tab === "password" ? (
          <PasswordForm projectId={projectId} onSuccess={onSuccess} />
        ) : (
          <OtpForm projectId={projectId} onSuccess={onSuccess} />
        )}
      </div>
    </main>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50"
          : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100")
      }
    >
      {children}
    </button>
  );
}

function PasswordForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: (login: LoginUserResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await forte.users.registerUser({
          projectId,
          registerUserRequest: { email, password },
        });
      }
      const login = await forte.users.passwordLogin({
        projectId,
        passwordLoginRequest: { contactValue: email, password },
      });
      onSuccess(login);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error && <ErrorMessage message={error} />}
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? "Working…" : mode === "register" ? "Create account" : "Sign in"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "register" : "signin")}
        className="block w-full text-center text-xs text-neutral-600 hover:underline dark:text-neutral-400"
      >
        {mode === "signin" ? "No account? Register" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}

function OtpForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: (login: LoginUserResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [pendingLoginId, setPendingLoginId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Register first so a brand-new email can sign in; ignore "already exists".
      try {
        await forte.users.registerUser({ projectId, registerUserRequest: { email } });
      } catch {
        // User may already exist; continue to OTP.
      }
      const { pendingLoginId: id } = await forte.users.createOtpLogin({
        projectId,
        createOtpLoginRequest: { email },
      });
      setPendingLoginId(id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  async function complete(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingLoginId) return;
    setBusy(true);
    setError(null);
    try {
      const login = await forte.users.completeOtpLogin({
        projectId,
        pendingLoginId,
        completeOtpLoginRequest: { code },
      });
      onSuccess(login);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setBusy(false);
    }
  }

  if (!pendingLoginId) {
    return (
      <form onSubmit={start} className="space-y-4">
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        {error && <ErrorMessage message={error} />}
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Sending…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={complete} className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        We sent a code to <strong>{email}</strong>. Enter it below.
      </p>
      <Field label="Code">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error && <ErrorMessage message={error} />}
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? "Verifying…" : "Verify"}
      </button>
      <button
        type="button"
        onClick={() => {
          setPendingLoginId(null);
          setCode("");
        }}
        className="block w-full text-center text-xs text-neutral-600 hover:underline dark:text-neutral-400"
      >
        Use a different email
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
      {message}
    </div>
  );
}

const inputClass =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100 dark:focus:ring-neutral-100";

const primaryButtonClass =
  "w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";
