// public_access.cedar — Public visitors can see league standings and game results

// Anyone (including anonymous) can read leagues
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"leagues"
};

// Anyone can read teams (standings are derived from teams table)
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"teams"
};

// Anyone can read games (results, schedules)
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"games"
};

// Anyone can read media (team photos are public)
permit(
    principal,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"media"
};
