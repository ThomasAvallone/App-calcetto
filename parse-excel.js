import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from './node_modules/xlsx/xlsx.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Configuration ────────────────────────────────────────────────────────────
const EXCEL_FILE = join(__dirname, 'SIRO stats.xlsx');
const OUTPUT_FILE = join(__dirname, 'parsed-matches.json');
const SHEET_NAME = 'Tabellini';

// Excel date serial to JS Date (Excel epoch is 1900-01-01, but offset by 25569 days to Unix epoch)
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || serial < 40000) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms);
}

// Attempt to parse a text date like "16-ago (al Benassi)" or "28-ago (mercoledì)"
// Returns a JS Date or null
const MONTH_IT = {
  gen: 0, feb: 1, mar: 2, apr: 3, mag: 4, giu: 5,
  lug: 6, ago: 7, set: 8, ott: 9, nov: 10, dic: 11,
};

function parseTextDate(text, currentYear) {
  if (typeof text !== 'string') return null;
  const m = text.match(/^(\d{1,2})-([a-z]{3})/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTH_IT[m[2].toLowerCase()];
  if (mon === undefined) return null;
  return new Date(currentYear, mon, day);
}

// ─── Load workbook ────────────────────────────────────────────────────────────
console.log(`Reading ${EXCEL_FILE}...`);
const wb = XLSX.read(readFileSync(EXCEL_FILE), { type: 'buffer' });
const ws = wb.Sheets[SHEET_NAME];
if (!ws) {
  console.error(`Sheet "${SHEET_NAME}" not found!`);
  process.exit(1);
}

const range = XLSX.utils.decode_range(ws['!ref']);
const MAX_ROW = range.e.r;
const MAX_COL = range.e.c;

function cellVal(r, c) {
  if (c > MAX_COL) return undefined;
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell ? cell.v : undefined;
}

function isNumber(v) {
  return typeof v === 'number';
}

function isSmallInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 500;
}

function isDateSerial(v) {
  return typeof v === 'number' && v > 40000 && v < 60000;
}

