import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { writeFile } from "node:fs/promises";
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

const EDITABLE_EXTENSIONS = new Set([
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

function wantsJson(request: NextRequest) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("content-type")?.includes("application/json")
  );
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

function normalizeRelativePath(value: string | null | undefined) {
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

function isEditableTextPath(relativePath: string) {
  const base = path.basename(relativePath);
  const ext = path.extname(relativePath).toLowerCase();

  if (base === ".gitignore") return true;
  if (relativePath.endsWith(".code-workspace")) return true;

  return EDITABLE_EXTENSIONS.has(ext);
}

function redirectToEdit(request: NextRequest, projectId: string, search: Record<string, string>) {
  const url = makeUrl(request, `/projects/${projectId}/edit`);
  for (const [key, value] of Object.entries(search)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

function errorResponse(request: NextRequest, projectId: string, code: string, status = 400) {
  if (wantsJson(request)) {
    return NextResponse.json({ ok: false, error: code }, { status });
  }

  return redirectToEdit(request, projectId, { error: code });
}

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);

    return {
      content: typeof body?.content === "string" ? body.content : "",
      relativePath:
        typeof body?.relativePath === "string" ? body.relativePath : "main.tex",
    };
  }

  const formData = await request.formData();

  return {
    content: String(formData.get("content") ?? ""),
    relativePath: String(formData.get("relativePath") ?? "main.tex"),
  };
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return errorResponse(request, id, "bad_project", 400);
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    if (wantsJson(request)) {
      return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
    }

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
    if (wantsJson(request)) {
      return NextResponse.json({ ok: false, error: "login_required" }, { status: 401 });
    }

    return NextResponse.redirect(makeUrl(request, "/login"), 303);
  }

  const currentUserId = Number(userResult.rows[0].id);

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

  if (projectResult.rows.length === 0) {
    return errorResponse(request, id, "forbidden", 403);
  }

  const project = projectResult.rows[0];
  const canEdit = project.my_role === "owner" || project.my_role === "editor";

  if (!canEdit) {
    return errorResponse(request, id, "readonly", 403);
  }

  const { content, relativePath: rawRelativePath } = await readPayload(request);

  if (content.length > 2_000_000) {
    return errorResponse(request, id, "too_large", 413);
  }

  let relativePath = "main.tex";

  try {
    relativePath = normalizeRelativePath(rawRelativePath);
  } catch {
    return errorResponse(request, id, "bad_path", 400);
  }

  if (!isEditableTextPath(relativePath)) {
    return errorResponse(request, id, "readonly_file", 415);
  }

  const projectDir = resolveProjectDir(project.storage_path);
  const targetPath = resolveProjectFile(projectDir, relativePath);

  await writeFile(targetPath, content, "utf8");

  await query(
    `
      update projects
      set updated_at = now()
      where id = $1
    `,
    [projectId]
  );

  if (wantsJson(request)) {
    return NextResponse.json({
      ok: true,
      relativePath,
      message: `Saved ${relativePath}.`,
    });
  }

  return redirectToEdit(request, id, { saved: "1" });
}
