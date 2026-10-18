import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { LoginUserResponse } from "@forteplatforms/sdk";
import { describeForteError, forte, getProjectId } from "../lib/forte-browser";
import { setSessionToken } from "../lib/session";

// Sign-in talks to Forte directly from the browser with the end-user API (`forte.users.*`).
// The returned session token is then sent to the backend service on every call.

type Tab = "password" | "otp";

// `next` comes from the URL, so only follow same-site paths. Anything else would be an open redirect.
function getSafeNextPath(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")
    ? raw
    : "/dashboard";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
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
    navigate(next, { replace: true });
  }

  return (
    <main className="container container-narrow">
      <h1 className="title">Sign in</h1>
      <p className="muted">
        This page signs you in with the Forte SDK from the browser. Everything after that goes
        through the backend service.
      </p>

      <div className="tabs">
        <button
          type="button"
          className={"tab" + (tab === "password" ? " active" : "")}
          onClick={() => setTab("password")}
        >
          Password
        </button>
        <button
          type="button"
          className={"tab" + (tab === "otp" ? " active" : "")}
          onClick={() => setTab("otp")}
        >
          One-time code
        </button>
      </div>

      <div className="tab-body">
        {!projectId ? (
          <div className="error">
            VITE_FORTE_PROJECT_ID is not set. Forte sets it on website builds; locally, set it in
            .env.local.
          </div>
        ) : tab === "password" ? (
          <PasswordForm projectId={projectId} completeLogin={completeLogin} />
        ) : (
          <OtpForm projectId={projectId} completeLogin={completeLogin} />
        )}
      </div>
    </main>
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

  async function submit(e: FormEvent) {
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

  async function verify(e: FormEvent) {
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
      <form onSubmit={verify}>
        <p className="muted">
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
            className="input"
          />
        </Field>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy} className="btn btn-primary btn-block">
          {busy ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit}>
      <Field label="Email">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
      </Field>
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={busy} className="btn btn-primary btn-block">
        {busy ? "Working…" : mode === "register" ? "Create account" : "Sign in"}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === "signin" ? "register" : "signin")}
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

  async function start(e: FormEvent) {
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

  async function complete(e: FormEvent) {
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
      <form onSubmit={start}>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </Field>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy} className="btn btn-primary btn-block">
          {busy ? "Sending…" : "Send code"}
        </button>
        <p className="muted">For existing accounts. To sign up, use the Password tab.</p>
      </form>
    );
  }

  return (
    <form onSubmit={complete}>
      <p className="muted">
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
          className="input"
        />
      </Field>
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={busy} className="btn btn-primary btn-block">
        {busy ? "Verifying…" : "Verify"}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setPendingLoginId(null);
          setCode("");
        }}
      >
        Use a different email
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
