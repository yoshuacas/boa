// functions/weekly-standings-email/index.mjs
// Scheduled function — runs every Monday at 8am UTC via EventBridge
// Emails league standings to all team admins using SES
import { createClient } from '@supabase/supabase-js';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const supabase = createClient(
  process.env.API_URL,
  process.env.SERVICE_ROLE_KEY
);

const ses = new SESClient({ region: process.env.REGION_NAME });

export async function handler(event) {
  try {
    // Fetch all teams with their standings data
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .order('points', { ascending: false });

    if (teamsError) {
      console.error('Error fetching teams:', teamsError);
      throw teamsError;
    }

    // Build standings table
    const standingsHtml = buildStandingsHtml(teams || []);
    const standingsText = buildStandingsText(teams || []);

    // Fetch all team admins (players with admin role or team contacts)
    const { data: admins, error: adminsError } = await supabase
      .from('players')
      .select('email, name, team_id')
      .eq('role', 'admin')
      .not('email', 'is', null);

    if (adminsError) {
      console.error('Error fetching admins:', adminsError);
      throw adminsError;
    }

    if (!admins || admins.length === 0) {
      console.log('No team admins found, skipping email send');
      return { statusCode: 200, body: JSON.stringify({ message: 'No admins to email' }) };
    }

    // Send email to each admin
    const results = [];
    for (const admin of admins) {
      try {
        const command = new SendEmailCommand({
          Source: process.env.SES_FROM_EMAIL,
          Destination: {
            ToAddresses: [admin.email],
          },
          Message: {
            Subject: {
              Data: `Weekly League Standings - ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: standingsHtml,
                Charset: 'UTF-8',
              },
              Text: {
                Data: standingsText,
                Charset: 'UTF-8',
              },
            },
          },
        });

        await ses.send(command);
        results.push({ email: admin.email, status: 'sent' });
      } catch (emailErr) {
        console.error(`Failed to email ${admin.email}:`, emailErr.message);
        results.push({ email: admin.email, status: 'failed', error: emailErr.message });
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    console.log(`Standings email sent to ${sent} admins, ${failed} failed`);

    return {
      statusCode: 200,
      body: JSON.stringify({ sent, failed, results }),
    };
  } catch (err) {
    console.error('Error in weekly standings email:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send standings emails' }),
    };
  }
}

function buildStandingsHtml(teams) {
  let rows = '';
  teams.forEach((team, index) => {
    rows += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${index + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${team.name || 'Unknown'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${team.wins || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${team.draws || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${team.losses || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${team.goals_for || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${team.goals_against || 0}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; font-weight: bold;">${team.points || 0}</td>
      </tr>`;
  });

  return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Weekly League Standings</h2>
        <p>Here are the current standings as of ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 8px; text-align: left;">#</th>
              <th style="padding: 8px; text-align: left;">Team</th>
              <th style="padding: 8px; text-align: center;">W</th>
              <th style="padding: 8px; text-align: center;">D</th>
              <th style="padding: 8px; text-align: center;">L</th>
              <th style="padding: 8px; text-align: center;">GF</th>
              <th style="padding: 8px; text-align: center;">GA</th>
              <th style="padding: 8px; text-align: center;">Pts</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          This is an automated weekly standings email from your soccer league app.
        </p>
      </body>
    </html>`;
}

function buildStandingsText(teams) {
  let text = 'Weekly League Standings\n';
  text += '========================\n\n';
  text += 'Pos  Team                   W    D    L    GF   GA   Pts\n';
  text += '---  --------------------  ---  ---  ---  ---  ---  ---\n';

  teams.forEach((team, index) => {
    const pos = String(index + 1).padEnd(4);
    const name = (team.name || 'Unknown').padEnd(22);
    const w = String(team.wins || 0).padStart(3);
    const d = String(team.draws || 0).padStart(4);
    const l = String(team.losses || 0).padStart(4);
    const gf = String(team.goals_for || 0).padStart(4);
    const ga = String(team.goals_against || 0).padStart(4);
    const pts = String(team.points || 0).padStart(4);
    text += `${pos} ${name} ${w} ${d} ${l} ${gf} ${ga} ${pts}\n`;
  });

  return text;
}
