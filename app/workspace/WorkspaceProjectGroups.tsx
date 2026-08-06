"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ArchiveProjectButton from "./ArchiveProjectButton";

export type WorkspaceSortKey =
  | "project"
  | "name"
  | "created"
  | "updated";

export type WorkspaceProjectRow = {
  id: number;
  name: string;
  visibility: string;
  status: string;
  storage_path: string;
  created_at: string;
  updated_at: string;
  role: string;
  owner_user_id: number;
  owner_project_no: number | null;
  member_count: number;
  folder_kind: "private" | "shared";
  group_id: number | null;
  source_exists?: boolean;
};

export type WorkspaceProjectGroupRow = {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type FlashState = {
  error?: string;
  created?: string;
  renamed?: string;
  deleted?: string;
  moved?: string;
};

type ProjectGroupView = {
  id: number | null;
  name: string;
  projects: WorkspaceProjectRow[];
};

type Props = {
  groups: WorkspaceProjectGroupRow[];
  privateProjects: WorkspaceProjectRow[];
  sharedProjects: WorkspaceProjectRow[];
  sort: WorkspaceSortKey;
  flash: FlashState;
};

function fmtDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleLabel(role: string) {
  if (role === "owner") return "Owner";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Viewer";
  return role;
}

function roleClass(role: string) {
  if (role === "owner") return "fsx-pill fsx-pill-owner";
  if (role === "editor") return "fsx-pill fsx-pill-editor";
  return "fsx-pill";
}

function dateMs(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function projectNo(project: WorkspaceProjectRow) {
  return typeof project.owner_project_no === "number"
    ? project.owner_project_no
    : Number.POSITIVE_INFINITY;
}

function compareNames(a: string, b: string) {
  return a.localeCompare(b, "ja-JP", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortProjects(
  projects: WorkspaceProjectRow[],
  sort: WorkspaceSortKey,
) {
  return [...projects].sort((a, b) => {
    if (sort === "project") {
      const diff = projectNo(a) - projectNo(b);
      if (diff !== 0) return diff;
      return a.id - b.id;
    }

    if (sort === "name") {
      const diff = compareNames(a.name, b.name);
      if (diff !== 0) return diff;
      return projectNo(a) - projectNo(b);
    }

    if (sort === "created") {
      const diff = dateMs(a.created_at) - dateMs(b.created_at);
      if (diff !== 0) return diff;
      return a.id - b.id;
    }

    const diff = dateMs(b.updated_at) - dateMs(a.updated_at);
    if (diff !== 0) return diff;
    return b.id - a.id;
  });
}

function minimumProjectNo(projects: WorkspaceProjectRow[]) {
  return projects.reduce(
    (value, project) => Math.min(value, projectNo(project)),
    Number.POSITIVE_INFINITY,
  );
}

function oldestCreated(projects: WorkspaceProjectRow[]) {
  return projects.reduce(
    (value, project) => Math.min(value, dateMs(project.created_at)),
    Number.POSITIVE_INFINITY,
  );
}

function newestUpdated(projects: WorkspaceProjectRow[]) {
  return projects.reduce(
    (value, project) => Math.max(value, dateMs(project.updated_at)),
    Number.NEGATIVE_INFINITY,
  );
}

function buildProjectGroups(
  projects: WorkspaceProjectRow[],
  groups: WorkspaceProjectGroupRow[],
  sort: WorkspaceSortKey,
) {
  const knownGroups = new Map(
    groups.map((group) => [group.id, group] as const),
  );

  const grouped = new Map<number, WorkspaceProjectRow[]>();
  const unclassified: WorkspaceProjectRow[] = [];

  for (const project of projects) {
    if (
      project.group_id !== null &&
      knownGroups.has(project.group_id)
    ) {
      const current = grouped.get(project.group_id) ?? [];
      current.push(project);
      grouped.set(project.group_id, current);
    } else {
      unclassified.push(project);
    }
  }

  const views: ProjectGroupView[] = [];

  for (const group of groups) {
    const groupProjects = grouped.get(group.id) ?? [];

    if (groupProjects.length === 0) continue;

    views.push({
      id: group.id,
      name: group.name,
      projects: sortProjects(groupProjects, sort),
    });
  }

  if (unclassified.length > 0) {
    views.push({
      id: null,
      name: "Unclassified",
      projects: sortProjects(unclassified, sort),
    });
  }

  views.sort((a, b) => {
    if (sort === "project") {
      const diff =
        minimumProjectNo(a.projects) -
        minimumProjectNo(b.projects);

      if (diff !== 0) return diff;
    } else if (sort === "name") {
      const diff = compareNames(a.name, b.name);
      if (diff !== 0) return diff;
    } else if (sort === "created") {
      const diff =
        oldestCreated(a.projects) -
        oldestCreated(b.projects);

      if (diff !== 0) return diff;
    } else {
      const diff =
        newestUpdated(b.projects) -
        newestUpdated(a.projects);

      if (diff !== 0) return diff;
    }

    const nameDiff = compareNames(a.name, b.name);
    if (nameDiff !== 0) return nameDiff;

    return (a.id ?? Number.MAX_SAFE_INTEGER) -
      (b.id ?? Number.MAX_SAFE_INTEGER);
  });

  return views;
}

function flashMessage(flash: FlashState) {
  if (flash.created === "1") {
    return { kind: "ok", text: "Group folder created." };
  }

  if (flash.renamed === "1") {
    return { kind: "ok", text: "Group folder renamed." };
  }

  if (flash.deleted === "1") {
    return {
      kind: "ok",
      text: "Group folder deleted. Its projects are now unclassified.",
    };
  }

  if (flash.moved) {
    const count = Number(flash.moved);

    return {
      kind: "ok",
      text: Number.isFinite(count)
        ? `${count} project${count === 1 ? "" : "s"} moved.`
        : "Project moved.",
    };
  }

  const errorMessages: Record<string, string> = {
    invalid_name: "Enter a valid group name of 1–100 characters.",
    duplicate_name: "A group folder with that name already exists.",
    invalid_group: "The selected group folder is invalid.",
    group_not_found: "The selected group folder was not found.",
    not_found: "The group folder was not found.",
    no_projects: "Select at least one project.",
    too_many_projects: "Too many projects were selected.",
    forbidden_project: "One or more selected projects are unavailable.",
    invalid_membership: "The project membership could not be verified.",
    forbidden: "This operation is not permitted.",
    invalid_action: "The requested group operation is invalid.",
    failed: "The group operation failed.",
    move_failed: "The project move failed.",
  };

  if (flash.error) {
    return {
      kind: "error",
      text:
        errorMessages[flash.error] ??
        "The group operation failed.",
    };
  }

  return null;
}

function GroupSelectOptions({
  groups,
}: {
  groups: WorkspaceProjectGroupRow[];
}) {
  return (
    <>
      <option value="">Unclassified</option>
      {[...groups]
        .sort((a, b) => compareNames(a.name, b.name))
        .map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
    </>
  );
}

function ProjectCard({
  project,
  groups,
  sort,
  checked,
  onCheckedChange,
}: {
  project: WorkspaceProjectRow;
  groups: WorkspaceProjectGroupRow[];
  sort: WorkspaceSortKey;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <section
      className="fsx-card"
      style={{
        padding: "9px 14px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateRows: "auto auto",
          gap: 6,
          minWidth: 0,
        }}
      >
        <div
          className="fsx-card-head"
          style={{
            gap: 12,
            alignItems: "center",
            flexDirection: "row",
            flexWrap: "nowrap",
            overflowX: "auto",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "nowrap",
                gap: 6,
                alignItems: "center",
                whiteSpace: "nowrap",
              }}
            >
              <Link
                href={`/projects/${project.id}`}
                className="fsx-project-name"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {project.name}
              </Link>

              <span className={roleClass(project.role)}>
                {roleLabel(project.role)}
              </span>
              <span className="fsx-pill">{project.visibility}</span>
              <span className="fsx-pill">{project.folder_kind}</span>
            </div>
          </div>

          <div
            className="fsx-actions"
            style={{
              marginTop: 0,
              alignItems: "center",
              flexWrap: "nowrap",
              flex: "0 0 auto",
            }}
          >
            <Link
              href={`/projects/${project.id}`}
              className="fsx-button fsx-button-primary"
            >
              Open
            </Link>

            {project.role === "owner" ? (
              <ArchiveProjectButton
                projectId={project.id}
                projectName={project.name}
              />
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 10,
            flexWrap: "nowrap",
            overflowX: "auto",
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          <div
            className="fsx-meta fsx-meta-line"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginTop: 0,
              flexWrap: "nowrap",
              flex: "0 0 auto",
              whiteSpace: "nowrap",
            }}
          >
            {project.role === "owner" &&
            project.owner_project_no != null ? (
              <span>
                No. <code>{project.owner_project_no}</code>
              </span>
            ) : null}

            <span>Updated: {fmtDate(project.updated_at)}</span>
            <span>Created: {fmtDate(project.created_at)}</span>
            <span>Status: {project.status}</span>

            {!project.source_exists ? (
              <span style={{ color: "#b45309" }}>
                Source folder is missing.
              </span>
            ) : null}
          </div>

          <form
            action="/api/workspace/groups/move"
            method="post"
            style={{
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 7,
              flexWrap: "nowrap",
              flex: "0 0 auto",
              whiteSpace: "nowrap",
            }}
          >
            <input type="hidden" name="sort" value={sort} />
            <input
              type="hidden"
              name="projectId"
              value={project.id}
            />

            <select
              id={`project-group-${project.id}`}
              name="groupId"
              aria-label="Project group folder"
              defaultValue={project.group_id ?? ""}
              className="fsx-input"
              style={{
                minHeight: 34,
                width: 140,
                flex: "0 0 140px",
                padding: "4px 8px",
              }}
            >
              <GroupSelectOptions groups={groups} />
            </select>

            <button
              type="submit"
              className="fsx-button"
              style={{
                minHeight: 34,
                padding: "4px 10px",
              }}
            >
              Move
            </button>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginLeft: 4,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title="Select this project for a bulk move"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onCheckedChange(event.currentTarget.checked)
                }
              />
              <span className="fsx-muted" style={{ fontSize: 12 }}>
                Select
              </span>
            </label>
          </form>
        </div>
      </div>
    </section>
  );
}

function BulkMoveControls({
  groups,
  sort,
  selectedIds,
  onSelectAll,
  onClear,
}: {
  groups: WorkspaceProjectGroupRow[];
  sort: WorkspaceSortKey;
  selectedIds: number[];
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [target, setTarget] = useState("__choose__");

  return (
    <form
      action="/api/workspace/groups/move"
      method="post"
      onSubmit={(event) => {
        if (target === "__choose__" || selectedIds.length === 0) {
          event.preventDefault();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        flexWrap: "nowrap",
        flex: "1 1 auto",
        minWidth: "max-content",
        margin: 0,
        marginLeft: "1em",
        whiteSpace: "nowrap",
      }}
    >
      <input type="hidden" name="sort" value={sort} />

      {selectedIds.map((projectId) => (
        <input
          key={projectId}
          type="hidden"
          name="projectId"
          value={projectId}
        />
      ))}

      <strong style={{ fontSize: 13 }}>
        Selected: {selectedIds.length}
      </strong>

      <select
        name="groupId"
        value={target}
        onChange={(event) => setTarget(event.currentTarget.value)}
        className="fsx-input"
        style={{
          minHeight: 34,
          width: 170,
          flex: "0 0 170px",
          padding: "4px 8px",
        }}
      >
        <option value="__choose__">Choose destination…</option>
        <GroupSelectOptions groups={groups} />
      </select>

      <button
        type="button"
        className="fsx-button"
        onClick={onSelectAll}
        style={{
          minHeight: 34,
          padding: "4px 10px",
          flex: "0 0 auto",
        }}
      >
        Select all projects
      </button>

      <button
        type="submit"
        className="fsx-button fsx-button-primary"
        disabled={
          selectedIds.length === 0 || target === "__choose__"
        }
        style={{ minHeight: 34, padding: "4px 10px" }}
      >
        Move selected
      </button>

      <button
        type="button"
        className="fsx-button"
        disabled={selectedIds.length === 0}
        onClick={onClear}
        style={{ minHeight: 34, padding: "4px 10px" }}
      >
        Clear
      </button>
    </form>
  );
}

function GroupManagement({
  groups,
  projects,
  sort,
  selectedIds,
  onClearSelection,
  onSelectAll,
}: {
  groups: WorkspaceProjectGroupRow[];
  projects: WorkspaceProjectRow[];
  sort: WorkspaceSortKey;
  selectedIds: number[];
  onClearSelection: () => void;
  onSelectAll: () => void;
}) {
  const counts = new Map<number, number>();

  for (const project of projects) {
    if (project.group_id === null) continue;

    counts.set(
      project.group_id,
      (counts.get(project.group_id) ?? 0) + 1,
    );
  }

  const sortedGroups = [...groups].sort((a, b) =>
    compareNames(a.name, b.name),
  );

  return (
    <details className="fsx-panel">
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 800,
          fontSize: 20,
          lineHeight: 1.3,
        }}
      >
        Group folders ({groups.length})
      </summary>

      <p
        className="fsx-panel-note"
        style={{ marginTop: 8, marginBottom: 12 }}
      >
        Create folders with your own names. Empty folders remain
        available in every project&apos;s Folder menu.
      </p>

      <div
        className="fsx-card"
        style={{
          marginTop: 0,
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 10,
          flexWrap: "nowrap",
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        <form
          action="/api/workspace/groups"
          method="post"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "nowrap",
            margin: 0,
            flex: "0 0 auto",
          }}
        >
          <input type="hidden" name="action" value="create" />
          <input type="hidden" name="sort" value={sort} />

          <input
            type="text"
            name="name"
            required
            maxLength={100}
            placeholder="New group folder name"
            aria-label="New group folder name"
            className="fsx-input"
            style={{
              minHeight: 34,
              width: 160,
              flex: "0 0 160px",
              padding: "4px 8px",
            }}
          />

          <button
            type="submit"
            className="fsx-button fsx-button-primary"
            style={{
              minHeight: 34,
              padding: "4px 10px",
              flex: "0 0 auto",
            }}
          >
            Create group
          </button>
        </form>

        <BulkMoveControls
          groups={groups}
          sort={sort}
          selectedIds={selectedIds}
          onSelectAll={onSelectAll}
          onClear={onClearSelection}
        />
      </div>

      {sortedGroups.length === 0 ? (
        <div className="fsx-empty-box" style={{ marginTop: 12 }}>
          No group folders yet.
        </div>
      ) : (
        <div
          className="fsx-grid"
          style={{ gap: 8, marginTop: 14 }}
        >
          {sortedGroups.map((group) => (
            <div
              key={group.id}
              className="fsx-card"
              style={{
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "nowrap",
                overflowX: "auto",
              }}
            >
              <strong
                style={{
                  flex: "0 0 auto",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                }}
              >
                {group.name} ({counts.get(group.id) ?? 0})
              </strong>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 7,
                  flex: "1 1 auto",
                  minWidth: 0,
                  whiteSpace: "nowrap",
                }}
              >
                <form
                  action="/api/workspace/groups"
                  method="post"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    flexWrap: "nowrap",
                    margin: 0,
                  }}
                >
                  <input type="hidden" name="action" value="rename" />
                  <input type="hidden" name="sort" value={sort} />
                  <input
                    type="hidden"
                    name="groupId"
                    value={group.id}
                  />

                  <input
                    type="text"
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={group.name}
                    className="fsx-input"
                    style={{
                      minHeight: 32,
                      width: "min(210px, 26vw)",
                      minWidth: 140,
                      padding: "3px 8px",
                    }}
                  />

                  <button
                    type="submit"
                    className="fsx-button"
                    style={{
                      minHeight: 32,
                      padding: "3px 10px",
                    }}
                  >
                    Rename
                  </button>
                </form>

                <form
                  action="/api/workspace/groups"
                  method="post"
                  style={{
                    margin: 0,
                    flex: "0 0 auto",
                  }}
                  onSubmit={(event) => {
                    const confirmed = window.confirm(
                      `Delete the group folder "${group.name}"?

Projects will not be deleted. They will return to Unclassified.`,
                    );

                    if (!confirmed) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="sort" value={sort} />
                  <input
                    type="hidden"
                    name="groupId"
                    value={group.id}
                  />

                  <button
                    type="submit"
                    className="fsx-button fsx-button-danger"
                    style={{
                      minHeight: 32,
                      padding: "3px 10px",
                    }}
                  >
                    Delete group
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function ProjectSection({
  title,
  note,
  projects,
  groups,
  sort,
  selectedProjects,
  onProjectSelectionChange,
}: {
  title: string;
  note?: string;
  projects: WorkspaceProjectRow[];
  groups: WorkspaceProjectGroupRow[];
  sort: WorkspaceSortKey;
  selectedProjects: ReadonlySet<number>;
  onProjectSelectionChange: (
    projectId: number,
    checked: boolean,
  ) => void;
}) {
  const groupedProjects = useMemo(
    () => buildProjectGroups(projects, groups, sort),
    [projects, groups, sort],
  );

  return (
    <details className="fsx-panel" open>
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 800,
          fontSize: 20,
          lineHeight: 1.3,
        }}
      >
        {title} ({projects.length})
      </summary>

      <div style={{ marginTop: 14 }}>
        {note ? (
          <p className="fsx-panel-note" style={{ marginTop: 0 }}>
            {note}
          </p>
        ) : null}

        {projects.length === 0 ? (
          <div className="fsx-empty-box">No projects yet.</div>
        ) : (
          <div className="fsx-grid" style={{ gap: 12 }}>
            {groupedProjects.map((group) => (
              <details
                key={group.id ?? "unclassified"}
                className="fsx-card"
                open
                style={{ padding: "11px 13px" }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: 850,
                    fontSize: 17,
                    lineHeight: 1.3,
                  }}
                >
                  {group.name} ({group.projects.length})
                </summary>

                <div
                  className="fsx-grid"
                  style={{ gap: 9, marginTop: 10 }}
                >
                  {group.projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      groups={groups}
                      sort={sort}
                      checked={selectedProjects.has(project.id)}
                      onCheckedChange={(checked) =>
                        onProjectSelectionChange(
                          project.id,
                          checked,
                        )
                      }
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export default function WorkspaceProjectGroups({
  groups,
  privateProjects,
  sharedProjects,
  sort,
  flash,
}: Props) {
  const message = flashMessage(flash);
  const allProjects = [...privateProjects, ...sharedProjects];
  const [selectedProjects, setSelectedProjects] = useState<Set<number>>(
    () => new Set(),
  );
  const selectedIds = [...selectedProjects];

  function setProjectSelected(
    projectId: number,
    checked: boolean,
  ) {
    setSelectedProjects((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(projectId);
      } else {
        next.delete(projectId);
      }

      return next;
    });
  }

  function selectAllProjects() {
    setSelectedProjects(
      new Set(allProjects.map((project) => project.id)),
    );
  }

  return (
    <>
      {message ? (
        <div
          className="fsx-empty-box"
          role="status"
          style={{
            marginBottom: 14,
            borderColor:
              message.kind === "error" ? "#fecaca" : "#bbf7d0",
            background:
              message.kind === "error" ? "#fff7f7" : "#f0fdf4",
            color:
              message.kind === "error" ? "#991b1b" : "#166534",
          }}
        >
          {message.text}
        </div>
      ) : null}

      <GroupManagement
        groups={groups}
        projects={allProjects}
        sort={sort}
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedProjects(new Set())}
        onSelectAll={selectAllProjects}
      />

      <ProjectSection
        title="Private projects"
        projects={privateProjects}
        groups={groups}
        sort={sort}
        selectedProjects={selectedProjects}
        onProjectSelectionChange={setProjectSelected}
      />

      <ProjectSection
        title="Shared projects"
        note="These projects are visible because you are listed as a member."
        projects={sharedProjects}
        groups={groups}
        sort={sort}
        selectedProjects={selectedProjects}
        onProjectSelectionChange={setProjectSelected}
      />
    </>
  );
}
