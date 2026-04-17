-- 010_add_indexes.sql
-- All indexes for the soccer app (DSQL requires ASYNC)

-- Teams
CREATE INDEX ASYNC IF NOT EXISTS idx_teams_league ON teams(league_id);

-- Team members
CREATE INDEX ASYNC IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_team_members_team_role ON team_members(team_id, role);

-- League admins
CREATE INDEX ASYNC IF NOT EXISTS idx_league_admins_league ON league_admins(league_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_league_admins_user ON league_admins(user_id);

-- Players
CREATE INDEX ASYNC IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_players_user ON players(user_id);

-- Games
CREATE INDEX ASYNC IF NOT EXISTS idx_games_league ON games(league_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_games_home_team ON games(home_team_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_games_away_team ON games(away_team_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_games_date ON games(game_date DESC);

-- Player game stats
CREATE INDEX ASYNC IF NOT EXISTS idx_pgs_game ON player_game_stats(game_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_pgs_player ON player_game_stats(player_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_pgs_team ON player_game_stats(team_id);

-- Media
CREATE INDEX ASYNC IF NOT EXISTS idx_media_team ON media(team_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_media_game ON media(game_id);
CREATE INDEX ASYNC IF NOT EXISTS idx_media_player ON media(player_id);
