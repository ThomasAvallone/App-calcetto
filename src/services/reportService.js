// ─── Report Generator: Match Preview & Post-Match Verdict ─────────────────────

import { withProgressiveScore } from '../utils/matchScore';

const CARESSA_INTROS = [
  "Signori e signore, benvenuti al tempio del calcio a cinque.",
  "Questa non è solo una partita. È un'epopea che si scrive sotto le luci al neon.",
  "Il fischio è imminente. I campioni sono pronti. La leggenda comincia adesso.",
  "Amici, quello che state per vedere non è calcio. È arte. Oscura, spietata, meravigliosa.",
  "Pregate, amici. Pregate. Perché quando inizia... non si torna più indietro.",
];

const WEATHER_COMMENTS = {
  sunny: ["Sole a picco, i muscoli ringraziano. La scusa dell'abbagliamento è ufficialmente revocata.", "Cielo limpido: nessun alibi, solo gol o brutte figure."],
  cloudy: ["Cielo nuvoloso: l'atmosfera perfetta per un'epica battaglia di mediocrità.", "Nuvole sparse. Il sole non vuole guardare."],
  rainy: ["Piove. Il campo è un pantano. Benvenuti nella vera Champions League della corsia industriale.", "Piove, governo ladro! Ma soprattutto, tiri in porta ladri."],
  cold: ["Temperatura polare. I portieri si scalderanno prendendo gol.", "Freddo cane. Chi urla più forte contro l'arbitro si scalda prima."],
  hot: ["Caldo infernale. MVP automatico a chi regge i 90 minuti senza fingere un crampo.", "Afa totale. Sudare è obbligatorio, giocare bene è facoltativo."],
  wind: ["Vento forte: le scuse sono già pronte per i tiri a campanile.", "Libeccio a 40km/h. I corner saranno un'avventura."],
};

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getWeatherComment(condition) {
  const key = condition?.toLowerCase() || 'cloudy';
  const list = WEATHER_COMMENTS[key] || WEATHER_COMMENTS.cloudy;
  return getRandomElement(list);
}

function getCaressaIntro() {
  return getRandomElement(CARESSA_INTROS);
}

const WEATHER_EMOJI = {
  sunny: '☀️', cloudy: '☁️', rainy: '🌧️', cold: '🥶', hot: '🥵', wind: '💨',
};

export function generateMatchPreview({ redTeam, blueTeam, weather, date }) {
  const rawDate = date
    ? new Date(date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateStr = rawDate.charAt(0).toUpperCase() + rawDate.slice(1); // "lunedì" → "Lunedì"

  const redPI = redTeam.reduce((s, p) => s + (p.powerIndex || 50), 0) / (redTeam.length || 1);
  const bluePI = blueTeam.reduce((s, p) => s + (p.powerIndex || 50), 0) / (blueTeam.length || 1);
  const diff = Math.abs(redPI - bluePI).toFixed(1);

  const favorite = redPI > bluePI + 5 ? `🔴 Rossi favoriti _(+${diff} PI)_`
    : bluePI > redPI + 5 ? `🔵 Blu favoriti _(+${diff} PI)_`
    : '⚖️ Equilibrio perfetto';

  const redGoalkeepers = redTeam.filter(p => p.primaryRole === 'Portiere' || p.secondaryRole === 'Portiere');
  const blueGoalkeepers = blueTeam.filter(p => p.primaryRole === 'Portiere' || p.secondaryRole === 'Portiere');

  const redTopPlayer = [...redTeam].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50))[0];
  const blueTopPlayer = [...blueTeam].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50))[0];

  // Build potential objectives
  const GOAL_MS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];
  const ASSIST_MS = [5, 10, 15, 20, 25, 30, 50, 75, 100];
  const MATCH_MS = [10, 25, 50, 75, 100, 150, 200];
  const objectives = [];
  for (const p of [...redTeam, ...blueTeam]) {
    const g = p.stats?.goals || 0;
    // p.stats.assists include già gli assist storici (sommati in recalculatePlayerStats):
    // non ri-aggiungere p.historicalStats per evitare il doppio conteggio.
    const a = p.stats?.assists || 0;
    const m = p.stats?.matches || 0;
    const nextG = GOAL_MS.find(x => x > g);
    if (nextG && nextG - g <= 3) objectives.push(`⚽ ${p.name} a ${nextG - g} gol dai ${nextG} totali`);
    const nextA = ASSIST_MS.find(x => x > a);
    if (nextA && nextA - a <= 2) objectives.push(`🎯 ${p.name} a ${nextA - a} assist dai ${nextA} totali`);
    if (MATCH_MS.find(x => x === m + 1)) objectives.push(`🏟️ ${p.name} raggiunge le ${m + 1} presenze!`);
    if (p.streak?.type === 'win' && p.streak.count >= 3) objectives.push(`🔥 ${p.name}: ${p.streak.count} vittorie di fila`);
  }

  // Sezioni costruite come blocchi e unite con riga vuota singola: niente righe
  // bianche spurie (i campi assenti vengono semplicemente saltati) e niente
  // righe-separatore lunghe che su WhatsApp andrebbero a capo impaginando male.
  const sections = [];

  sections.push(`⚽ *MATCH PREVIEW*\n📅 ${dateStr}`);

  const weatherBlock = ['🌤️ *Meteo*'];
  if (weather?.temp) {
    const emoji = WEATHER_EMOJI[weather?.condition] || '🌡️';
    weatherBlock.push(`${emoji} ${weather.temp}°C${weather.description ? ` · ${weather.description}` : ''}`);
  }
  weatherBlock.push(`_${getWeatherComment(weather?.condition)}_`);
  sections.push(weatherBlock.join('\n'));

  if (objectives.length > 0) {
    // Cap a 8 per non trasformare la sezione in un muro di testo su WhatsApp
    // (con due rose piene di traguardi imminenti si arriverebbe a 12-15 righe).
    const shown = objectives.slice(0, 8);
    const extra = objectives.length - shown.length;
    const objLines = extra > 0 ? [...shown, `_…e altri ${extra} traguardi in palio_`] : shown;
    sections.push(`🎯 *Obiettivi del match*\n${objLines.join('\n')}`);
  }

  const redBlock = ['🔴 *Squadra Rossa*', ...redTeam.map(p => `• ${p.name}`)];
  if (redGoalkeepers.length) redBlock.push(`🧤 _${redGoalkeepers.map(p => p.name).join(', ')}_`);
  sections.push(redBlock.join('\n'));

  const blueBlock = ['🔵 *Squadra Blu*', ...blueTeam.map(p => `• ${p.name}`)];
  if (blueGoalkeepers.length) blueBlock.push(`🧤 _${blueGoalkeepers.map(p => p.name).join(', ')}_`);
  sections.push(blueBlock.join('\n'));

  const pronosticoBlock = [`📊 *Pronostico*`, favorite];
  if (redTopPlayer || blueTopPlayer) {
    pronosticoBlock.push(`⭐ Occhio a: ${redTopPlayer?.name || '–'} 🔴 · ${blueTopPlayer?.name || '–'} 🔵`);
  }
  sections.push(pronosticoBlock.join('\n'));

  sections.push('_Preparate i fazzoletti. O i cori. Dipende da che parte state._');

  return sections.join('\n\n');
}

