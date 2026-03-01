#!/usr/bin/env node
/**
 * Generates src/data/historicalMatches.js from parsed-matches.json
 * Run: node generate-matches-module.js
 */
const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('parsed-matches.json', 'utf8'));
const rawMatches = raw.matches;

// Name normalization - strip leading * and extra whitespace
function normalizeName(name) {
  return name.replace(/^\*+/, '').trim().toUpperCase();
}

// Known notes/non-player patterns to skip
function isBadEntry(name) {
  const n = name.trim();
  // Skip: starts with *, length > 25, contains certain Italian note words
  if (n.startsWith('*') || n.length > 25) return true;
  if (/\b(passato|infortun|occorso|dopo)\b/i.test(n)) return true;
  return false;
}

const matches = [];
for (const m of rawMatches) {
  // Clean up player lists
  const leftTeam = [];
  for (const p of m.leftTeam) {
    if (isBadEntry(p.name) && p.goals === 0) continue; // skip note with 0 goals
    const name = normalizeName(p.name);
    if (!name || name === 'AUTOGOL') continue;
    // Merge duplicates (e.g. "MASSI" and "*MASSI")
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

  // Normalize autogoal scorer names
  const autogoals = m.autogoals.map(ag => ({
    scorerName: normalizeName(ag.scorerName),
    benefitedTeam: ag.benefitedTeam,
  }));

  // Use just the date string (YYYY-MM-DD), drop time
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

// Write JS module
const content = `// Auto-generated from SIRO stats.xlsx
// Run: node parse-excel.js && node generate-matches-module.js to regenerate
// ${matches.length} historical matches from ${matches[0]?.date} to ${matches[matches.length - 1]?.date}

export const HISTORICAL_MATCHES = ${JSON.stringify(matches, null, 0)
  .replace(/},\{/g, '},\n  {')
  .replace(/^\[/, '[\n  ')
  .replace(/\]$/, '\n]')};
`;

fs.writeFileSync('src/data/historicalMatches.js', content, 'utf8');
const size = fs.statSync('src/data/historicalMatches.js').size;
console.log(`Written src/data/historicalMatches.js (${(size/1024).toFixed(1)} KB)`);
