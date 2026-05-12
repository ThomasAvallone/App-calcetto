import { safeDate } from './dateUtils';

function fmtICSDate(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545: lines longer than 75 octets must be folded with CRLF + space.
// Operate on bytes (UTF-8) because emoji are multi-byte.
function foldLine(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  const decoder = new TextDecoder();
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const max = first ? 75 : 74; // leading space on continuation counts
    let end = Math.min(i + max, bytes.length);
    // Don't split in the middle of a UTF-8 sequence: back off until we hit a leading byte
    while (end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
    const chunk = decoder.decode(bytes.slice(i, end));
    out.push(first ? chunk : ' ' + chunk);
    i = end;
    first = false;
  }
  return out.join('\r\n');
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
    foldLine(`UID:${match.id}@calcetto-analytics`),
    `DTSTAMP:${fmtICSDate(now)}`,
    `DTSTART:${fmtICSDate(start)}`,
    `DTEND:${fmtICSDate(end)}`,
    foldLine(`SUMMARY:${escapeICS('⚽ Calcetto a 5')}`),
    foldLine(`DESCRIPTION:${escapeICS(teamsLine)}`),
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
    '', // trailing CRLF required by some parsers
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
