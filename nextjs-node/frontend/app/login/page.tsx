"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { LoginUserResponse, MfaMethodSummary } from "@forteplatforms/sdk";
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
  const [pendingMfa, setPendingMfa] = useState<LoginUserResponse | null>(null);
  const projectId = getProjectId();

  // MFA is a project setting in the Forte console. When it's off, mfaStatus is SATISFIED (or
  // absent) and the token is a full session. When it's on, the token is a short-lived pending
  // token that only the MFA endpoints accept until the user completes a second factor.
  function completeLogin(login: LoginUserResponse) {
    if (login.mfaStatus === "CHALLENGE_REQUIRED" || login.mfaStatus === "ENROLLMENT_REQUIRED") {
      setPendingMfa(login);
      return;
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
        ) : pendingMfa ? (
          <MfaStep projectId={projectId} login={pendingMfa} completeLogin={completeLogin} />
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

/**
 * The second factor, shown only when the project requires or offers MFA. CHALLENGE_REQUIRED: the
 * user picks one of availableMfaMethods; email and SMS codes need sendMfaChallenge first, while
 * authenticator-app and backup codes go straight to verifyMfa. ENROLLMENT_REQUIRED: the project
 * requires MFA and the user has no factor yet, so they set up an authenticator app first.
 * Passkeys need the WebAuthn browser API; see the MFA docs for that flow.
 */
function MfaStep({ projectId, login, completeLogin }: FormProps & { login: LoginUserResponse }) {
  // Pass the pending token explicitly: this example keeps tokens out of cookies.
  const authorization = `Bearer ${login.sessionToken.sessionToken}`;
  const methods = (login.availableMfaMethods ?? []).filter((m) => m.type !== "WEBAUTHN");
  const [method, setMethod] = useState<MfaMethodSummary | null>(null);
  const [enrollment, setEnrollment] = useState<{ mfaMethodId: string; secret: string } | null>(null);
  const [enrolled, setEnrolled] = useState(false);
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

  const choose = (m: MfaMethodSummary) =>
    run(async () => {
      if (m.type === "EMAIL_OTP" || m.type === "SMS_OTP") {
        await forte.users.sendMfaChallenge({
          projectId,
          authorization,
          mfaChallengeRequest: { type: m.type, targetContactMethodId: m.contactMethodId },
        });
      }
      setMethod(m);
    }, "Couldn't send a code");

  const startEnrollment = () =>
    run(async () => {
      const created = await forte.users.createMfaMethod({
        projectId,
        authorization,
        createMfaMethodRequest: { type: "TOTP", displayName: "Authenticator app" },
      });
      setEnrollment({ mfaMethodId: created.mfaMethodId, secret: created.secret ?? "" });
    }, "Couldn't start setup");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (enrollment && !enrolled) {
        await forte.users.activateMfaMethod({
          projectId,
          authorization,
          mfaMethodId: enrollment.mfaMethodId,
          activateMfaMethodRequest: { code },
        });
        // The app is set up. Signing in still needs one verified code, so ask for the next one.
        setEnrolled(true);
        setCode("");
        return;
      }
      const type = method?.type ?? "TOTP";
      completeLogin(
        await forte.users.verifyMfa({ projectId, authorization, mfaVerifyRequest: { type, code } }),
      );
    }, "Invalid code");
  }

  if (!method && !enrollment) {
    const needsEnrollment = login.mfaStatus === "ENROLLMENT_REQUIRED";
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {needsEnrollment
            ? "This app requires a second sign-in step. Set up an authenticator app to continue."
            : "Confirm it's you with a second step."}
        </p>
        {needsEnrollment ? (
          <button type="button" disabled={busy} onClick={startEnrollment} className={primaryButtonClass}>
            Set up an authenticator app
          </button>
        ) : (
          methods.map((m) => (
            <button
              key={`${m.type}-${m.contactMethodId ?? ""}`}
              type="button"
              disabled={busy}
              onClick={() => choose(m)}
              className={secondaryButtonClass}
            >
              {describeMfaMethod(m)}
            </button>
          ))
        )}
        {error && <ErrorMessage message={error} />}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {enrollment && !enrolled ? (
          <>
            Add this key to your authenticator app, then enter the code it shows:{" "}
            <code className="break-all font-mono">{enrollment.secret}</code>
          </>
        ) : enrolled ? (
          "Your authenticator app is set up. Enter its next code to finish signing in."
        ) : (
          `Enter the code from: ${describeMfaMethod(method!)}.`
        )}
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
    </form>
  );
}

function describeMfaMethod(m: MfaMethodSummary): string {
  switch (m.type) {
    case "TOTP":
      return "Authenticator app";
    case "EMAIL_OTP":
      return `Email to ${m.maskedTarget ?? "your address"}`;
    case "SMS_OTP":
      return `Text to ${m.maskedTarget ?? "your phone"}`;
    case "BACKUP_CODE":
      return "A backup code";
    default:
      return m.type;
  }
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

const secondaryButtonClass =
  "w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";
