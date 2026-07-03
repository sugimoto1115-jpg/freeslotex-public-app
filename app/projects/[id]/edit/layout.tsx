import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import ProjectsTopMenu from "../../ProjectsTopMenu";

export default async function ProjectEditLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <>
      <ProjectsTopMenu accountLabel={user.displayName || user.email} />

      <div
        className="fsx-fixed-topbar-content-spacer"
        aria-hidden="true"
        style={{ height: 30 }}
      />

      {children}
    </>
  );
}
