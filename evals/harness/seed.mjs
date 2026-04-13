#!/usr/bin/env node
/**
 * Seed test data for e2e tests.
 * Creates a known dataset that function tests can assert against.
 *
 * Usage: node seed.mjs [--project-dir /path/to/project]
 */
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './helpers/config.mjs';

const projectDir = process.argv.includes('--project-dir')
  ? process.argv[process.argv.indexOf('--project-dir') + 1]
  : process.cwd();

const config = loadConfig(projectDir);
const admin = createClient(config.apiUrl, config.serviceRoleKey);

async function seed() {
  console.log('Seeding test data...');

  // ── Teams ──
  const teams = [
    { name: 'Eagles', league_id: 'league-1' },
    { name: 'Hawks', league_id: 'league-1' },
    { name: 'Falcons', league_id: 'league-1' },
    { name: 'Owls', league_id: 'league-1' },
  ];

  const { data: insertedTeams, error: teamsErr } = await admin
    .from('teams')
    .upsert(teams, { onConflict: 'name' })
    .select();

  if (teamsErr) {
    console.log('Teams table may not exist yet, skipping team seed:', teamsErr.message);
    return;
  }

  console.log(`  Seeded ${insertedTeams.length} teams`);
  const teamMap = Object.fromEntries(insertedTeams.map(t => [t.name, t.id]));

  // ── Games (round-robin: each team plays each other once) ──
  const matchups = [];
  const teamNames = Object.keys(teamMap);
  for (let i = 0; i < teamNames.length; i++) {
    for (let j = i + 1; j < teamNames.length; j++) {
      matchups.push({
        home_team_id: teamMap[teamNames[i]],
        away_team_id: teamMap[teamNames[j]],
        opponent_name: `${teamNames[i]} vs ${teamNames[j]}`,
        game_date: new Date(2026, 2, 10 + matchups.length).toISOString().split('T')[0],
        location: 'Test Stadium',
        home_score: Math.floor(Math.random() * 4),
        away_score: Math.floor(Math.random() * 4),
      });
    }
  }

  const { data: insertedGames, error: gamesErr } = await admin
    .from('games')
    .insert(matchups)
    .select();

  if (gamesErr) {
    console.log('Games insert issue:', gamesErr.message);
  } else {
    console.log(`  Seeded ${insertedGames.length} games`);
  }

  // ── Players (2 per team) ──
  const players = [];
  for (const [name, id] of Object.entries(teamMap)) {
    players.push(
      { name: `${name} Player 1`, team_id: id, jersey_number: 10, position: 'Forward' },
      { name: `${name} Player 2`, team_id: id, jersey_number: 7, position: 'Midfielder' },
    );
  }

  const { data: insertedPlayers, error: playersErr } = await admin
    .from('players')
    .insert(players)
    .select();

  if (playersErr) {
    console.log('Players insert issue:', playersErr.message);
  } else {
    console.log(`  Seeded ${insertedPlayers.length} players`);
  }

  // ── Game stats (1 stat entry per player per game their team played) ──
  if (insertedGames && insertedPlayers) {
    const stats = [];
    for (const game of insertedGames) {
      const homePlayers = insertedPlayers.filter(p => p.team_id === game.home_team_id);
      const awayPlayers = insertedPlayers.filter(p => p.team_id === game.away_team_id);

      for (const player of [...homePlayers, ...awayPlayers]) {
        stats.push({
          game_id: game.id,
          player_id: player.id,
          goals: Math.floor(Math.random() * 3),
          assists: Math.floor(Math.random() * 2),
          minutes_played: 90,
          yellow_cards: Math.random() > 0.8 ? 1 : 0,
          red_cards: 0,
        });
      }
    }

    const { data: insertedStats, error: statsErr } = await admin
      .from('game_stats')
      .insert(stats)
      .select();

    if (statsErr) {
      console.log('Game stats insert issue:', statsErr.message);
    } else {
      console.log(`  Seeded ${insertedStats.length} game stats`);
    }
  }

  console.log('Seed complete.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
