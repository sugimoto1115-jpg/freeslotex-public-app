import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import * as dbLib from "@/lib/db";
import * as authLib from "@/lib/auth";
import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import ProjectMembersSection from "./ProjectMembersSection";

export const runtime = "nodejs";


function getWorkspacesRoot() {
  return process.env.LABTEX_WORKSPACES_ROOT || "/home/tomoyuki/labtex/workspaces";
}

function resolveWorkspacePath(storagePath: string) {
  if (!storagePath) return storagePath;
  if (path.isAbsolute(storagePath)) return storagePath;
  return path.join(getWorkspacesRoot(), storagePath);
}

type Row = Record<string, unknown>;
type QueryResult = { rows: Row[] };
type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  release?: () => void;
};

type WorkspaceEntry = {
  relativePath: string;
  name: string;
  kind: "dir" | "file";
  size: number | null;
  updatedAt: Date | null;
  depth: number;
};

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeId(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;

  const obj = asRecord(value);
  if (!obj) return null;

  const directCandidates = [
    obj.id,
    obj.userId,
    obj.user_id,
    obj.projectId,
    obj.project_id,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" || typeof candidate === "number") {
      return candidate;
    }
  }

  const nestedUser = asRecord(obj.user);
  if (nestedUser) {
    const nestedCandidates = [nestedUser.id, nestedUser.userId, nestedUser.user_id];
    for (const candidate of nestedCandidates) {
      if (typeof candidate === "string" || typeof candidate === "number") {
        return candidate;
      }
    }
  }

  return null;
}

async function maybeCall(fn: unknown): Promise<unknown> {
  if (typeof fn !== "function") return undefined;

  try {
    return await (fn as () => Promise<unknown>)();
  } catch {
    return undefined;
  }
}

