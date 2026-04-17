// functions/generate-game-report/index.mjs
// API function — requires JWT authentication (default BOA authorizer)
// Fetches game data + player stats from DB, generates a PDF report
import { createClient } from '@supabase/supabase-js';
import PDFDocument from 'pdfkit';

const supabase = createClient(
  process.env.API_URL,
  process.env.SERVICE_ROLE_KEY
);

export async function handler(event) {
  // Verify the user is authenticated (BOA authorizer passes these)
  const role = event.requestContext?.authorizer?.role;
  const userId = event.requestContext?.authorizer?.userId;

  if (role !== 'authenticated' || !userId) {
    return {
      statusCode: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Authentication required' }),
    };
  }

  // Parse game ID from path or query params
  const params = event.queryStringParameters || {};
  const gameId = params.game_id;

  if (!gameId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'game_id query parameter is required' }),
    };
  }

  try {
    // Fetch game data
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Game not found' }),
      };
    }

    // Fetch teams for this game
    const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean);
    const { data: teams } = await supabase
      .from('teams')
      .select('*')
      .in('id', teamIds);

    const teamsById = {};
    for (const team of teams || []) {
      teamsById[team.id] = team;
    }

    // Fetch player stats for this game
    const { data: gameStats } = await supabase
      .from('game_stats')
      .select('*')
      .eq('game_id', gameId);

    // Fetch player details for all players in game_stats
    const playerIds = (gameStats || []).map((s) => s.player_id).filter(Boolean);
    let playersById = {};
    if (playerIds.length > 0) {
      const { data: players } = await supabase
        .from('players')
        .select('*')
        .in('id', playerIds);
      for (const player of players || []) {
        playersById[player.id] = player;
      }
    }

    // Generate PDF
    const pdfBuffer = await generatePdf(game, teamsById, gameStats || [], playersById);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="game-report-${gameId}.pdf"`,
        'Access-Control-Allow-Origin': '*',
      },
      isBase64Encoded: true,
      body: pdfBuffer.toString('base64'),
    };
  } catch (err) {
    console.error('Error generating game report:', err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to generate report' }),
    };
  }
}

function generatePdf(game, teamsById, gameStats, playersById) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(24).text('Game Report', { align: 'center' });
    doc.moveDown();

    // Game details
    const homeTeam = teamsById[game.home_team_id];
    const awayTeam = teamsById[game.away_team_id];

    doc.fontSize(16).text(
      `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`,
      { align: 'center' }
    );
    doc.moveDown(0.5);

    if (game.played_at) {
      doc.fontSize(12).text(`Date: ${new Date(game.played_at).toLocaleDateString()}`, { align: 'center' });
    }
    if (game.home_score != null && game.away_score != null) {
      doc.fontSize(18).text(
        `Score: ${game.home_score} - ${game.away_score}`,
        { align: 'center' }
      );
    }
    doc.moveDown();

    // Player stats table
    doc.fontSize(16).text('Player Statistics', { underline: true });
    doc.moveDown(0.5);

    if (gameStats.length === 0) {
      doc.fontSize(12).text('No player statistics recorded for this game.');
    } else {
      // Table header
      doc.fontSize(10);
      const startX = 50;
      let y = doc.y;
      doc.text('Player', startX, y, { width: 150 });
      doc.text('Goals', startX + 150, y, { width: 60 });
      doc.text('Assists', startX + 210, y, { width: 60 });
      doc.text('Yellow', startX + 270, y, { width: 60 });
      doc.text('Red', startX + 330, y, { width: 60 });
      doc.text('Minutes', startX + 390, y, { width: 60 });

      y += 20;
      doc.moveTo(startX, y).lineTo(startX + 450, y).stroke();
      y += 5;

      for (const stat of gameStats) {
        const player = playersById[stat.player_id];
        const playerName = player ? (player.display_name || player.name || player.id) : stat.player_id;

        doc.text(playerName, startX, y, { width: 150 });
        doc.text(String(stat.goals || 0), startX + 150, y, { width: 60 });
        doc.text(String(stat.assists || 0), startX + 210, y, { width: 60 });
        doc.text(String(stat.yellow_cards || 0), startX + 270, y, { width: 60 });
        doc.text(String(stat.red_cards || 0), startX + 330, y, { width: 60 });
        doc.text(String(stat.minutes_played || 0), startX + 390, y, { width: 60 });
        y += 18;

        // New page if needed
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
      }
    }

    doc.end();
  });
}
