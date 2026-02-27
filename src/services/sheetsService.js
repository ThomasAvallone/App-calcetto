// ─── Google Sheets Integration via Apps Script Web App ───────────────────────
// Deploy a Google Apps Script as Web App and paste the URL in VITE_SHEETS_WEBHOOK_URL
// The script handles all read/write to Google Sheets
// See /docs/apps-script.js for the Apps Script code to deploy

const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL || '';

async function postToSheets(payload) {
  if (!WEBHOOK_URL) {
    console.warn('[Sheets] VITE_SHEETS_WEBHOOK_URL non configurato. Saltato.');
    return null;
  }
  const resp = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`Sheets webhook error: ${resp.status}`);
  return resp.json();
}

export async function exportMatchToSheets(match, players) {
  const scorer = (match.events || [])
    .filter(e => e.type === 'goal')
    .map(e => e.scorerName)
    .join(', ');
  const assists = (match.events || [])
    .filter(e => e.assistId)
    .map(e => e.assistName)
    .join(', ');

  const mvp = computeMvp(match, players);

  const row = {
    action: 'append_match',
    data: {
      date: new Date(match.date?.toDate ? match.date.toDate() : match.date).toLocaleDateString('it-IT'),
      result: `${match.redScore}-${match.blueScore}`,
      scorers: scorer,
      assists,
      mvp: mvp?.name || '-',
      matchId: match.id,
    }
  };

  return postToSheets(row);
}

export async function syncAllHistoryToSheets(matches, players) {
  const rows = matches
    .filter(m => m.status === 'finished')
    .map(match => {
      const scorer = (match.events || []).filter(e => e.type === 'goal').map(e => e.scorerName).join(', ');
      const assists = (match.events || []).filter(e => e.assistId).map(e => e.assistName).join(', ');
      const mvp = computeMvp(match, players);
      return {
        date: new Date(match.date?.toDate ? match.date.toDate() : match.date).toLocaleDateString('it-IT'),
        result: `${match.redScore}-${match.blueScore}`,
        scorers: scorer,
        assists,
        mvp: mvp?.name || '-',
        matchId: match.id,
      };
    });

  return postToSheets({ action: 'sync_all', data: rows });
}

function computeMvp(match, players) {
  const scores = {};
  for (const ev of (match.events || [])) {
    if (ev.type === 'goal') {
      scores[ev.scorerId] = (scores[ev.scorerId] || 0) + 3;
      if (ev.assistId) scores[ev.assistId] = (scores[ev.assistId] || 0) + 2;
    }
    if (ev.type === 'autogoal') scores[ev.scorerId] = (scores[ev.scorerId] || 0) - 2;
  }
  if (Object.keys(scores).length === 0) return null;
  const topId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return players.find(p => p.id === topId) || null;
}
