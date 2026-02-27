import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

function safeDate(val) {
  if (!val) return '-';
  if (val?.toDate) return format(val.toDate(), 'dd/MM/yyyy HH:mm', { locale: it });
  if (val instanceof Date) return format(val, 'dd/MM/yyyy HH:mm', { locale: it });
  return String(val);
}

export function downloadExcel(players, matches) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Players ────────────────────────────────────────────────────────
  const playerRows = players.map(p => ({
    'Nome': p.name,
    'Ruolo Primario': p.primaryRole || '-',
    'Ruolo Secondario': p.secondaryRole || '-',
    'Power Index': p.powerIndex || 50,
    'Gol': p.stats?.goals || 0,
    'Assist': p.stats?.assists || 0,
    'Autogol': p.stats?.autogoals || 0,
    'Partite GK': p.stats?.gkMatches || 0,
    'Gol Subiti (GK)': p.stats?.gkGoalsConceded || 0,
    'Vittorie': p.stats?.wins || 0,
    'Pareggi': p.stats?.draws || 0,
    'Sconfitte': p.stats?.losses || 0,
    'Partite': p.stats?.matches || 0,
  }));
  const wsPlayers = XLSX.utils.json_to_sheet(playerRows);
  XLSX.utils.book_append_sheet(wb, wsPlayers, 'Giocatori');

  // ── Sheet 2: Matches ────────────────────────────────────────────────────────
  const matchRows = matches.map(m => ({
    'Data': safeDate(m.date),
    'Squadra Rossa': (m.redTeam || []).map(p => p.name).join(', '),
    'Gol Rossi': m.redScore || 0,
    'Gol Blu': m.blueScore || 0,
    'Squadra Blu': (m.blueTeam || []).map(p => p.name).join(', '),
    'Marcatori': (m.events || []).filter(e => e.type === 'goal').map(e => `${e.scorerName} (${e.minute}')`).join(', '),
    'Assist': (m.events || []).filter(e => e.assistId).map(e => `${e.assistName}`).join(', '),
    'Autogol': (m.events || []).filter(e => e.type === 'autogoal').map(e => e.scorerName).join(', '),
    'Stato': m.status || 'pending',
    'ID Partita': m.id,
  }));
  const wsMatches = XLSX.utils.json_to_sheet(matchRows);
  XLSX.utils.book_append_sheet(wb, wsMatches, 'Partite');

  // ── Sheet 3: Events detail ───────────────────────────────────────────────────
  const eventRows = [];
  for (const m of matches) {
    for (const ev of (m.events || [])) {
      eventRows.push({
        'Data Partita': safeDate(m.date),
        'ID Partita': m.id,
        'Tipo': ev.type,
        'Minuto': ev.minute,
        'Squadra': ev.team,
        'Giocatore': ev.scorerName || '-',
        'Assist': ev.assistName || '-',
        'Portiere Avversario': ev.gkConcededName || '-',
      });
    }
  }
  const wsEvents = XLSX.utils.json_to_sheet(eventRows);
  XLSX.utils.book_append_sheet(wb, wsEvents, 'Eventi');

  // Style column widths
  [wsPlayers, wsMatches, wsEvents].forEach(ws => {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    ws['!cols'] = Array(range.e.c + 1).fill({ wch: 20 });
  });

  XLSX.writeFile(wb, `calcetto-analytics-${format(new Date(), 'yyyyMMdd')}.xlsx`);
}
