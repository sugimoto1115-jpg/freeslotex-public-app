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
      <header className="fsx-topbar" style={{ height: 0, borderBottom: 0, background: "transparent", overflow: "visible" }}>
        <div className="fsx-topbar-inner" style={{ height: 0, minHeight: 0, padding: 0, overflow: "visible" }}>
          <div className="fsx-topbar-left">
            <div className="fsx-brand" style={{ display: "none" }}>FreeSloTeX</div>

            <ProjectsTopMenu accountLabel={user.displayName || user.email} />
          </div>

          <div className="fsx-topbar-account" style={{ display: "none" }}>
            <div className="fsx-user">{user.displayName || user.email}</div>

            <form action="/api/logout" method="post">
              <button type="submit" className="fsx-button">
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

        <div
          className="fsx-fixed-topbar-content-spacer"
          aria-hidden="true"
          style={{ height: 30 }}
        />

      {children}
    </div>
  );
}
