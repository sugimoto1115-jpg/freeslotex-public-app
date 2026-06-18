import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { Buffer } from "node:buffer";
import { mkdir, stat, writeFile } from "node:fs/promises";
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

const ALLOWED_EXTENSIONS = new Set([
  ".tex",
  ".bib",
  ".sty",
  ".cls",
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".tsv",
  ".yml",
  ".yaml",
  ".png",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".eps",
  ".svg",
]);

function makeUrl(request: NextRequest, pathname: string) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "labtex.freeslot-schedule.com";

  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.includes("freeslot-schedule.com") ? "https" : "http");

  return new URL(pathname, `${proto}://${host}`);
}

function redirectToProject(request: NextRequest, projectId: string, search: Record<string, string>) {
  const url = makeUrl(request, `/projects/${projectId}`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

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

function normalizeUploadPath(value: string | null | undefined, fallbackName: string) {
  const fallback = path.basename(fallbackName || "upload.bin")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120) || "upload.bin";

  const raw = (value || fallback).replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = raw.split("/");

  if (
    !raw ||
    raw.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid file path.");
  }

  const ext = path.extname(raw).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("Unsupported file type.");
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

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return redirectToProject(request, id, { error: "bad_project" });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
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
    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const currentUserId = Number(userResult.rows[0].id);
  const project = await getProjectForUser(projectId, currentUserId);

  if (!project) {
    return redirectToProject(request, id, { error: "forbidden" });
  }

  const canEdit = project.my_role === "owner" || project.my_role === "editor";
  if (!canEdit) {
    return redirectToProject(request, id, { error: "readonly" });
  }

  const formData = await request.formData().catch(() => null);
  const uploaded = formData?.get("file");
  const overwrite = String(formData?.get("overwrite") ?? "") === "1";

  if (!(uploaded instanceof File)) {
    return redirectToProject(request, id, { error: "missing_file" });
  }

  if (uploaded.size <= 0) {
    return redirectToProject(request, id, { error: "empty_file" });
  }

  if (uploaded.size > 25 * 1024 * 1024) {
    return redirectToProject(request, id, { error: "too_large" });
  }

  let relativePath = "";

  try {
    relativePath = normalizeUploadPath(
      typeof formData?.get("relativePath") === "string"
        ? String(formData.get("relativePath"))
        : null,
      uploaded.name
    );
  } catch {
    return redirectToProject(request, id, { error: "bad_upload_path" });
  }

  const projectDir = resolveProjectDir(project.storage_path);
  const targetPath = resolveProjectFile(projectDir, relativePath);

  const existing = await stat(targetPath).catch(() => null);
  if (existing && !overwrite) {
    return redirectToProject(request, id, { error: "file_exists" });
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const bytes = Buffer.from(await uploaded.arrayBuffer());
  await writeFile(targetPath, bytes);

  await query(
    `
      update projects
      set updated_at = now()
      where id = $1
    `,
    [projectId]
  );

  return redirectToProject(request, id, { uploaded: relativePath });
}
