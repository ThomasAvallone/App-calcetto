import { safeDate } from './dateUtils';

function fmtICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function matchToVEVENT(match) {
  const start = safeDate(match.date);
  if (!start) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h
  const now = new Date();

  const redNames  = (match.redTeam  || []).map(p => p.name).join(', ');
  const blueNames = (match.blueTeam || []).map(p => p.name).join(', ');
  const teamsLine = (redNames || blueNames)
    ? `🔴 ${redNames || '—'} vs 🔵 ${blueNames || '—'}`
    : 'Giocatori da definire';

  return [
    'BEGIN:VEVENT',
    `UID:${match.id}@calcetto-analytics`,
    `DTSTAMP:${fmtICSDate(now)}`,
    `DTSTART:${fmtICSDate(start)}`,
    `DTEND:${fmtICSDate(end)}`,
    `SUMMARY:${escapeICS('⚽ Calcetto a 5')}`,
    `DESCRIPTION:${escapeICS(teamsLine)}`,
    'END:VEVENT',
  ].join('\r\n');
}

export function generateICS(matches) {
  const events = (Array.isArray(matches) ? matches : [matches])
    .map(matchToVEVENT)
    .filter(Boolean);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calcetto Analytics//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadICS(matches, filename = 'calcetto.ics') {
  const content = generateICS(matches);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
