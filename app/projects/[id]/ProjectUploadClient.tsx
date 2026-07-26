"use client";

import { useRef, useState } from "react";

type FolderFile = File & {
  webkitRelativePath?: string;
};

type Props = {
  projectId: string;
};

const ALLOWED_EXTENSION_LIST = [
  ".tex",
  ".bib",
  ".sty",
  ".cls",
  ".bst",
  ".png",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".eps",
  ".csv",
  ".tsv",
  ".txt",
  ".dat",
] as const;

const ALLOWED_EXTENSIONS = new Set<string>(ALLOWED_EXTENSION_LIST);
const ALLOWED_EXTENSION_TEXT = ALLOWED_EXTENSION_LIST.join(" ");

const DANGEROUS_EMBEDDED_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".so",
  ".com",
  ".msi",
  ".scr",
  ".bat",
  ".cmd",
  ".sh",
  ".bash",
  ".ps1",
  ".js",
  ".mjs",
  ".cjs",
  ".py",
  ".pl",
  ".php",
  ".cgi",
  ".jar",
  ".class",
  ".vbs",
  ".wsf",
]);

const IGNORED_SYSTEM_FILES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
]);

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_FILES = 500;

function baseName(relativePath: string) {
  return relativePath.replace(/\\/g, "/").split("/").pop() ?? "";
}

function fileExtension(relativePath: string) {
  const name = baseName(relativePath).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function isIgnoredSystemFile(relativePath: string) {
  return IGNORED_SYSTEM_FILES.has(baseName(relativePath).toLowerCase());
}

function hasDangerousEmbeddedExtension(relativePath: string) {
  const parts = baseName(relativePath).toLowerCase().split(".");
  if (parts.length <= 2) return false;

  return parts
    .slice(1, -1)
    .some((part) => DANGEROUS_EMBEDDED_EXTENSIONS.has(`.${part}`));
}

export default function ProjectUploadClient({ projectId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function clearUploadInputs() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }

  async function uploadFiles(files: FileList | null, mode: "files" | "folder") {
    if (!files || files.length === 0 || isUploading) return;

    setUploadError("");

    const selectedEntries = (Array.from(files) as FolderFile[]).map((file) => ({
      file,
      relativePath:
        mode === "folder"
          ? file.webkitRelativePath || file.name
          : file.name,
    }));

    const uploadEntries = selectedEntries.filter(
      (entry) => !isIgnoredSystemFile(entry.relativePath),
    );

    if (uploadEntries.length === 0) {
      setUploadError("No uploadable files were found.");
      clearUploadInputs();
      return;
    }

    if (uploadEntries.length > MAX_UPLOAD_FILES) {
      setUploadError(
        `Upload rejected: a maximum of ${MAX_UPLOAD_FILES} files can be uploaded at once.\nNo files were uploaded.`,
      );
      clearUploadInputs();
      return;
    }

    let totalBytes = 0;

    for (const entry of uploadEntries) {
      const extension = fileExtension(entry.relativePath);

      if (
        !ALLOWED_EXTENSIONS.has(extension) ||
        hasDangerousEmbeddedExtension(entry.relativePath)
      ) {
        setUploadError(
          [
            `Upload rejected: ${entry.relativePath} does not meet the allowed file type requirements.`,
            `Allowed file types: ${ALLOWED_EXTENSION_TEXT}`,
            "No files were uploaded.",
          ].join("\n"),
        );
        clearUploadInputs();
        return;
      }

      if (entry.file.size <= 0) {
        setUploadError(
          `Upload rejected: ${entry.relativePath} is empty.\nNo files were uploaded.`,
        );
        clearUploadInputs();
        return;
      }

      if (entry.file.size > MAX_FILE_BYTES) {
        setUploadError(
          `Upload rejected: ${entry.relativePath} exceeds 25 MB.\nNo files were uploaded.`,
        );
        clearUploadInputs();
        return;
      }

      totalBytes += entry.file.size;
    }

    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      setUploadError(
        "Upload rejected: the selected files exceed 100 MB in total.\nNo files were uploaded.",
      );
      clearUploadInputs();
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();

      for (const entry of uploadEntries) {
        formData.append("file", entry.file);
        formData.append("relativePath", entry.relativePath);
      }

      if (overwrite) {
        formData.append("overwrite", "1");
      }

      const response = await fetch(`/api/projects/${projectId}/files/upload`, {
        method: "POST",
        body: formData,
        redirect: "follow",
      });

      if (response.redirected) {
        const redirectedUrl = new URL(response.url);
        const serverError = redirectedUrl.searchParams.get("error");

        if (serverError === "bad_upload_path") {
          setUploadError(
            [
              "Upload rejected: at least one file did not meet the allowed file type or path requirements.",
              `Allowed file types: ${ALLOWED_EXTENSION_TEXT}`,
              "No files were uploaded.",
            ].join("\n"),
          );
          return;
        }

        if (serverError === "total_too_large") {
          setUploadError(
            "Upload rejected: the selected files exceed 100 MB in total.\nNo files were uploaded.",
          );
          return;
        }

        window.location.href = response.url;
        return;
      }

      if (!response.ok) {
        setUploadError(
          `Upload failed with HTTP ${response.status}. No files were uploaded.`,
        );
        return;
      }

      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUploadError(`Upload failed: ${message}`);
    } finally {
      setIsUploading(false);
      clearUploadInputs();
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(event) => void uploadFiles(event.currentTarget.files, "files")}
      />

      <input
        ref={folderInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(event) => void uploadFiles(event.currentTarget.files, "folder")}
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
      />

      <button
        type="button"
        className="fsx-button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        Upload file(s)
      </button>

      <button
        type="button"
        className="fsx-button"
        onClick={() => folderInputRef.current?.click()}
        disabled={isUploading}
      >
        Upload folder
      </button>

      <label className="fsx-muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(event) => setOverwrite(event.currentTarget.checked)}
        />
        overwrite
      </label>

      {uploadError ? (
        <div
          role="alert"
          style={{
            flexBasis: "100%",
            padding: "8px 10px",
            border: "1px solid #fecaca",
            borderRadius: 8,
            background: "#fef2f2",
            color: "#b91c1c",
            whiteSpace: "pre-wrap",
          }}
        >
          {uploadError}
        </div>
      ) : null}

      {isUploading ? (
        <span className="fsx-muted" role="status">
          Uploading...
        </span>
      ) : null}
    </div>
  );
}
