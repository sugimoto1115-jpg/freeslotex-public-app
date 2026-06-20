import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import ProjectsTopMenu from "./ProjectsTopMenu";

export default async function ProjectsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="fsx-shell">
      <header className="fsx-topbar">
        <div className="fsx-topbar-inner">
          <div className="fsx-topbar-left">
            <div className="fsx-brand">FreeSloTeX</div>

            <ProjectsTopMenu />
          </div>

          <div className="fsx-topbar-account">
            <div className="fsx-user">{user.displayName || user.email}</div>

            <form action="/api/logout" method="post">
              <button type="submit" className="fsx-button">
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
