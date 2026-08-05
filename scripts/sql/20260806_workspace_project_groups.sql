BEGIN;

CREATE TABLE workspace_project_groups (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL,
  name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_project_groups_user_fkey
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

  CONSTRAINT workspace_project_groups_name_not_blank
    CHECK (btrim(name) <> ''),

  CONSTRAINT workspace_project_groups_name_no_control_chars
    CHECK (name !~ '[[:cntrl:]]'),

  CONSTRAINT workspace_project_groups_id_user_id_key
    UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX workspace_project_groups_user_name_lower_idx
  ON workspace_project_groups (
    user_id,
    lower(btrim(name))
  );

CREATE INDEX workspace_project_groups_user_id_idx
  ON workspace_project_groups (user_id);

CREATE TABLE workspace_project_group_items (
  user_id bigint NOT NULL,
  project_id bigint NOT NULL,
  group_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_project_group_items_pkey
    PRIMARY KEY (user_id, project_id),

  CONSTRAINT workspace_project_group_items_membership_fkey
    FOREIGN KEY (project_id, user_id)
    REFERENCES project_members(project_id, user_id)
    ON DELETE CASCADE,

  CONSTRAINT workspace_project_group_items_group_fkey
    FOREIGN KEY (group_id, user_id)
    REFERENCES workspace_project_groups(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX workspace_project_group_items_user_group_idx
  ON workspace_project_group_items (user_id, group_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE workspace_project_groups
  TO labtex_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE workspace_project_group_items
  TO labtex_app;

GRANT USAGE, SELECT
  ON SEQUENCE workspace_project_groups_id_seq
  TO labtex_app;

COMMIT;
