import Link from "next/link";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<{
    error?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ChangePasswordPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const sp = searchParams ? await searchParams : {};
  const error = firstParam(sp.error);

  return (
    <main className="fsx-shell">
      <div className="fsx-main">
        <section className="fsx-hero">
          <div>
            <div className="fsx-eyebrow">FreeSloTeX account</div>
            <h1 className="fsx-title">Change password</h1>
            <p className="fsx-subtitle">
              Change the password for your FreeSloTeX account. After the change,
              you will be signed out and asked to sign in again.
            </p>
          </div>

          <Link href="/workspace" className="fsx-button">
            Back to workspace
          </Link>
        </section>

        <section className="fsx-panel" style={{ maxWidth: 560 }}>
          <h2 className="fsx-panel-title">Password settings</h2>
          <p className="fsx-panel-note">
            Current account: <strong>{user.email}</strong>
          </p>

          {error ? (
            <div className="fsx-alert" style={{ marginTop: 14 }}>
              {error}
            </div>
          ) : null}

          <form
            action="/account/password/change"
            method="post"
            className="fsx-form-card"
          >
            <label>
              <span className="fsx-label">Current password</span>
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                className="fsx-input"
                placeholder="Current password"
              />
            </label>

            <label style={{ display: "block", marginTop: 14 }}>
              <span className="fsx-label">New password</span>
              <input
                name="newPassword"
                type="password"
                required
                autoComplete="new-password"
                className="fsx-input"
                placeholder="New password"
              />
            </label>

            <label style={{ display: "block", marginTop: 14 }}>
              <span className="fsx-label">Confirm new password</span>
              <input
                name="newPasswordConfirm"
                type="password"
                required
                autoComplete="new-password"
                className="fsx-input"
                placeholder="Confirm new password"
              />
            </label>

            <button
              type="submit"
              className="fsx-button fsx-button-primary"
              style={{ width: "100%", marginTop: 18 }}
            >
              Change password
            </button>

            <p className="fsx-panel-note" style={{ marginTop: 14 }}>
              After changing your password, all current sessions for this
              account will be removed.
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}