// MVP "tecnico" della partita dagli eventi (logica pura, source of truth unica).
// Punteggio pesato: gol=+3, assist=+2, autogol=-2. Ritorna null se nessun
// giocatore ha punteggio positivo (così una partita decisa da un solo autogol
// non incorona MVP l'autogolista). `name` viene dagli eventi (live), i caller
// possono fare fallback su un lookup per id (partite storiche senza scorerName).
export function computeMatchMVP(events) {
  const scores = {};
  const names = {};
  for (const ev of (events || [])) {
    const sid = ev.scorerId;
    if (ev.type === 'goal') {
      if (sid) { scores[sid] = (scores[sid] || 0) + 3; if (ev.scorerName) names[sid] = ev.scorerName; }
      if (ev.assistId) {
        scores[ev.assistId] = (scores[ev.assistId] || 0) + 2;
        if (ev.assistName && ev.assistName !== 'Nessuno') names[ev.assistId] = ev.assistName;
      }
    } else if (ev.type === 'autogoal' && sid) {
      scores[sid] = (scores[sid] || 0) - 2;
      if (ev.scorerName) names[sid] = ev.scorerName;
    }
  }
  const entry = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!entry || entry[1] <= 0) return null;
  const [id, points] = entry;
  const goals = (events || []).filter(e => e.type === 'goal' && e.scorerId === id).length;
  const assists = (events || []).filter(e => e.type === 'goal' && e.assistId === id).length;
  return { id, name: names[id] || null, points, goals, assists };
}

