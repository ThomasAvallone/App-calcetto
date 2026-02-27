// ─── Report Generator: Match Preview & Post-Match Verdict ─────────────────────

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

export function generateMatchPreview({ redTeam, blueTeam, weather, date }) {
  const dateStr = date
    ? new Date(date).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const redPI = redTeam.reduce((s, p) => s + (p.powerIndex || 50), 0) / (redTeam.length || 1);
  const bluePI = blueTeam.reduce((s, p) => s + (p.powerIndex || 50), 0) / (blueTeam.length || 1);

  const favorite = redPI > bluePI + 5 ? '🔴 Rossi favoriti' : bluePI > redPI + 5 ? '🔵 Blu favoriti' : '⚖️ Equilibrio perfetto';
  const diff = Math.abs(redPI - bluePI).toFixed(1);

  const redGoalkeepers = redTeam.filter(p => p.primaryRole === 'Portiere' || p.secondaryRole === 'Portiere');
  const blueGoalkeepers = blueTeam.filter(p => p.primaryRole === 'Portiere' || p.secondaryRole === 'Portiere');

  const redTopPlayer = [...redTeam].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50))[0];
  const blueTopPlayer = [...blueTeam].sort((a, b) => (b.powerIndex || 50) - (a.powerIndex || 50))[0];

  return `⚽ CALCETTO ANALYTICS — MATCH PREVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 ${dateStr}

🎙️ INTRO CARESSA
"${getCaressaIntro()}"

🌤️ METEO (quasi reale, comunque ironico)
${getWeatherComment(weather?.condition)}
${weather?.temp ? `🌡️ ${weather.temp}°C — ${weather.description || ''}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 SQUADRA ROSSA (PI: ${redPI.toFixed(1)})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${redTeam.map(p => `  ${getRoleIcon(p.primaryRole)} ${p.name.padEnd(18)} PI: ${(p.powerIndex || 50).toFixed(0)}`).join('\n')}
${redGoalkeepers.length ? `🧤 GK naturali: ${redGoalkeepers.map(p => p.name).join(', ')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 SQUADRA BLU (PI: ${bluePI.toFixed(1)})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${blueTeam.map(p => `  ${getRoleIcon(p.primaryRole)} ${p.name.padEnd(18)} PI: ${(p.powerIndex || 50).toFixed(0)}`).join('\n')}
${blueGoalkeepers.length ? `🧤 GK naturali: ${blueGoalkeepers.map(p => p.name).join(', ')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PRONOSTICO
${favorite} (distacco: ${diff} PI)
⭐ Uomo da tenere d'occhio (Rossi): ${redTopPlayer?.name || '-'}
⭐ Uomo da tenere d'occhio (Blu): ${blueTopPlayer?.name || '-'}

Preparate i fazzoletti. O i cori. Dipende da che parte state.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

export function generateMatchReport(match, players) {
  const goals = (match.events || []).filter(e => e.type === 'goal');
  const autogoals = (match.events || []).filter(e => e.type === 'autogoal');

  const redWon = match.redScore > match.blueScore;
  const draw = match.redScore === match.blueScore;
  const winner = draw ? 'PAREGGIO' : redWon ? '🔴 VITTORIA ROSSI' : '🔵 VITTORIA BLU';

  // MVP: player with best score (goal=3, assist=2, autogoal=-2)
  const playerScores = {};
  for (const ev of (match.events || [])) {
    if (ev.type === 'goal') {
      playerScores[ev.scorerId] = (playerScores[ev.scorerId] || 0) + 3;
      if (ev.assistId) playerScores[ev.assistId] = (playerScores[ev.assistId] || 0) + 2;
    }
    if (ev.type === 'autogoal') playerScores[ev.scorerId] = (playerScores[ev.scorerId] || 0) - 2;
  }

  const mvpEntry = Object.entries(playerScores).sort((a, b) => b[1] - a[1])[0];
  const mvp = mvpEntry ? players.find(p => p.id === mvpEntry[0]) : null;

  // GK stats this match
  const gkGoals = {};
  for (const ev of goals) {
    if (ev.gkConcededId) gkGoals[ev.gkConcededId] = (gkGoals[ev.gkConcededId] || 0) + 1;
  }
  const worstGkEntry = Object.entries(gkGoals).sort((a, b) => b[1] - a[1])[0];
  const worstGk = worstGkEntry ? players.find(p => p.id === worstGkEntry[0]) : null;

  // "Premi di Latta"
  const tinAwards = [];
  if (worstGk) tinAwards.push(`🚪 Porta Girevole: ${worstGk.name} (${worstGkEntry[1]} gol subiti)`);
  const topAutogoal = autogoals.length > 0
    ? autogoals.reduce((acc, e) => { acc[e.scorerId] = (acc[e.scorerId] || 0) + 1; return acc; }, {})
    : {};
  const topAutogoalEntry = Object.entries(topAutogoal).sort((a, b) => b[1] - a[1])[0];
  if (topAutogoalEntry) {
    const p = players.find(pl => pl.id === topAutogoalEntry[0]);
    tinAwards.push(`🤦 Amico degli Avversari: ${p?.name || '?'} (${topAutogoalEntry[1]} autogol)`);
  }

  // Scorers timeline
  const timeline = [...goals, ...autogoals].sort((a, b) => a.minute - b.minute);

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
${timeline.length === 0 ? '  Nessun gol (un capolavoro di inutilità)' : timeline.map(ev => {
    if (ev.type === 'goal') {
      const assist = ev.assistName ? ` (assist: ${ev.assistName})` : '';
      const team = ev.team === 'red' ? '🔴' : '🔵';
      return `  ${String(ev.minute).padStart(2, '0')}' ${team} ⚽ ${ev.scorerName}${assist}`;
    } else {
      const team = ev.team === 'red' ? '🔴' : '🔵';
      return `  ${String(ev.minute).padStart(2, '0')}' ${team} 🤦 AUTOGOL ${ev.scorerName}`;
    }
  }).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 ROSSI: ${(match.redTeam || []).map(p => p.name).join(' • ')}
🔵 BLU: ${(match.blueTeam || []).map(p => p.name).join(' • ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 MVP TECNICO
${mvp ? `⭐ ${mvp.name} (${mvpEntry[1]} pt)` : 'Nessun meritevole trovato'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🥫 PREMI DI LATTA
${tinAwards.length > 0 ? tinAwards.join('\n') : 'Stasera tutti promossi. Miracolo.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Powered by Calcetto Analytics`;
}

function getRoleIcon(role) {
  const icons = {
    'Portiere': '🧤',
    'Difensore': '🛡️',
    'Centrocampista': '⚙️',
    'Attaccante': '⚡',
  };
  return icons[role] || '⚽';
}
