// player_stats.cedar — Per-game player statistics

// Authenticated users can read player game stats
// (team members see their team's stats; players see their own)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"player_game_stats"
};

// Authenticated users can insert player game stats
// (app logic enforces: only admins and coaches of the team)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"player_game_stats"
};

// Authenticated users can update player game stats
// (app logic enforces: only admins and coaches)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"update",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"player_game_stats"
};

// Authenticated users can delete player game stats
// (app logic enforces: only admins and coaches)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"delete",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"player_game_stats"
};
