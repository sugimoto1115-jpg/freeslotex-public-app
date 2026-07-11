import Link from "next/link";
import ArchiveProjectButton from "./ArchiveProjectButton";
import path from "node:path";
import { mkdir, readdir, rm, symlink, lstat, writeFile } from "node:fs/promises";
import { requireUser, getCurrentUser as getLabtexCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fsPlanLabel } from "@/lib/freeslotex/entitlements";
import { getEffectiveFsPlanForEmail } from "@/lib/freeslotex/serverPlan";
import { getCompileQuotaForEmail } from "@/lib/freeslotex/compileQuota";

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
    owner_project_no: number | null;
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

type WorkspaceSortKey = "project" | "name" | "created" | "updated";

const workspaceSortOptions: { key: WorkspaceSortKey; label: string }[] = [
  { key: "project", label: "No." },
  { key: "name", label: "Name" },
  { key: "created", label: "Created" },
  { key: "updated", label: "Updated" },
];

function normalizeWorkspaceSort(value: string | string[] | undefined): WorkspaceSortKey {
  const raw = Array.isArray(value) ? value[0] : value;

  if (raw === "project" || raw === "name" || raw === "created" || raw === "updated") {
    return raw;
  }

  return "updated";
}

function workspaceSortHref(sort: WorkspaceSortKey) {
  return sort === "updated" ? "/workspace" : `/workspace?sort=${sort}`;
}

function dateMs(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function projectNo(project: ProjectRow) {
  return typeof project.owner_project_no === "number" ? project.owner_project_no : Number.POSITIVE_INFINITY;
}

function sortProjects(projects: ProjectRow[], sort: WorkspaceSortKey) {
  return [...projects].sort((a, b) => {
    if (sort === "project") {
      const diff = projectNo(a) - projectNo(b);
      if (diff !== 0) return diff;
      return a.id - b.id;
    }

    if (sort === "name") {
      const diff = a.name.localeCompare(b.name, "ja-JP", {
        numeric: true,
        sensitivity: "base",
      });
      if (diff !== 0) return diff;
      return projectNo(a) - projectNo(b);
    }

    if (sort === "created") {
      const diff = dateMs(a.created_at) - dateMs(b.created_at);
      if (diff !== 0) return diff;
      return a.id - b.id;
    }

    const diff = dateMs(b.updated_at) - dateMs(a.updated_at);
    if (diff !== 0) return diff;
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
    <section className="fsx-card" style={{ padding: "12px 18px" }}>
      <div className="fsx-card-head" style={{ gap: 12 }}>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <Link href={`/projects/${project.id}`} className="fsx-project-name">
              {project.name}
            </Link>
            <span className={roleClass(project.role)}>{roleLabel(project.role)}</span>
            <span className="fsx-pill">{project.visibility}</span>
            <span className="fsx-pill">{project.folder_kind}</span>
          </div>

          <div className="fsx-meta fsx-meta-line" style={{ gap: 18 }}>
            {project.role === "owner" && project.owner_project_no != null ? (
              <span>No. <code>{project.owner_project_no}</code></span>
            ) : null}
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


type WorkspaceCompileQuota = {
  ok?: boolean;
  plan?: string;
  usedToday?: number;
  freeDailyLimit?: number | null;
};

function formatWorkspaceCompileQuota(quota: WorkspaceCompileQuota) {
  if (quota.ok !== true) return "";
  if (quota.plan !== "free") return "";
  if (typeof quota.freeDailyLimit !== "number") return "";

  const usedToday = Number(quota.usedToday ?? 0);
  if (!Number.isFinite(usedToday)) return "";

  return `Free plan: Today ${usedToday}/${quota.freeDailyLimit} compiles`;
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{ sort?: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const workspaceSort = normalizeWorkspaceSort(resolvedSearchParams.sort);

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
        (
          SELECT count(*)::int
          FROM projects p2
          WHERE p2.owner_user_id = p.owner_user_id
            AND (
              p2.created_at < p.created_at
              OR (p2.created_at = p.created_at AND p2.id <= p.id)
            )
        ) AS owner_project_no,
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

  const projects = sortProjects(projectsResult.rows, workspaceSort);
  const root = await refreshUserWorkspace(userId, projects);
  const privateProjects = sortProjects(
    projects.filter((p) => p.folder_kind === "private"),
    workspaceSort
  );
  const sharedProjects = sortProjects(
    projects.filter((p) => p.folder_kind === "shared"),
    workspaceSort
  );

  const fsAccount = await getLabtexCurrentUser();
  const fsAccountEmail = fsAccount?.email ?? "";
  const fsPlan = await getEffectiveFsPlanForEmail(fsAccountEmail);
  const fsPlanText = fsPlanLabel(fsPlan);
  const compileQuota = await getCompileQuotaForEmail(fsAccountEmail);
  const compileQuotaText = formatWorkspaceCompileQuota(compileQuota);


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
          {compileQuotaText ? (
            <p className="fsx-panel-note" style={{ marginTop: 4 }}>
              {compileQuotaText}
            </p>
          ) : null}
            <p className="fsx-panel-note" style={{ marginTop: 4 }}>
              <Link className="fsx-admin-inline-link" href="/account/password">Change password</Link>
            </p>
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

          <div className="fsx-actions" aria-label="Workspace sort" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="fsx-muted" style={{ display: "inline-flex", alignItems: "center", fontWeight: 700, transform: "translateY(3px)" }}>Sort by</span>
            {workspaceSortOptions.map((option) => (
              <Link
                key={option.key}
                href={workspaceSortHref(option.key)}
                className={workspaceSort === option.key ? "fsx-button fsx-button-primary" : "fsx-button"}
                style={{ padding: "4px 8px", fontSize: 12 }}
              >
                {option.label}
              </Link>
            ))}
          </div>
        <div className="fsx-muted">
          Signed in as <strong>{user.email}</strong>
        </div>
      </div>

      <section className="fsx-panel">
        <div className="fsx-panel-head">
          <div>
            <h2 className="fsx-panel-title">Private projects</h2>
          </div>
        </div>

        {privateProjects.length === 0 ? (
          <div className="fsx-empty-box">No private projects yet.</div>
        ) : (
          <div className="fsx-grid" style={{ gap: 10 }}>
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
          <div className="fsx-grid" style={{ gap: 10 }}>
            {sharedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
