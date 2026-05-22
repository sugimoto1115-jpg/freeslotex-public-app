"use client";

import { useState } from "react";

type Props = {
  projectId: number;
  projectName: string;
};

export default function ArchiveProjectButton({ projectId, projectName }: Props) {
  const [isArchiving, setIsArchiving] = useState(false);

  return (
    <form
      action={`/api/projects/${projectId}/archive`}
      method="post"
      onSubmit={(event) => {
        const ok = window.confirm(
          `Archive "${projectName}"?\n\nThis hides the project from My workspace, but does not delete the files.`
        );

        if (!ok) {
          event.preventDefault();
          return;
        }

        setIsArchiving(true);
      }}
    >
      <button
        type="submit"
        className="fsx-button fsx-button-danger"
        disabled={isArchiving}
        title="Archive this project. Files are not deleted."
      >
        {isArchiving ? "Archiving..." : "Archive"}
      </button>
    </form>
  );
}