function isPlayerName(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isAutorete(v) {
  if (typeof v !== 'string') return false;
  const l = v.toLowerCase().trim();
  return l.startsWith('autorete ') || l.startsWith('aut. ') || l.startsWith('a. ');
}

function extractAutoreteName(v) {
  if (typeof v !== 'string') return null;
  const l = v.trim();
  // handle "autorete NAME", "aut. NAME", "a. NAME"
  let name = null;
  if (/^autorete\s+/i.test(l)) {
    name = l.replace(/^autorete\s+/i, '').trim();
  } else if (/^aut\.\s+/i.test(l)) {
    name = l.replace(/^aut\.\s+/i, '').trim();
  } else if (/^a\.\s+/i.test(l)) {
    name = l.replace(/^a\.\s+/i, '').trim();
  }
  return name;
}

function isStopWord(v) {
  if (typeof v !== 'string') return false;
  const l = v.toUpperCase().trim();
  return l === 'MVP' || l === 'BEST GOL' || l.startsWith('CLASSIFICA') ||
    l.startsWith('MARCATORI') || l === 'TOTALE GOL:' || l.startsWith('TOTALE');
}

// ─── Determine season boundaries ─────────────────────────────────────────────
const seasons = []; // [{season: "2018/2019", startRow: 2}, ...]
for (let r = 0; r <= MAX_ROW; r++) {
  for (let c = 0; c <= MAX_COL; c++) {
    const v = cellVal(r, c);
    if (typeof v === 'string' && v.includes('STAGIONE')) {
      const m = v.match(/(\d{4}\/\d{4})/);
      if (m) {
        seasons.push({ season: m[1], startRow: r });
      }
    }
  }
}
// Sort by startRow
seasons.sort((a, b) => a.startRow - b.startRow);
console.log(`Found ${seasons.length} seasons:`, seasons.map(s => `${s.season} (row ${s.startRow})`).join(', '));

function getSeasonForRow(r) {
  let current = '';
  for (const s of seasons) {
    if (s.startRow <= r) current = s.season;
    else break;
  }
  return current;
}

function getApproxYearForSeason(season) {
  // Season "2018/2019" -> use 2019 as the year for text date parsing
  const m = season.match(/(\d{4})\/(\d{4})/);
  return m ? parseInt(m[1], 10) : 2020;
}

// ─── Parse matches ────────────────────────────────────────────────────────────
// Match block offsets within a visual row (7 columns each)
const OFFSETS = [0, 7, 14, 21, 28];

const matches = [];
const warnings = [];

// We track which (row, offset) combinations have already been consumed as match headers
// so we don't double-count
const consumed = new Set();

// For each match we find, we store:
// {matchNumber, date, season, leftTeam[], rightTeam[], leftScore, rightScore, autogoals[]}

// State machine approach:
// Scan every row; for each offset, check if it's a match header
// If match header found at (r, offset): read score from row r+1, then player rows from r+2 onwards

// First pass: collect all match header positions
const matchHeaders = [];
for (let r = 0; r <= MAX_ROW; r++) {
  for (const offset of OFFSETS) {
    const c0 = cellVal(r, offset);
    const c1 = cellVal(r, offset + 1);

    // Match header: col0 is small positive int (match number), col1 is date serial
    if (isSmallInt(c0) && c0 >= 1 && isDateSerial(c1)) {
      const key = `${r}:${offset}`;
      if (!consumed.has(key)) {
        consumed.add(key);
        matchHeaders.push({ row: r, offset, matchNum: c0, dateSerial: c1 });
      }
    } else if (isSmallInt(c0) && c0 >= 1 && typeof c1 === 'string' && !isDateSerial(c1)) {
      // Handle text date like "16-ago (al Benassi)"
      const season = getSeasonForRow(r);
      const approxYear = getApproxYearForSeason(season);
      const parsedDate = parseTextDate(c1, approxYear);
      if (parsedDate) {
        const key = `${r}:${offset}`;
        if (!consumed.has(key)) {
          consumed.add(key);
          matchHeaders.push({ row: r, offset, matchNum: c0, dateSerial: null, textDate: c1, parsedDate });
        }
      }
    }
  }
}

console.log(`Found ${matchHeaders.length} potential match headers`);

// For each match header, parse the match
for (const hdr of matchHeaders) {
  const { row, offset, matchNum, dateSerial, parsedDate } = hdr;
  const season = getSeasonForRow(row);

  // Compute date
  let date = null;
  if (dateSerial !== null) {
    date = excelSerialToDate(dateSerial);
  } else if (parsedDate) {
    date = parsedDate;
  }

  // Score row: the row right after the header
  const scoreRow = row + 1;
  const leftScoreRaw = cellVal(scoreRow, offset);
  const rightScoreRaw = cellVal(scoreRow, offset + 3);

  // Validate scores
  let leftScore = null;
  let rightScore = null;
  if (isSmallInt(leftScoreRaw)) leftScore = leftScoreRaw;
  if (isSmallInt(rightScoreRaw)) rightScore = rightScoreRaw;

  if (leftScore === null || rightScore === null) {
    // Not a valid match - score row doesn't have scores
    warnings.push(`Row ${row} offset ${offset}: match ${matchNum} has no valid score (got ${leftScoreRaw} / ${rightScoreRaw}), skipping`);
    continue;
  }

  // Detect format: look for G/Ass header row
  // Check row scoreRow+1 for 'G' in offset+1 position
  const gAssRow = scoreRow + 1;
  const gVal = cellVal(gAssRow, offset + 1);
  const isNewFormat = (gVal === 'G');

  // Player rows start after score row (old format) or after G/Ass row (new format)
  const playerStartRow = isNewFormat ? gAssRow + 1 : scoreRow + 1;

  const leftTeam = [];
  const rightTeam = [];
  const autogoals = [];

  // Read player rows until we hit an empty row or stop word
  for (let pr = playerStartRow; pr <= MAX_ROW; pr++) {
    const p0 = cellVal(pr, offset);      // left name or autorete
    const p1 = cellVal(pr, offset + 1);  // left goals (new) or empty (old)
    const p2 = cellVal(pr, offset + 2);  // left goals (old) or assists (new)
    const p3 = cellVal(pr, offset + 3);  // right name or autorete
    const p4 = cellVal(pr, offset + 4);  // right goals (new) or empty (old)
    const p5 = cellVal(pr, offset + 5);  // right goals (old) or assists (new)

    // Check for stop conditions
    const leftIsEmpty = (p0 === undefined || p0 === null || p0 === '');
    const rightIsEmpty = (p3 === undefined || p3 === null || p3 === '');

    // If the whole row in our block is empty -> stop
    if (leftIsEmpty && rightIsEmpty) break;

    // Stop words
    if (typeof p0 === 'string' && isStopWord(p0)) break;
    if (typeof p3 === 'string' && isStopWord(p3)) break;

    // Process left side (col offset+0)
    if (!leftIsEmpty) {
      if (isAutorete(p0)) {
        const scorer = extractAutoreteName(p0);
        if (scorer) {
          // autorete in LEFT column position benefits the LEFT team
          // (the scorer is from the right team, scoring into their own net)
          // The count of own goals is in the goals position; if empty -> no own goal recorded
          // In new format: try col1 first, then col2 (some entries use the assist column)
          let ownGoalCount = 0;
          if (isNewFormat) {
            if (isNumber(p1) && p1 > 0) ownGoalCount = p1;
            else if (isNumber(p2) && p2 > 0) ownGoalCount = p2;
          } else {
            if (isNumber(p2) && p2 > 0) ownGoalCount = p2;
          }
          // Only record if there are actual own goals
          if (ownGoalCount > 0) {
            autogoals.push({ scorerName: scorer, benefitedTeam: 'left', count: ownGoalCount });
          }
        }
      } else if (typeof p0 === 'string' && !isStopWord(p0)) {
        // It's a player name
        let goals = 0;
        if (isNewFormat) {
          if (isNumber(p1)) goals = p1;
        } else {
          if (isNumber(p2)) goals = p2;
        }
        leftTeam.push({ name: p0.trim(), goals });
      }
    }

    // Process right side (col offset+3)
    if (!rightIsEmpty) {
      if (isAutorete(p3)) {
        const scorer = extractAutoreteName(p3);
        if (scorer) {
          // autorete in RIGHT column position benefits the RIGHT team
          // (the scorer is from the left team, scoring into their own net)
          // The count of own goals is in the goals position; if empty -> no own goal recorded
          // In new format: try col4 first, then col5 (some entries use the assist column)
          let ownGoalCount = 0;
          if (isNewFormat) {
            if (isNumber(p4) && p4 > 0) ownGoalCount = p4;
            else if (isNumber(p5) && p5 > 0) ownGoalCount = p5;
          } else {
            if (isNumber(p5) && p5 > 0) ownGoalCount = p5;
          }
          // Only record if there are actual own goals
          if (ownGoalCount > 0) {
            autogoals.push({ scorerName: scorer, benefitedTeam: 'right', count: ownGoalCount });
          }
        }
      } else if (typeof p3 === 'string' && !isStopWord(p3)) {
        // It's a player name
        let goals = 0;
        if (isNewFormat) {
          if (isNumber(p4)) goals = p4;
        } else {
          if (isNumber(p5)) goals = p5;
        }
        rightTeam.push({ name: p3.trim(), goals });
      }
    }
  }

  // Skip matches with no players (likely false positives or non-giocata)
  if (leftTeam.length === 0 && rightTeam.length === 0 && leftScore === 0 && rightScore === 0) {
    warnings.push(`Row ${row} offset ${offset}: match ${matchNum} has no players and score 0-0, skipping (likely non-giocata)`);
    continue;
  }

  matches.push({
    matchNumber: matchNum,
    date: date ? date.toISOString() : null,
    season,
    leftTeam,
    rightTeam,
    leftScore,
    rightScore,
    autogoals,
    _meta: {
      sourceRow: row,
      sourceOffset: offset,
      isNewFormat,
    },
  });
}

// Sort matches by season then matchNumber
matches.sort((a, b) => {
  if (a.season < b.season) return -1;
  if (a.season > b.season) return 1;
  return a.matchNumber - b.matchNumber;
});

// ─── Output ───────────────────────────────────────────────────────────────────
const output = {
  generatedAt: new Date().toISOString(),
  totalMatches: matches.length,
  seasons: seasons.map(s => s.season),
  matches,
};

writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== PARSING COMPLETE ===`);
console.log(`Total matches parsed: ${matches.length}`);
console.log(`Warnings: ${warnings.length}`);
if (warnings.length > 0) {
  warnings.forEach(w => console.log('  WARN:', w));
}

// Show first 3 matches
console.log('\n=== FIRST 3 MATCHES ===');
for (let i = 0; i < Math.min(3, matches.length); i++) {
  const m = matches[i];
  console.log(`\nMatch #${m.matchNumber} (${m.season})`);
  console.log(`  Date: ${m.date}`);
  console.log(`  Score: ${m.leftScore} - ${m.rightScore}`);
  console.log(`  Left team: ${m.leftTeam.map(p => `${p.name}(${p.goals})`).join(', ')}`);
  console.log(`  Right team: ${m.rightTeam.map(p => `${p.name}(${p.goals})`).join(', ')}`);
  if (m.autogoals.length > 0) {
    console.log(`  Autogoals: ${m.autogoals.map(ag => `${ag.scorerName}→${ag.benefitedTeam}`).join(', ')}`);
  }
}

// Show matches per season
console.log('\n=== MATCHES PER SEASON ===');
const bySeason = {};
for (const m of matches) {
  bySeason[m.season] = (bySeason[m.season] || 0) + 1;
}
for (const [season, count] of Object.entries(bySeason)) {
  console.log(`  ${season}: ${count} matches`);
}

console.log(`\nOutput written to: ${OUTPUT_FILE}`);
