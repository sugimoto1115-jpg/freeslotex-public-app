import Link from "next/link";
import ArchiveProjectButton from "./ArchiveProjectButton";
import path from "node:path";
import { mkdir, readdir, rm, symlink, lstat, writeFile } from "node:fs/promises";
import { requireUser, getCurrentUser as getLabtexCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fsPlanLabel } from "@/lib/freeslotex/entitlements";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";

export const runtime = "nodejs";

type ProjectRow = {
  id: number;
  name: string;
  visibility: string;
  status: string;
  storage_path: string;
  created_at: string;
  updated_at: string;
  role: string;
  owner_user_id: number;
  member_count: number;
  folder_kind: "private" | "shared";
  source_exists?: boolean;
};

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleLabel(role: string) {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return role;
}

function roleClass(role: string) {
  if (role === "owner") return "fsx-pill fsx-pill-owner";
  if (role === "editor") return "fsx-pill fsx-pill-editor";
  return "fsx-pill";
}

function sortProjectsByUpdatedDesc(projects: ProjectRow[]) {
  return [...projects].sort((a, b) => {
    const at = new Date(a.updated_at).getTime();
    const bt = new Date(b.updated_at).getTime();

    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) {
      return bt - at;
    }

    return b.id - a.id;
  });
}

function workspacesRoot() {
  return process.env.LABTEX_WORKSPACES_ROOT || "/home/tomoyuki/labtex/workspaces";
}

function userWorkspaceRoot(userId: number) {
  return `/home/tomoyuki/freeslotex-user-editors/user-${userId}/workspace`;
}

async function pathExists(p: string) {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function clearGeneratedLinks(dir: string) {
  await mkdir(dir, { recursive: true });

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.startsWith("project-")) continue;
    const full = path.join(dir, entry.name);
    const st = await lstat(full).catch(() => null);
    if (st?.isSymbolicLink()) {
      await rm(full);
    }
  }
}

async function refreshUserWorkspace(userId: number, projects: ProjectRow[]) {
  const root = userWorkspaceRoot(userId);
  const privateDir = path.join(root, "private");
  const sharedDir = path.join(root, "shared");

  await mkdir(privateDir, { recursive: true });
  await mkdir(sharedDir, { recursive: true });

  await clearGeneratedLinks(privateDir);
  await clearGeneratedLinks(sharedDir);

  const manifestLines: string[] = [
    "FreeSloTeX user workspace",
    "",
    `user_id: ${userId}`,
    `updated_at: ${new Date().toISOString()}`,
    "",
    "Layout:",
    "  private/ : projects owned only by this user",
    "  shared/  : projects shared with this user",
    "",
  ];

  for (const project of projects) {
    const source = path.join(workspacesRoot(), project.storage_path);
    const exists = await pathExists(source);
    project.source_exists = exists;

    const base = project.folder_kind === "private" ? privateDir : sharedDir;
    const link = path.join(base, `project-${project.id}`);

    manifestLines.push(`project-${project.id}:`);
    manifestLines.push(`  name: ${project.name}`);
    manifestLines.push(`  kind: ${project.folder_kind}`);
    manifestLines.push(`  role: ${project.role}`);
    manifestLines.push(`  source: ${source}`);

    if (exists) {
      await symlink(source, link).catch((error: any) => {
        if (error?.code !== "EEXIST") throw error;
      });
      manifestLines.push(`  link: ${project.folder_kind}/project-${project.id}`);
    } else {
      manifestLines.push("  warning: source directory missing");
    }

    manifestLines.push("");
  }

  await writeFile(
    path.join(root, "README-FreeSloTeX-workspace.txt"),
    manifestLines.join("\n"),
    "utf-8"
  );

  return root;
}

