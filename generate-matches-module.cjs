const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('parsed-matches.json', 'utf8'));
const rawMatches = raw.matches;

function normalizeName(name) {
  return name.replace(/^\*+/, '').trim().toUpperCase();
}

function isBadEntry(name) {
  const n = name.trim();
  if (n.startsWith('*') || n.length > 25) return true;
  if (/\b(passato|infortun|occorso|dopo)\b/i.test(n)) return true;
  return false;
}

const matches = [];
for (const m of rawMatches) {
  const leftTeam = [];
  for (const p of m.leftTeam) {
    if (isBadEntry(p.name) && p.goals === 0) continue;
    const name = normalizeName(p.name);
    if (!name || name === 'AUTOGOL') continue;
    const existing = leftTeam.find(e => e.name === name);
    if (existing) existing.goals += p.goals;
    else leftTeam.push({ name, goals: p.goals });
  }
  const rightTeam = [];
  for (const p of m.rightTeam) {
    if (isBadEntry(p.name) && p.goals === 0) continue;
    const name = normalizeName(p.name);
    if (!name || name === 'AUTOGOL') continue;
    const existing = rightTeam.find(e => e.name === name);
    if (existing) existing.goals += p.goals;
    else rightTeam.push({ name, goals: p.goals });
  }

  const autogoals = m.autogoals.map(ag => ({
    scorerName: normalizeName(ag.scorerName),
    benefitedTeam: ag.benefitedTeam,
  }));

  const date = m.date ? m.date.split('T')[0] : null;
  if (!date || leftTeam.length === 0 || rightTeam.length === 0) continue;

  matches.push({
    matchNum: m.matchNumber,
    date,
    leftScore: m.leftScore,
    rightScore: m.rightScore,
    leftTeam,
    rightTeam,
    autogoals,
  });
}

console.log(`Generating module with ${matches.length} matches...`);

const first = matches[0]?.date;
const last = matches[matches.length - 1]?.date;
const lines = matches.map(m => '  ' + JSON.stringify(m));
const content = `// Auto-generated from SIRO stats.xlsx
// ${matches.length} historical matches from ${first} to ${last}
// To regenerate: node parse-excel.js && node generate-matches-module.cjs

export const HISTORICAL_MATCHES = [
${lines.join(',\n')}
];
`;

fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/historicalMatches.js', content, 'utf8');
const size = fs.statSync('src/data/historicalMatches.js').size;
console.log(`Written src/data/historicalMatches.js (${(size/1024).toFixed(1)} KB)`);
