// players.cedar — Player roster management

// Authenticated users can read players on their team
// (all team members need to see the roster)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"players"
};

// Authenticated users can create players
// (app logic enforces: only team admins and coaches can add players)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"players"
};

// Authenticated users can update player records
// (app logic enforces: only team admins and coaches)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"update",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"players"
};

// Authenticated users can delete player records
// (app logic enforces: only team admins)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"delete",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"players"
};