export function generateMatchReport(match, players) {
  // Lookup by id per le partite storiche (che hanno solo scorerId, non scorerName)
  const playerById = Object.fromEntries(players.filter(p => p.id).map(p => [p.id, p.name]));
  const resolveName = (ev) => ev.scorerName || playerById[ev.scorerId] || '?';

  const goals = (match.events || []).filter(e => e.type === 'goal');
  const autogoals = (match.events || []).filter(e => e.type === 'autogoal');

  const redWon = match.redScore > match.blueScore;
  const draw = match.redScore === match.blueScore;
  const winner = draw ? 'PAREGGIO' : redWon ? '🔴 VITTORIA ROSSI' : '🔵 VITTORIA BLU';

  // MVP "tecnico" — stessa logica usata dalla card del Report Modal (computeMatchMVP)
  const mvp = computeMatchMVP(match.events);
  const mvpName = mvp ? (mvp.name || playerById[mvp.id] || '?') : null;

  // GK stats — legge gkConcededName dall'evento, fallback a playerById
  const gkGoals = {};
  const gkNames = {};
  for (const ev of [...goals, ...autogoals]) {
    if (ev.gkConcededId) {
      gkGoals[ev.gkConcededId] = (gkGoals[ev.gkConcededId] || 0) + 1;
      if (ev.gkConcededName) gkNames[ev.gkConcededId] = ev.gkConcededName;
    }
  }
  const worstGkEntry = Object.entries(gkGoals).sort((a, b) => b[1] - a[1])[0];
  const worstGkName = worstGkEntry ? (gkNames[worstGkEntry[0]] || playerById[worstGkEntry[0]] || '?') : null;

  // Top scorer — legge scorerName dall'evento
  const goalCounts = {};
  const scorerNames = {};
  for (const ev of goals) {
    if (ev.scorerId) {
      goalCounts[ev.scorerId] = (goalCounts[ev.scorerId] || 0) + 1;
      if (ev.scorerName) scorerNames[ev.scorerId] = ev.scorerName;
    }
  }
  const topScorerEntry = Object.entries(goalCounts).sort((a, b) => b[1] - a[1])[0];
  const topScorerName = topScorerEntry ? (scorerNames[topScorerEntry[0]] || playerById[topScorerEntry[0]] || '?') : null;

  // Top assist — legge assistName dall'evento
  const assistCounts = {};
  const assistNames = {};
  for (const ev of goals) {
    if (ev.assistId) {
      assistCounts[ev.assistId] = (assistCounts[ev.assistId] || 0) + 1;
      if (ev.assistName) assistNames[ev.assistId] = ev.assistName;
    }
  }
  const topAssistEntry = Object.entries(assistCounts).sort((a, b) => b[1] - a[1])[0];
  const topAssistName = topAssistEntry ? (assistNames[topAssistEntry[0]] || playerById[topAssistEntry[0]] || '?') : null;

  // Autogoals — legge scorerName dall'evento
  const autogoalCounts = {};
  const autogoalNames = {};
  for (const ev of autogoals) {
    if (ev.scorerId) {
      autogoalCounts[ev.scorerId] = (autogoalCounts[ev.scorerId] || 0) + 1;
      if (ev.scorerName) autogoalNames[ev.scorerId] = ev.scorerName;
    }
  }
  const topAutogoalEntry = Object.entries(autogoalCounts).sort((a, b) => b[1] - a[1])[0];
  const topAutogoalName = topAutogoalEntry ? (autogoalNames[topAutogoalEntry[0]] || playerById[topAutogoalEntry[0]] || '?') : null;

  // "Premi di Latta" — completamente basati su dati degli eventi, sempre aggiornati
  const tinAwards = [];
  if (topScorerEntry && topScorerEntry[1] >= 2) {
    const label = topScorerEntry[1] >= 3 ? '🎩 Hat Trick' : '⚽ Capocannoniere';
    tinAwards.push(`${label}: ${topScorerName} (${topScorerEntry[1]} gol)`);
  }
  if (topAssistEntry && topAssistEntry[1] >= 2) tinAwards.push(`🎯 Re degli Assist: ${topAssistName} (${topAssistEntry[1]} assist)`);
  if (worstGkEntry) tinAwards.push(`🚪 Porta Girevole: ${worstGkName} (${worstGkEntry[1]} gol subiti)`);
  if (topAutogoalEntry) tinAwards.push(`🤦 Amico degli Avversari: ${topAutogoalName} (${topAutogoalEntry[1]} autogol)`);

  // Scorers timeline (le partite storiche non hanno minute, le mettiamo in coda).
  // Parziale progressivo dalla source of truth condivisa (withProgressiveScore).
  const timeline = [...goals, ...autogoals].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
  const timelineWithPartial = withProgressiveScore(timeline);

  const dateStr = match.date
    ? new Date(match.date?.toDate ? match.date.toDate() : match.date)
        .toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '?';

  return `⚽ CALCETTO ANALYTICS — VERDETTO FINALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 ${dateStr}
${winner}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏟️ TABELLINO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 Rossi ${match.redScore} — ${match.blueScore} Blu 🔵

📋 CRONACA GOL
${timelineWithPartial.length === 0 ? '  Nessun gol (un capolavoro di inutilità)' : timelineWithPartial.map(ev => {
    const min = ev.minute != null ? `${String(ev.minute).padStart(2, '0')}'` : '  ';
    const team = ev.team === 'red' ? '🔴' : '🔵';
    const partial = `[${ev.partialRed}–${ev.partialBlue}]`;
    if (ev.type === 'goal') {
      const assist = ev.assistName && ev.assistName !== 'Nessuno' ? ` (assist: ${ev.assistName})` : '';
      return `  ${min} ${team} ⚽ ${resolveName(ev)}${assist} ${partial}`;
    } else {
      return `  ${min} ${team} 🤦 AUTOGOL ${resolveName(ev)} ${partial}`;
    }
  }).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 ROSSI: ${(match.redTeam || []).map(p => p.name).join(' • ')}
🔵 BLU: ${(match.blueTeam || []).map(p => p.name).join(' • ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 MVP TECNICO
${mvpName ? `⭐ ${mvpName} (${mvp.points} pt)` : 'Nessun meritevole trovato'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🥫 PREMI DI LATTA
${tinAwards.length > 0 ? tinAwards.join('\n') : 'Stasera tutti promossi. Miracolo.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Powered by Calcetto Analytics`;
}
