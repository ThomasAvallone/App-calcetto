// Utility per esportare dati dell'app (backup locale).
// Lato client: genera Blob e triggera il download.

import { getMs } from './dateUtils';

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// ─── JSON: dump completo ─────────────────────────────────────────────────────
export function exportJSON({ players, matches }) {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'calcetto-analytics',
    version: 1,
    players: players || [],
    matches: (matches || []).map(m => ({
      ...m,
      date: m.date?.toDate ? m.date.toDate().toISOString() : m.date,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `calcetto-backup-${todayStamp()}.json`);
}

// ─── CSV: helpers ────────────────────────────────────────────────────────────
// Trigger di formula CSV: un campo che inizia con questi caratteri viene
// interpretato come formula da Excel/Google Sheets (CSV injection). I nomi
// giocatore sono controllati dagli admin → li neutralizziamo con un apice.
const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function escapeCsv(val) {
  if (val == null) return '';
  let s = String(val);
  if (CSV_FORMULA_TRIGGER.test(s)) s = `'${s}`;
  // Quota se contiene separatori o terminatori di riga (incluso \r, RFC 4180).
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  return rows.map(r => r.map(escapeCsv).join(',')).join('\n');
}

// ─── CSV: partite conclusive ─────────────────────────────────────────────────
// buildMatchesCSV è puro (ritorna la stringa) → testabile senza DOM.
export function buildMatchesCSV(matches) {
  const finished = (matches || []).filter(m => m.status === 'finished');
  finished.sort((a, b) => getMs(a.date) - getMs(b.date));

  const rows = [
    ['Data', 'Squadra Rossa', 'Squadra Blu', 'Gol Rossi', 'Gol Blu', 'Risultato', 'Storica'],
  ];
  for (const m of finished) {
    const d = m.date?.toDate ? m.date.toDate() : m.date ? new Date(m.date) : null;
    const dateStr = d && !isNaN(d) ? d.toISOString().slice(0, 10) : '';
    const red = (m.redTeam || []).map(p => p.name).join('; ');
    const blue = (m.blueTeam || []).map(p => p.name).join('; ');
    const rs = m.redScore ?? 0;
    const bs = m.blueScore ?? 0;
    const outcome = rs > bs ? 'Rossa' : bs > rs ? 'Blu' : 'Pareggio';
    rows.push([dateStr, red, blue, rs, bs, outcome, m.isHistorical ? 'sì' : 'no']);
  }
  return toCsv(rows);
}

export function exportMatchesCSV(matches) {
  const blob = new Blob(['\uFEFF' + buildMatchesCSV(matches)], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `calcetto-partite-${todayStamp()}.csv`);
}

// ─── CSV: giocatori con stats principali ─────────────────────────────────────
// V/P/S = Vittorie / Pareggi / Sconfitte (ordine: wins, draws, losses).
// buildPlayersCSV è puro (ritorna la stringa) → testabile senza DOM.
export function buildPlayersCSV(players) {
  const rows = [
    ['Nome', 'Ruolo', 'Power Index', 'Partite', 'V', 'P', 'S', 'Gol', 'Assist', 'Autogol', 'Gol subiti (GK)', 'Turni GK'],
  ];
  const sorted = [...(players || [])].sort((a, b) => (b.powerIndex || 0) - (a.powerIndex || 0));
  for (const p of sorted) {
    const s = p.stats || {};
    rows.push([
      p.name,
      p.primaryRole || '',
      (p.powerIndex ?? 50).toFixed(1),
      s.matches ?? 0,
      s.wins ?? 0,
      s.draws ?? 0,
      s.losses ?? 0,
      s.goals ?? 0,
      s.assists ?? 0,
      s.autogoals ?? 0,
      s.gkGoalsConceded ?? 0,
      s.gkMatches ?? 0,
    ]);
  }
  return toCsv(rows);
}

export function exportPlayersCSV(players) {
  const blob = new Blob(['\uFEFF' + buildPlayersCSV(players)], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `calcetto-giocatori-${todayStamp()}.csv`);
}
