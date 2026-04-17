// games.cedar — Game management (public read is in public_access.cedar)

// Authenticated users can create games
// (app logic enforces: only league admins or team admins)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"games"
};

// Authenticated users can update games (scores, status, notes)
// (app logic enforces: only league admins, or admins/coaches of participating teams)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"update",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"games"
};

// Authenticated users can delete games
// (app logic enforces: only league admins)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"delete",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"games"
};
