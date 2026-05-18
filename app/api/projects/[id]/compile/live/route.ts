import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readFile, writeFile, rm, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

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

function tail(text: string, lines = 140) {
  const xs = text.split(/\r\n|\r|\n/);
  return xs.slice(Math.max(0, xs.length - lines)).join("\n");
}

function detectCompileScript(tex: string) {
  const cls = tex.match(/\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/)?.[1] ?? "";

  const hasJapaneseOrFullwidth =
    /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(tex);

  if (/^ltjs(article|book|report)$/.test(cls) || tex.includes("\\usepackage{luatexja}")) {
    return {
      engine: "lualatex",
      script: "latexmk -C || true; latexmk -lualatex -interaction=nonstopmode -halt-on-error main.tex",
    };
  }

  if (/^(u)?p?js(article|book|report)$/.test(cls) || /^(jarticle|jbook|jreport)$/.test(cls)) {
    return {
      engine: "uplatex+dvipdfmx",
      script:
        "latexmk -C || true; latexmk -pdfdvi -latex='uplatex -interaction=nonstopmode -halt-on-error %O %S' -dvipdf='dvipdfmx %O -o %D %S' main.tex",
    };
  }

  if (hasJapaneseOrFullwidth) {
    return {
      engine: "lualatex-auto-unicode",
      script: "latexmk -C || true; latexmk -lualatex -interaction=nonstopmode -halt-on-error main.tex",
    };
  }

  return {
    engine: "pdflatex",
    script: "latexmk -C || true; latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex",
  };
}

function extractLatexErrorSummary(text: string) {
  const lines = text.split(/\r\n|\r|\n/);

  const patterns = [
    /^! /,
    /LaTeX Error:/,
    /Package .* Error:/,
    /Undefined control sequence/,
    /Emergency stop/,
    /Fatal error occurred/,
    /Missing .* inserted/,
    /File .* not found/,
    /Runaway argument/,
    /No pages of output/,
    /Command .* returned with error/,
  ];

  const hit = lines.findIndex((line) => patterns.some((pattern) => pattern.test(line)));

  if (hit >= 0) {
    const start = Math.max(0, hit - 8);
    const end = Math.min(lines.length, hit + 24);
    return [
      "FreeSloTeX compile error summary",
      "",
      "First likely error:",
      "",
      ...lines.slice(start, end),
      "",
      "Hint:",
      "Check the line beginning with `!` and the nearby `l.<number>` line.",
    ].join("\n").slice(0, 16000);
  }

  return [
    "FreeSloTeX compile error summary",
    "",
    "No standard LaTeX error pattern was found.",
    "Showing the last part of the compile output:",
    "",
    ...lines.slice(-120),
  ].join("\n").slice(0, 16000);
}

