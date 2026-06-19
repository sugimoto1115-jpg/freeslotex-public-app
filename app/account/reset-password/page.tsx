import Link from "next/link";
import { getPasswordResetTokenInfo } from "@/lib/passwordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function errorMessage(error: string) {
  if (error === "invalid") return "This password reset link is invalid or has expired.";
  if (error === "password_mismatch") return "The two passwords do not match.";
  if (error === "password_invalid") return "Please enter a valid password of at least 8 characters.";
  if (error === "failed") return "Password reset failed. Please request a new reset link.";
  return "";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const token = firstParam(params.token).trim();
  const error = firstParam(params.error).trim();
  const message = errorMessage(error);

  const tokenInfo = token ? await getPasswordResetTokenInfo(token) : null;

  return (
    <main className="fsx-main">
      <section className="fsx-panel" style={{ maxWidth: 640 }}>
        <h1 className="fsx-title">Set a new password</h1>

        {message ? (
          <div className="fsx-card" style={{ borderColor: "#dc2626", marginBottom: 16 }}>
            <p>{message}</p>
          </div>
        ) : null}

        {!tokenInfo ? (
          <>
            <p className="fsx-muted">
              This password reset link is invalid or has expired.
            </p>
            <p>
              <Link href="/account/forgot-password">Request a new reset link</Link>
            </p>
            <p>
              <Link href="/login">Back to login</Link>
            </p>
          </>
        ) : (
          <>
            <p className="fsx-muted">
              Enter a new password for your FreeSloTeX account.
            </p>

            <form method="post" action="/account/reset-password/confirm">
              <input type="hidden" name="token" value={token} />

              <label>
                New password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 520,
                    marginTop: 6,
                    padding: 8,
                  }}
                />
              </label>

              <div style={{ marginTop: 12 }}>
                <label>
                  Confirm new password
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={{
                      display: "block",
                      width: "100%",
                      maxWidth: 520,
                      marginTop: 6,
                      padding: 8,
                    }}
                  />
                </label>
              </div>

              <div style={{ marginTop: 16 }}>
                <button className="fsx-button" type="submit">
                  Set new password
                </button>
              </div>
            </form>

            <p style={{ marginTop: 20 }}>
              <Link href="/login">Back to login</Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
