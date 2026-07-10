"use client";

import { useRef, useState } from "react";

type FolderFile = File & {
  webkitRelativePath?: string;
};

type Props = {
  projectId: string;
};

export default function ProjectUploadClient({ projectId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFiles(files: FileList | null, mode: "files" | "folder") {
    if (!files || files.length === 0 || isUploading) return;

    setIsUploading(true);

    try {
      const formData = new FormData();

      for (const file of Array.from(files) as FolderFile[]) {
        const relativePath =
          mode === "folder"
            ? file.webkitRelativePath || file.name
            : file.name;

        formData.append("file", file);
        formData.append("relativePath", relativePath);
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
        window.location.href = response.url;
        return;
      }

      window.location.reload();
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (folderInputRef.current) folderInputRef.current.value = "";
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

      {isUploading ? (
        <span className="fsx-muted" role="status">
          Uploading...
        </span>
      ) : null}
    </div>
  );
}