async function getProjectForEdit(projectId: number, currentUserId: number) {
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

async function readArtifacts(projectDir: string) {
  const fsxLog = await readFile(path.join(projectDir, "freeslotex-compile.log"), "utf8").catch(() => "");
  const texLog = await readFile(path.join(projectDir, "main.log"), "utf8").catch(() => "");
  const pdfExists = await stat(path.join(projectDir, "main.pdf")).then(() => true).catch(() => false);

  return {
    fsxLogTail: tail(fsxLog),
    texLogTail: tail(texLog),
    pdfExists,
  };
}

async function readPostedContent(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (body && typeof body.content === "string") return body.content;
    return null;
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const formData = await request.formData().catch(() => null);
    if (!formData) return null;
    const value = formData.get("content");
    return typeof value === "string" ? value : null;
  }

  return null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json(
      { ok: false, compileError: "bad_project", message: "Project ID is invalid." },
      { status: 400 }
    );
  }

  const currentUser = await getCurrentUser();
  if (!currentUser?.email) {
    return NextResponse.json(
      { ok: false, compileError: "login_required", message: "Login is required." },
      { status: 401 }
    );
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
    return NextResponse.json(
      { ok: false, compileError: "login_required", message: "Login is required." },
      { status: 401 }
    );
  }

  const currentUserId = Number(userResult.rows[0].id);
  const project = await getProjectForEdit(projectId, currentUserId);

  if (!project) {
    return NextResponse.json(
      { ok: false, compileError: "forbidden", message: "You do not have access to this project." },
      { status: 403 }
    );
  }

  const canCompile = project.my_role === "owner" || project.my_role === "editor";
  if (!canCompile) {
    return NextResponse.json(
      { ok: false, compileError: "readonly", message: "Viewer role cannot compile this project." },
      { status: 403 }
    );
  }

  const projectDir = resolveProjectDir(project.storage_path);
  const mainTexPath = path.join(projectDir, "main.tex");

  let tex = await readPostedContent(request);

  if (tex !== null) {
    if (tex.length > 2_000_000) {
      return NextResponse.json(
        { ok: false, compileError: "too_large", message: "The file is too large to compile." },
        { status: 413 }
      );
    }

    await writeFile(mainTexPath, tex, "utf8");
  } else {
    try {
      tex = await readFile(mainTexPath, "utf8");
    } catch {
      return NextResponse.json(
        { ok: false, compileError: "missing_main", message: "main.tex was not found." },
        { status: 404 }
      );
    }
  }

  await query(
    `
      update projects
      set updated_at = now()
      where id = $1
    `,
    [projectId]
  );

  const { engine, script } = detectCompileScript(tex);

  await rm(path.join(projectDir, "main.pdf"), { force: true }).catch(() => {});
  await rm(path.join(projectDir, "freeslotex-error-summary.txt"), { force: true }).catch(() => {});

  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  const gid = typeof process.getgid === "function" ? process.getgid() : 1000;

  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--user",
    `${uid}:${gid}`,
    "--entrypoint",
    "/bin/bash",
    "-v",
    `${projectDir}:/work`,
    "-w",
    "/work",
    "texcode-texlive:1",
    "-lc",
    script,
  ];

  const startedAt = new Date();

  try {
    const result = await execFileAsync("docker", args, {
      timeout: 120_000,
      maxBuffer: 3 * 1024 * 1024,
    });

    const log = [
      `FreeSloTeX compile`,
      `started_at: ${startedAt.toISOString()}`,
      `finished_at: ${new Date().toISOString()}`,
      `engine: ${engine}`,
      `command: ${script}`,
      ``,
      `===== stdout =====`,
      result.stdout ?? "",
      ``,
      `===== stderr =====`,
      result.stderr ?? "",
      ``,
    ].join("\n");

    await writeFile(path.join(projectDir, "freeslotex-compile.log"), log, "utf8");
    await rm(path.join(projectDir, "freeslotex-error-summary.txt"), { force: true }).catch(() => {});

    const artifacts = await readArtifacts(projectDir);

    return NextResponse.json({
      ok: true,
      engine,
      compileError: null,
      compileErrorSummary: "",
      message: `Compiled successfully with ${engine}.`,
      ...artifacts,
    });
  } catch (error: any) {
    const log = [
      `FreeSloTeX compile failed`,
      `started_at: ${startedAt.toISOString()}`,
      `finished_at: ${new Date().toISOString()}`,
      `engine: ${engine}`,
      `command: ${script}`,
      `message: ${String(error?.message ?? error)}`,
      ``,
      `===== stdout =====`,
      String(error?.stdout ?? ""),
      ``,
      `===== stderr =====`,
      String(error?.stderr ?? ""),
      ``,
    ].join("\n");

    await writeFile(path.join(projectDir, "freeslotex-compile.log"), log, "utf8").catch(() => {});

    const texLogAfterFailure = await readFile(path.join(projectDir, "main.log"), "utf8").catch(() => "");
    const errorSummary = extractLatexErrorSummary(
      [
        String(error?.stdout ?? ""),
        String(error?.stderr ?? ""),
        texLogAfterFailure,
      ].join("\n")
    );

    await writeFile(
      path.join(projectDir, "freeslotex-error-summary.txt"),
      errorSummary,
      "utf8"
    ).catch(() => {});

    await rm(path.join(projectDir, "main.pdf"), { force: true }).catch(() => {});

    const artifacts = await readArtifacts(projectDir);
    const compileError = String(error?.message ?? "").includes("timed out") ? "timeout" : "failed";

    return NextResponse.json({
      ok: false,
      engine,
      compileError,
      compileErrorSummary: errorSummary,
      message:
        compileError === "timeout"
          ? "Compile timed out. Check the terminal below."
          : "Compile failed. Check the terminal below.",
      ...artifacts,
      pdfExists: false,
    });
  }
}