function ProjectCard({ project }: { project: ProjectRow }) {
  return (
    <section className="fsx-card">
      <div className="fsx-card-head">
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Link href={`/projects/${project.id}`} className="fsx-project-name">
              {project.name}
            </Link>
            <span className={roleClass(project.role)}>{roleLabel(project.role)}</span>
            <span className="fsx-pill">{project.visibility}</span>
            <span className="fsx-pill">{project.folder_kind}</span>
          </div>

          <div className="fsx-meta fsx-meta-line">
            <span>Project ID: <code>{project.id}</code></span>
            <span>Updated: {fmtDate(project.updated_at)}</span>
            <span>Created: {fmtDate(project.created_at)}</span>
            <span>Status: {project.status}</span>
          </div>

          {!project.source_exists ? (
            <p className="fsx-panel-note" style={{ color: "#b45309" }}>
              Source folder is missing.
            </p>
          ) : null}
        </div>

        <div className="fsx-actions">
          <Link href={`/projects/${project.id}`} className="fsx-button fsx-button-primary">
            Open
          </Link>

          {project.role === "owner" ? (
            <ArchiveProjectButton projectId={project.id} projectName={project.name} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default async function WorkspacePage() {
  const user = await requireUser();

  const userResult = await query<{ id: number }>(
    `
    SELECT id
    FROM users
    WHERE lower(email) = lower($1)
    LIMIT 1
    `,
    [user.email]
  );

  if (userResult.rows.length === 0) {
    throw new Error("Current user was not found in users table.");
  }

  const userId = Number(userResult.rows[0].id);

  const projectsResult = await query<ProjectRow>(
    `
    WITH member_counts AS (
      SELECT project_id, count(*)::int AS member_count
      FROM project_members
      GROUP BY project_id
    )
    SELECT
      p.id,
      p.name,
      p.visibility,
      p.status,
      p.storage_path,
      p.created_at::text as created_at,
      p.updated_at::text as updated_at,
      p.owner_user_id,
      pm.role,
      coalesce(mc.member_count, 0)::int as member_count,
      CASE
        WHEN p.owner_user_id = $1 AND coalesce(mc.member_count, 0) = 1
          THEN 'private'
        ELSE 'shared'
      END as folder_kind
    FROM projects p
    INNER JOIN project_members pm
      ON pm.project_id = p.id
    LEFT JOIN member_counts mc
      ON mc.project_id = p.id
    WHERE pm.user_id = $1
      AND p.status = 'active'
    ORDER BY p.updated_at DESC, p.id DESC
    `,
    [userId]
  );

  const projects = sortProjectsByUpdatedDesc(projectsResult.rows);
  const root = await refreshUserWorkspace(userId, projects);
  const privateProjects = sortProjectsByUpdatedDesc(
    projects.filter((p) => p.folder_kind === "private")
  );
  const sharedProjects = sortProjectsByUpdatedDesc(
    projects.filter((p) => p.folder_kind === "shared")
  );

  const fsAccount = await getLabtexCurrentUser();
  const fsAccountEmail = fsAccount?.email ?? "";
  const fsPlan = await getEffectiveFsPlanForEmail(fsAccountEmail);
  const fsPlanText = fsPlanLabel(fsPlan);


  return (
    <main className="fsx-main">
      <section className="fsx-hero">
        <div>
          <div className="fsx-eyebrow">FreeSloTeX</div>
          <div className="fsx-workspace-title-row">
            <h1 className="fsx-title">My workspace</h1>
            <span className={`fsx-plan-badge fsx-plan-${fsPlan}`} title="FreeSloTeX plan">
              {fsPlanText}
            </span>
          </div>
          <p className="fsx-account-line">{fsAccountEmail || "Unknown account"}</p>
          {fsPlan === "admin" ? (
            <p className="fsx-admin-workspace-link">
              <Link className="fsx-admin-mini-link" href="/admin/freeslotex">
                FreeSloTeX Admin
              </Link>
            </p>
          ) : null}
          <p className="fsx-subtitle">
            This is your personal workspace. Private projects and shared projects
            are separated for privacy.
          </p>
        </div>

        <div className="fsx-actions">
          <Link href="/projects/new" className="fsx-button fsx-button-primary">
            New Project
          </Link>
          <form action="/api/logout" method="post">
            <button type="submit" className="fsx-button">
              Logout
            </button>
          </form>
        </div>
      </section>

      <section className="fsx-panel">
        <div className="fsx-panel-head">
          <div>
            <h2 className="fsx-panel-title">My workspace: user-{userId}</h2>
            <p className="fsx-panel-note">
              This is the personal workspace folder prepared for your account.
            </p>
          </div>
        </div>

        <div className="fsx-card" style={{ marginTop: 12 }}>
          <strong>Folders</strong>
          <div className="fsx-meta fsx-meta-line">
            <span><code>private/</code> your own projects</span>
            <span><code>shared/</code> projects shared with you</span>
          </div>
        </div>

        <details className="fsx-advanced" open>
          <summary>Server folder</summary>
          <div style={{ marginTop: 8, wordBreak: "break-all" }}>
            <span className="fsx-code">{root}</span>
          </div>
        </details>
      </section>

      <div className="fsx-row">
        <div className="fsx-count">
          {privateProjects.length} private / {sharedProjects.length} shared
        </div>
        <div className="fsx-muted">
          Signed in as <strong>{user.email}</strong>
        </div>
      </div>

      <section className="fsx-panel">
        <div className="fsx-panel-head">
          <div>
            <h2 className="fsx-panel-title">Private projects</h2>
            <p className="fsx-panel-note">
              These projects are visible only in your own workspace.
            </p>
          </div>
        </div>

        {privateProjects.length === 0 ? (
          <div className="fsx-empty-box">No private projects yet.</div>
        ) : (
          <div className="fsx-grid">
            {privateProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      <section className="fsx-panel">
        <div className="fsx-panel-head">
          <div>
            <h2 className="fsx-panel-title">Shared projects</h2>
            <p className="fsx-panel-note">
              These projects are visible because you are listed as a member.
            </p>
          </div>
        </div>

        {sharedProjects.length === 0 ? (
          <div className="fsx-empty-box">No shared projects yet.</div>
        ) : (
          <div className="fsx-grid">
            {sharedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
