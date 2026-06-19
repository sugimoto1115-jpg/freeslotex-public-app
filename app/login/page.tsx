import Link from "next/link";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <main className="fsx-shell">
      <div className="fsx-main">
        <section className="fsx-hero">
          <div>
            <div className="fsx-eyebrow">FreeSloTeX</div>
            <h1 className="fsx-title">Sign in to your TeX workspace</h1>
            <p className="fsx-subtitle">
              After signing in, your My workspace will open. You can manage
              private TeX projects and shared projects from there.
            </p>
          </div>

          <Link href="/register" className="fsx-button">
            Create account
          </Link>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 420px)", gap: 24 }}>
          <section className="fsx-panel">
            <h2 className="fsx-panel-title">What you can do</h2>
            <p className="fsx-panel-note">
              FreeSloTeX is a lightweight TeX workspace for personal writing and
              project-based collaboration.
            </p>

            <div className="fsx-grid" style={{ marginTop: 18 }}>
              <div className="fsx-card">
                <strong>Private projects</strong>
                <p className="fsx-muted" style={{ marginTop: 6 }}>
                  Keep your own TeX files private.
                </p>
              </div>

              <div className="fsx-card">
                <strong>Shared projects</strong>
                <p className="fsx-muted" style={{ marginTop: 6 }}>
                  Collaborate only on projects where sharing is enabled.
                </p>
              </div>

              <div className="fsx-card">
                <strong>Dashboard first</strong>
                <p className="fsx-muted" style={{ marginTop: 6 }}>
                  Login opens the My workspace, not the editor directly.
                </p>
              </div>
            </div>
          </section>

          <section className="fsx-panel">
            <h2 className="fsx-panel-title">Sign in</h2>
            <p className="fsx-panel-note">
              Use your registered email address and password.
            </p>

            {error ? (
              <div className="fsx-alert" style={{ marginTop: 14 }}>
                {error}
              </div>
            ) : null}

            <form action="/api/login" method="post" className="fsx-form-card">
              <label>
                <span className="fsx-label">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="fsx-input"
                  placeholder="you@example.com"
                />
              </label>

              <label style={{ display: "block", marginTop: 14 }}>
                <span className="fsx-label">Password</span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="fsx-input"
                  placeholder="Your password"
                />
              </label>

              <button
                type="submit"
                className="fsx-button fsx-button-primary"
                style={{ width: "100%", marginTop: 18 }}
              >
                Sign in and open my workspace
              </button>

              <p className="fsx-panel-note" style={{ marginTop: 14 }}>
                <Link href="/account/forgot-password">Forgot password?</Link>
              </p>

              <p className="fsx-panel-note" style={{ marginTop: 8 }}>
                No account yet? <Link href="/register">Create account</Link>
              </p>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
