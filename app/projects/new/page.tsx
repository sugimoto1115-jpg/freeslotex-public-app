import Link from "next/link";

type PageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function NewProjectPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <main className="fsx-main">
      <section className="fsx-hero">
        <div>
          <div className="fsx-eyebrow">FreeSloTeX</div>
          <h1 className="fsx-title">Create a new project</h1>
          <p className="fsx-subtitle">
            Start a TeX workspace with main.tex, README.md, and basic build settings.
          </p>
        </div>

        <Link href="/projects" className="fsx-button">
          Back to Projects
        </Link>
      </section>

      {error ? (
        <div className="fsx-alert" style={{ marginBottom: 18 }}>
          {error}
        </div>
      ) : null}

      <section className="fsx-panel">
        <div className="fsx-panel-head">
          <div>
            <h2 className="fsx-panel-title">Project settings</h2>
            <p className="fsx-panel-note">
              Enter a project name. You can edit TeX files after the project is created.
            </p>
          </div>
        </div>

        <form action="/api/projects/new" method="post" className="fsx-form-card">
          <label>
            <span className="fsx-label">Project name</span>
            <input
              name="name"
              type="text"
              required
              maxLength={255}
              className="fsx-input"
              placeholder="Example: Statistics lecture notes 2026"
              autoFocus
            />
          </label>

          <div className="fsx-actions" style={{ marginTop: 18 }}>
            <button type="submit" className="fsx-button fsx-button-primary">
              Create Project
            </button>

            <Link href="/projects" className="fsx-button">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
