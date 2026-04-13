// teams.cedar — Team creation and management

// Authenticated users can create teams (must be in a league)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"teams"
};

// Authenticated users can update teams
// (app logic checks team_members role = 'admin' or league_admin)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"update",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"teams"
};

// Authenticated users can delete teams
// (app logic checks team_members role = 'admin' or league_admin)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"delete",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"teams"
};
