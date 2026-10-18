"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LoginUserResponse } from "@forteplatforms/sdk";
import { describeForteError, forte, getProjectId } from "@/lib/forte-browser";
import { setSessionToken } from "@/lib/session";

// Sign-in talks to Forte directly from the browser with the end-user API (`forte.users.*`).
// The returned session token is then sent to the backend service on every call.

type Tab = "password" | "otp";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

// `next` comes from the URL, so only follow same-site paths. Anything else would be an open redirect.
function getSafeNextPath(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")
    ? raw
    : "/dashboard";
}

function LoginPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = getSafeNextPath(search.get("next"));
  const [tab, setTab] = useState<Tab>("password");
  const projectId = getProjectId();

  function completeLogin(login: LoginUserResponse) {
    // With MFA on, login returns a short-lived pending token that the gateway rejects until the
    // user completes a second factor. This example doesn't implement that step.
    if (login.mfaStatus && login.mfaStatus !== "SATISFIED") {
      throw new Error(
        "This project requires multi-factor authentication, which this example doesn't implement. " +
          "See https://forteplatforms.com/docs/core-concepts/users/mfa.",
      );
    }
    setSessionToken(login.sessionToken.sessionToken);
    router.replace(next);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        This page signs you in with the Forte SDK from the browser. Everything after that goes
        through the backend service.
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
          <ErrorMessage message="NEXT_PUBLIC_FORTE_PROJECT_ID is not set. Forte sets it on website builds; locally, set it in .env.local." />
        ) : tab === "password" ? (
          <PasswordForm projectId={projectId} completeLogin={completeLogin} />
        ) : (
          <OtpForm projectId={projectId} completeLogin={completeLogin} />
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

type FormProps = {
  projectId: string;
  completeLogin: (login: LoginUserResponse) => void;
};

/**
 * Password sign-in and sign-up.
 *
 * Sign-up is two steps. registerUser emails a verification code and returns a session that is
 * only good for verifying that email. passwordLogin requires a verified email, so the user enters
 * the code first, then the form signs in with the password.
 */
function PasswordForm({ projectId, completeLogin }: FormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [verification, setVerification] = useState<{
    contactMethodId: string;
    registrationToken: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(await describeForteError(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    const login = await forte.users.passwordLogin({
      projectId,
      passwordLoginRequest: { contactValue: email, password },
    });
    completeLogin(login);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (mode === "signin") {
        await signIn();
        return;
      }
      const registered = await forte.users.registerUser({
        projectId,
        registerUserRequest: { email, password },
      });
      const contactMethodId = registered.userObject?.contactMethods.find(
        (cm) => !cm.verified && cm.email?.toLowerCase() === email.toLowerCase(),
      )?.contactMethodId;
      if (!contactMethodId) {
        throw new Error("Registration didn't return an email to verify.");
      }
      setVerification({ contactMethodId, registrationToken: registered.sessionToken.sessionToken });
    }, "Sign-in failed");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!verification) return;
    await run(async () => {
      await forte.users.verifyContactMethod({
        projectId,
        contactMethodId: verification.contactMethodId,
        verificationCode: code,
        authorization: `Bearer ${verification.registrationToken}`,
      });
      await signIn();
    }, "Verification failed");
  }

  if (verification) {
    return (
      <form onSubmit={verify} className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          We sent a verification code to <strong>{email}</strong>. Enter it to finish creating your
          account.
        </p>
        <Field label="Verification code">
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
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
    );
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

/**
 * One-time-code sign-in for an existing account. createOtpLogin returns the same response whether
 * or not the email has an account, so it can't be used to discover who has signed up. New users
 * register on the Password tab.
 */
function OtpForm({ projectId, completeLogin }: FormProps) {
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
      const { pendingLoginId: id } = await forte.users.createOtpLogin({
        projectId,
        createOtpLoginRequest: { email },
      });
      setPendingLoginId(id);
    } catch (err) {
      setError(await describeForteError(err, "Couldn't send a code"));
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
      completeLogin(login);
    } catch (err) {
      setError(await describeForteError(err, "Invalid code"));
    } finally {
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
        <p className="text-center text-xs text-neutral-500">
          For existing accounts. To sign up, use the Password tab.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={complete} className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        If <strong>{email}</strong> has an account, we sent it a code. Enter it below.
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
