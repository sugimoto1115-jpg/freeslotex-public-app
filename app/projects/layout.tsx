import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";

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
          <div>
            <div className="fsx-brand">FreeSloTeX</div>
            <div className="fsx-user">{user.displayName || user.email}</div>
          </div>

          <form action="/api/logout" method="post">
            <button type="submit" className="fsx-button">
              Logout
            </button>
          </form>
        </div>
      </header>

      {children}
    </div>
  );
}
