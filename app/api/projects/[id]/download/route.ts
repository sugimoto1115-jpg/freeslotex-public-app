import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type UserRow = {
  id: number;
};

type ProjectRow = {
  id: number;
  owner_user_id: number | null;
  status: string;
  storage_path: string | null;
};

type ZipSourceFile = {
  relativePath: string;
  absolutePath: string;
  updatedAt: Date;
};

const MAX_FILES = 2000;
const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

const EXCLUDED_EXTENSIONS = new Set([
  ".aux",
  ".log",
  ".out",
  ".toc",
  ".fls",
  ".fdb_latexmk",
  ".lof",
  ".lot",
]);

function getWorkspacesRoot() {
  return process.env.LABTEX_WORKSPACES_ROOT || "/home/tomoyuki/labtex/workspaces";
}

function resolveWorkspacePath(storagePath: string) {
  const root = path.resolve(getWorkspacesRoot());

  if (path.isAbsolute(storagePath)) {
    return path.resolve(storagePath);
  }

  const resolved = path.resolve(root, storagePath);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("bad_storage_path");
  }

  return resolved;
}

function sanitizeZipName(value: string) {
  const safe = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || "project";
}

function shouldExclude(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const baseName = parts[parts.length - 1]?.toLowerCase() ?? "";

  if (!baseName) return true;
  if (baseName === ".ds_store") return true;
  if (baseName.endsWith("~")) return true;
  if (baseName.endsWith(".synctex.gz")) return true;

  if (
    parts.some(
      (part) =>
        part === ".git" ||
        part === "node_modules" ||
        part === ".next" ||
        part === "__MACOSX"
    )
  ) {
    return true;
  }

  return EXCLUDED_EXTENSIONS.has(path.extname(baseName));
}

async function collectZipSourceFiles(baseDir: string) {
  const files: ZipSourceFile[] = [];
  let totalBytes = 0;

  async function walk(currentDir: string) {
    const dirents = await readdir(currentDir, { withFileTypes: true });

    dirents.sort((a, b) => {
      const aRank = a.isDirectory() ? 0 : 1;
      const bRank = b.isDirectory() ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });

    for (const dirent of dirents) {
      if (files.length >= MAX_FILES) {
        throw new Error("too_many_files");
      }

      if (dirent.isSymbolicLink()) {
        continue;
      }

      const absolutePath = path.join(currentDir, dirent.name);
      const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, "/");

      if (!relativePath || shouldExclude(relativePath)) {
        continue;
      }

      if (dirent.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!dirent.isFile()) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      totalBytes += fileStat.size;

      if (totalBytes > MAX_SOURCE_BYTES) {
        throw new Error("too_large");
      }

      files.push({
        relativePath,
        absolutePath,
        updatedAt: fileStat.mtime,
      });
    }
  }

  await walk(baseDir);

  return files;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let c = i;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[i] = c >>> 0;
  }

  return table;
})();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);

  const dosDate = ((year - 1980) << 9) | (month << 5) | day;

  return { dosTime, dosDate };
}

function makeZip(entries: Array<{ relativePath: string; data: Buffer; updatedAt: Date }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedPath = entry.relativePath
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/");

    if (!normalizedPath || normalizedPath.includes("../")) {
      throw new Error("bad_zip_path");
    }

    const nameBuffer = Buffer.from(normalizedPath, "utf8");
    const data = entry.data;
    const checksum = crc32(data);
    const { dosTime, dosDate } = toDosDateTime(entry.updatedAt);
    const generalPurposeFlag = 0x0800;
    const compressionMethod = 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(generalPurposeFlag, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(generalPurposeFlag, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectorySize = centralDirectory.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function getCurrentUserId() {
  const currentUser = await getCurrentUser();

  if (!currentUser?.email) {
    return null;
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

  return userResult.rows.length > 0 ? Number(userResult.rows[0].id) : null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = Number(id);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    return new NextResponse("Bad project id.", { status: 400 });
  }

  const currentUserId = await getCurrentUserId();

  if (currentUserId === null) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const projectResult = await query<ProjectRow>(
    `
      select p.id, p.owner_user_id, p.status, p.storage_path
      from projects p
      left join project_members pm
        on pm.project_id = p.id
       and pm.user_id = $2
      where p.id = $1
        and (
          p.owner_user_id = $2
          or pm.user_id is not null
        )
      limit 1
    `,
    [projectId, currentUserId]
  );

  if (projectResult.rows.length === 0) {
    return new NextResponse("Project not found.", { status: 404 });
  }

  const project = projectResult.rows[0];

  if (project.status !== "active") {
    return new NextResponse("Project is not active.", { status: 409 });
  }

  if (!project.storage_path) {
    return new NextResponse("Project storage path is empty.", { status: 404 });
  }

  try {
    const workspaceDir = resolveWorkspacePath(project.storage_path);
    const workspaceStat = await stat(workspaceDir).catch(() => null);

    if (!workspaceStat?.isDirectory()) {
      return new NextResponse("Project workspace was not found.", { status: 404 });
    }

    const sourceFiles = await collectZipSourceFiles(workspaceDir);

    if (sourceFiles.length === 0) {
      return new NextResponse("Project workspace has no downloadable files.", { status: 404 });
    }

    const zipEntries = await Promise.all(
      sourceFiles.map(async (file) => ({
        relativePath: file.relativePath,
        data: await readFile(file.absolutePath),
        updatedAt: file.updatedAt,
      }))
    );

    const zipBuffer = makeZip(zipEntries);
    const fileName = `${sanitizeZipName(`project-${projectId}`)}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(zipBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message === "too_many_files") {
      return new NextResponse("Project has too many files to download.", { status: 413 });
    }

    if (message === "too_large") {
      return new NextResponse("Project is too large to download.", { status: 413 });
    }

    if (message === "bad_storage_path" || message === "bad_zip_path") {
      return new NextResponse("Project storage path is invalid.", { status: 400 });
    }

    console.error("Project ZIP download failed", error);
    return new NextResponse("Project ZIP download failed.", { status: 500 });
  }
}
