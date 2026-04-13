// functions/daily-stats-summary/index.mjs
// Scheduled function: runs nightly at midnight UTC via EventBridge
// Aggregates previous day's game stats and inserts a summary into daily_reports

import { createClient } from '@supabase/supabase-js';

// Service role client — bypasses Cedar policies (admin access)
const supabase = createClient(
  process.env.API_URL,
  process.env.SERVICE_ROLE_KEY
);

export async function handler(event) {
  // Calculate the previous day's date range (UTC)
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const reportDate = yesterday.toISOString().split('T')[0]; // e.g. "2026-04-11"
  const dayStart = `${reportDate}T00:00:00.000Z`;
  const dayEnd = `${reportDate}T23:59:59.999Z`;

  console.log(`Generating daily stats summary for ${reportDate}`);

  // Fetch all game_stats rows from the previous day
  const { data: stats, error: statsError } = await supabase
    .from('game_stats')
    .select('*')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  if (statsError) {
    console.error('Error fetching game_stats:', statsError);
    return { statusCode: 500, body: JSON.stringify({ error: statsError.message }) };
  }

  if (!stats || stats.length === 0) {
    console.log(`No game stats found for ${reportDate}. Inserting empty summary.`);
    const { error: insertError } = await supabase.from('daily_reports').insert({
      report_date: reportDate,
      total_goals: 0,
      total_games: 0,
      avg_goals_per_game: 0,
      top_scorer_player_id: null,
      top_scorer_name: null,
      top_scorer_goals: 0,
      data: { games: [], player_totals: [] },
    });

    if (insertError) {
      console.error('Error inserting empty summary:', insertError);
      return { statusCode: 500, body: JSON.stringify({ error: insertError.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ reportDate, totalGoals: 0 }) };
  }

  // Aggregate: total goals
  const totalGoals = stats.reduce((sum, row) => sum + (row.goals || 0), 0);

  // Aggregate: unique games
  const uniqueGameIds = new Set(stats.map((row) => row.game_id).filter(Boolean));
  const totalGames = uniqueGameIds.size || 1; // avoid division by zero

  // Aggregate: average goals per game
  const avgGoalsPerGame = parseFloat((totalGoals / totalGames).toFixed(2));

  // Aggregate: top scorer — sum goals per player, pick the highest
  const goalsByPlayer = {};
  for (const row of stats) {
    const pid = row.player_id;
    if (!pid) continue;
    if (!goalsByPlayer[pid]) {
      goalsByPlayer[pid] = {
        player_id: pid,
        player_name: row.player_name || pid,
        goals: 0,
      };
    }
    goalsByPlayer[pid].goals += row.goals || 0;
  }

  const playerTotals = Object.values(goalsByPlayer).sort((a, b) => b.goals - a.goals);
  const topScorer = playerTotals[0] || null;

  // Build the summary row
  const summary = {
    report_date: reportDate,
    total_goals: totalGoals,
    total_games: totalGames,
    avg_goals_per_game: avgGoalsPerGame,
    top_scorer_player_id: topScorer?.player_id || null,
    top_scorer_name: topScorer?.player_name || null,
    top_scorer_goals: topScorer?.goals || 0,
    data: {
      games: [...uniqueGameIds],
      player_totals: playerTotals,
    },
  };

  console.log('Inserting daily report:', JSON.stringify(summary));

  const { error: insertError } = await supabase.from('daily_reports').insert(summary);

  if (insertError) {
    console.error('Error inserting daily report:', insertError);
    return { statusCode: 500, body: JSON.stringify({ error: insertError.message }) };
  }

  console.log(`Daily report for ${reportDate} inserted successfully.`);
  return {
    statusCode: 200,
    body: JSON.stringify({
      reportDate,
      totalGoals,
      totalGames,
      avgGoalsPerGame,
      topScorer: topScorer?.player_name || 'N/A',
    }),
  };
}