async function resolveCurrentUserId(): Promise<string | number | null> {
  try {
    const currentUser = await authLib.getCurrentUser();
    if (!currentUser?.email) {
      return null;
    }

    const db = await getDbHandle();
    try {
      const result = await db.client.query(
        `
          select id
          from users
          where lower(email) = lower($1)
          limit 1
        `,
        [currentUser.email]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const id = normalizeId((row as Record<string, unknown>).id ?? row);
      return id;
    } finally {
      if (db.transactional) {
        db.client.release?.();
      }
    }
  } catch {
    return null;
  }
}

async function getDbHandle(): Promise<{ client: Queryable; transactional: boolean }> {
  const dbAny = dbLib as Record<string, unknown>;

  const pool = dbAny.pool ?? dbAny.db ?? dbAny.pgPool ?? dbAny.default;

  if (pool && typeof (pool as { connect?: unknown }).connect === "function") {
    const client = await (pool as { connect: () => Promise<Queryable> }).connect();
    return { client, transactional: true };
  }

  if (typeof dbAny.query === "function") {
    return {
      client: {
        query: (sql: string, params?: unknown[]) =>
          (dbAny.query as (sql: string, params?: unknown[]) => Promise<QueryResult>)(sql, params),
      },
      transactional: false,
    };
  }

  throw new Error(
    "No usable database handle found in @/lib/db. Export pool.connect() or query()."
  );
}

async function getColumns(client: Queryable, tableName: string): Promise<Set<string>> {
  const result = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = $1
    `,
    [tableName]
  );

  return new Set(result.rows.map((row) => String(row.column_name)));
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDate(value: Date | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatBytes(value: number | null): string {
  if (value === null) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function collectWorkspaceEntries(
  baseDir: string,
  maxDepth = 4,
  maxItems = 300
): Promise<{ entries: WorkspaceEntry[]; latestUpdatedAt: Date | null; truncated: boolean }> {
  const entries: WorkspaceEntry[] = [];
  let latestUpdatedAt: Date | null = null;
  let truncated = false;

  async function walk(currentDir: string, depth: number) {
    if (truncated) return;

    const dirents = await readdir(currentDir, { withFileTypes: true });
    dirents.sort((a, b) => {
      const aRank = a.isDirectory() ? 0 : 1;
      const bRank = b.isDirectory() ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });

    for (const dirent of dirents) {
      if (entries.length >= maxItems) {
        truncated = true;
        return;
      }

      const absolutePath = path.join(currentDir, dirent.name);
      const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, "/");
      const stats = await stat(absolutePath).catch(() => null);
      const updatedAt = stats?.mtime ?? null;

      if (updatedAt && (!latestUpdatedAt || updatedAt > latestUpdatedAt)) {
        latestUpdatedAt = updatedAt;
      }

      entries.push({
        relativePath,
        name: dirent.name,
        kind: dirent.isDirectory() ? "dir" : "file",
        size: dirent.isDirectory() ? null : stats?.size ?? null,
        updatedAt,
        depth,
      });

      if (dirent.isDirectory() && depth < maxDepth) {
        await walk(absolutePath, depth + 1);
        if (truncated) return;
      }
    }
  }

  await walk(baseDir, 0);

  return { entries, latestUpdatedAt, truncated };
}

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = await params;

  const userId = await resolveCurrentUserId();
  if (userId === null) {
    redirect("/login");
  }

  let client: Queryable | null = null;

  try {
    const db = await getDbHandle();
    client = db.client;

    const projectColumns = await getColumns(client, "projects");
    const memberColumns = await getColumns(client, "project_members");

    if (!projectColumns.size || !memberColumns.size) {
      throw new Error('Required tables "projects" or "project_members" were not found.');
    }

    const projectKeyColumn = projectColumns.has("id")
      ? "id"
      : projectColumns.has("project_id")
        ? "project_id"
        : null;

    if (!projectKeyColumn) {
      throw new Error('projects table needs "id" or "project_id".');
    }

    const accessChecks: string[] = [];
    if (projectColumns.has("owner_user_id")) {
      accessChecks.push(`p.${quoteIdent("owner_user_id")} = $2`);
    }
    if (projectColumns.has("user_id")) {
      accessChecks.push(`p.${quoteIdent("user_id")} = $2`);
    }
    accessChecks.push(`pm.${quoteIdent("user_id")} IS NOT NULL`);

    const sql = `
      SELECT p.*
      FROM ${quoteIdent("projects")} p
      LEFT JOIN ${quoteIdent("project_members")} pm
        ON pm.${quoteIdent("project_id")} = p.${quoteIdent(projectKeyColumn)}
       AND pm.${quoteIdent("user_id")} = $2
      WHERE p.${quoteIdent(projectKeyColumn)} = $1
        AND (${accessChecks.join(" OR ")})
      LIMIT 1
    `;

    const result = await client.query(sql, [id, userId]);
    const project = result.rows[0] ?? null;

    if (!project) {
      notFound();
    }

    if (projectColumns.has("last_opened_at")) {
      await client.query(
        `UPDATE ${quoteIdent("projects")}
            SET ${quoteIdent("last_opened_at")} = NOW()
          WHERE ${quoteIdent(projectKeyColumn)} = $1`,
        [id]
      );
      project.last_opened_at = new Date();
    }

    const projectId =
      normalizeId(project) ??
      (project[projectKeyColumn] as string | number | undefined) ??
      id;

    const projectName =
      (typeof project.name === "string" && project.name.trim()) ||
      (typeof project.title === "string" && project.title.trim()) ||
      `Project ${projectId}`;

    const storagePath =
      typeof project.storage_path === "string" ? project.storage_path : "";

      const editorUrl = `/projects/${id}/edit`;

    const lastOpenedAt = toDate(project.last_opened_at);

    let workspaceEntries: WorkspaceEntry[] = [];
    let workspaceLatestUpdatedAt: Date | null = null;
    let workspaceTruncated = false;
    let workspaceError = "";

    if (storagePath) {
      try {
        const collected = await collectWorkspaceEntries(resolveWorkspacePath(storagePath));
        workspaceEntries = collected.entries;
        workspaceLatestUpdatedAt = collected.latestUpdatedAt;
        workspaceTruncated = collected.truncated;
      } catch (error) {
        workspaceError =
          error instanceof Error
            ? error.message
            : "Workspace could not be read.";
      }
    } else {
      workspaceError = "storage_path is empty.";
    }

    const mainTexExists = workspaceEntries.some(
      (entry) => entry.kind === "file" && entry.relativePath === "main.tex"
    );

    return (
      <main className="fsx-main">
        <section className="fsx-detail-hero">
          <div className="fsx-detail-head">
            <div>
              <div className="fsx-eyebrow">FreeSloTeX</div>
              <div className="fsx-breadcrumb">
                <Link href="/projects">Back to Projects</Link>
                <span>/</span>
                <span>Project ID: <span className="fsx-code">{String(projectId)}</span></span>
              </div>

              <h1 className="fsx-detail-title">{projectName}</h1>
              <p className="fsx-detail-subtitle">
                Edit files, compile TeX, and manage project members.
              </p>
            </div>

            <div className="fsx-actions">
              <Link
                href={editorUrl}
                target="_blank"
                rel="noreferrer"
                className="fsx-button fsx-button-primary fsx-primary-action"
              >
                Edit main.tex
              </Link>
              <Link href="/projects" className="fsx-button">
                Projects
              </Link>
            </div>
          </div>
        </section>

        <section className="fsx-stat-grid">
          <div className="fsx-stat-card">
            <div className="fsx-stat-label">Main file</div>
            <div className="fsx-stat-value">main.tex: {mainTexExists ? "Yes" : "No"}</div>
            <div className="fsx-stat-small">Open the editor to edit and compile.</div>
          </div>

          <div className="fsx-stat-card">
            <div className="fsx-stat-label">Workspace</div>
            <div className="fsx-stat-value">{workspaceEntries.length} entries</div>
            <div className="fsx-stat-small">Updated: {formatDate(workspaceLatestUpdatedAt)}</div>
          </div>

          <div className="fsx-stat-card">
            <div className="fsx-stat-label">Last opened</div>
            <div className="fsx-stat-value">{formatDate(lastOpenedAt)}</div>
            <div className="fsx-stat-small">Project status is active.</div>
          </div>
        </section>

        <section className="fsx-panel">
          <div className="fsx-panel-head">
            <div>
              <h2 className="fsx-panel-title">Workspace files</h2>
              <p className="fsx-panel-note">Files in this project workspace.</p>
            </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <form
                  action={`/api/projects/${id}/files/upload`}
                  method="post"
                  encType="multipart/form-data"
                  style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                >
                  <input
                    type="file"
                    name="file"
                    accept=".tex,.bib,.sty,.cls,.md,.txt,.json,.csv,.tsv,.yml,.yaml,.png,.jpg,.jpeg,.pdf,.eps,.svg"
                    className="fsx-button"
                    required
                  />
                  <label className="fsx-panel-note" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="checkbox" name="overwrite" value="1" />
                    overwrite
                  </label>
                  <button type="submit" className="fsx-button">
                    Upload file
                  </button>
                </form>

                <Link
                  href={editorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="fsx-button fsx-button-primary"
                >
                  Edit main.tex
                </Link>
              </div>
          </div>

          {workspaceError ? (
            <div className="fsx-alert">
              Workspace could not be read: {workspaceError}
            </div>
          ) : workspaceEntries.length === 0 ? (
            <div className="fsx-empty-box">Workspace is empty.</div>
          ) : (
            <div className="fsx-table-wrap">
              <div className="fsx-table-scroll">
                <table className="fsx-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Path</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Updated</th>
                        <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaceEntries.map((entry) => (
                      <tr key={entry.relativePath}>
                        <td>
                          <div style={{ paddingLeft: `${entry.depth * 1.0}rem` }}>
                            <span className="fsx-code">
                              {entry.kind === "dir" ? "[DIR]" : "[FILE]"}
                            </span>{" "}
                            <strong>{entry.name}</strong>
                          </div>
                        </td>
                        <td className="fsx-code">{entry.relativePath}</td>
                        <td>{entry.kind}</td>
                        <td>{formatBytes(entry.size)}</td>
                        <td>{formatDate(entry.updatedAt)}</td>
                          <td>
                            {entry.kind === "file" ? (
                              <form action={`/api/projects/${id}/files/delete`} method="post">
                                <input type="hidden" name="relativePath" value={entry.relativePath} />
                                <button type="submit" className="fsx-button" style={{ padding: "4px 8px", fontSize: 12 }}>
                                  Delete
                                </button>
                              </form>
                            ) : (
                              "-"
                            )}
                          </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {workspaceTruncated ? (
            <p className="fsx-panel-note">
              Only part of the workspace is shown because there are many files.
            </p>
          ) : null}

          <details className="fsx-advanced">
            <summary>Advanced details</summary>
            <div style={{ marginTop: 8, wordBreak: "break-all" }}>
              storage_path: <span className="fsx-code">{storagePath || "-"}</span>
            </div>
          </details>
        </section>

        <ProjectMembersSection projectId={id} />
      </main>
    );
  } finally {
    try {
      client?.release?.();
    } catch {
      // ignore release error
    }
  }
}
