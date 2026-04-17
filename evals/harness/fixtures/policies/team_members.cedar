// team_members.cedar — Team membership and role management

// Authenticated users can read team_members (needed to check roles)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"team_members"
};

// Authenticated users can create team_members
// (app logic enforces: only team admins can add members)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"team_members"
};

// Authenticated users can update team_members
// (app logic enforces: only team admins can change roles)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"update",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"team_members"
};

// Authenticated users can delete team_members
// (app logic enforces: only team admins can remove members)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"delete",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"team_members"
};
