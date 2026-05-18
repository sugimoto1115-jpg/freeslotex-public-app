import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: number;
};

type ProjectAccessRow = {
  id: number;
  storage_path: string;
  owner_user_id: number;
  my_role: "owner" | "editor" | "viewer" | null;
};

const TEXT_EXTENSIONS = new Set([
  ".tex",
  ".bib",
  ".sty",
  ".cls",
  ".md",
  ".txt",
  ".log",
  ".aux",
  ".out",
  ".fls",
  ".json",
  ".csv",
  ".tsv",
  ".yml",
  ".yaml",
]);

function getWorkspacesRoot() {
  return process.env.LABTEX_WORKSPACES_ROOT || "/home/tomoyuki/labtex/workspaces";
}

function resolveProjectDir(storagePath: string) {
  const root = path.resolve(getWorkspacesRoot());
  const full = path.resolve(root, storagePath);

  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Resolved project path is outside LABTEX_WORKSPACES_ROOT.");
  }

  return full;
}

function normalizeRelativePath(value: string | null) {
  const raw = (value || "main.tex").replace(/\\/g, "/").replace(/^\/+/, "");

  if (!raw || raw.includes("\0") || raw.split("/").some((part) => part === "..")) {
    throw new Error("Invalid file path.");
  }

  return raw;
}

function resolveProjectFile(projectDir: string, relativePath: string) {
  const full = path.resolve(projectDir, relativePath);

  if (full !== projectDir && !full.startsWith(projectDir + path.sep)) {
    throw new Error("Resolved file path is outside project directory.");
  }

  return full;
}

function isTextLike(relativePath: string) {
  const base = path.basename(relativePath);
  const ext = path.extname(relativePath).toLowerCase();

  if (base === ".gitignore") return true;
  if (relativePath.endsWith(".fdb_latexmk")) return true;
  if (relativePath.endsWith(".code-workspace")) return true;

  return TEXT_EXTENSIONS.has(ext);
}

async function getProjectForUser(projectId: number, currentUserId: number) {
  const projectResult = await query<ProjectAccessRow>(
    `
      select
        p.id,
        p.storage_path,
        p.owner_user_id,
        case
          when p.owner_user_id = $2 then 'owner'
          else pm.role
        end as my_role
      from projects p
      left join project_members pm
        on pm.project_id = p.id
       and pm.user_id = $2
      where p.id = $1
        and p.status = 'active'
        and (
          p.owner_user_id = $2
          or pm.user_id is not null
        )
      limit 1
    `,
    [projectId, currentUserId]
  );

  return projectResult.rows[0] ?? null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_project" }, { status: 400 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
  }

  const userResult = await query<UserRow>(
    `
      select id
      from users
      where lower(email) = lower($1)
      limit 1
    `,
    [currentUser.email]
  );

  if (userResult.rows.length === 0) {
    return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
  }

  const currentUserId = Number(userResult.rows[0].id);
  const project = await getProjectForUser(projectId, currentUserId);

  if (!project) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let relativePath = "";

  try {
    relativePath = normalizeRelativePath(request.nextUrl.searchParams.get("path"));
  } catch {
    return NextResponse.json({ ok: false, error: "bad_path" }, { status: 400 });
  }

  if (!isTextLike(relativePath)) {
    return NextResponse.json(
      { ok: false, error: "unsupported", message: "This file type is not opened as text." },
      { status: 415 }
    );
  }

  const projectDir = resolveProjectDir(project.storage_path);
  const fullPath = resolveProjectFile(projectDir, relativePath);
  const st = await stat(fullPath).catch(() => null);

  if (!st || !st.isFile()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (st.size > 2_000_000) {
    return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  }

  const content = await readFile(fullPath, "utf8");

  return NextResponse.json({
    ok: true,
    relativePath,
    name: path.basename(relativePath),
    size: st.size,
    updatedAt: st.mtime.toISOString(),
    content,
  });
}
