export const WEATHER_LABELS = {
  sunny:  'Soleggiato ☀️',
  cloudy: 'Nuvoloso ☁️',
  rainy:  'Pioggia 🌧️',
  cold:   'Freddo 🥶',
  hot:    'Caldo 🔥',
  wind:   'Vento 💨',
};

export const WEATHER_COLORS = {
  sunny:  '#F6E05E',
  cloudy: '#A0AEC0',
  rainy:  '#63B3ED',
  cold:   '#90CDF4',
  hot:    '#FC8181',
  wind:   '#68D391',
};

// Returns sorted array of per-condition stats from finishedMatches
export function computeWeatherStats(finishedMatches) {
  const conds = {};

  for (const m of finishedMatches) {
    const cond = m.weather?.condition;
    if (!cond) continue;
    if (!conds[cond]) {
      conds[cond] = {
        key: cond,
        label: WEATHER_LABELS[cond] || cond,
        color: WEATHER_COLORS[cond] || '#A0AEC0',
        matches: 0, goals: 0,
        redWins: 0, blueWins: 0, draws: 0,
        playerContrib: {},
      };
    }
    const c = conds[cond];
    c.matches++;
    c.goals += (m.redScore || 0) + (m.blueScore || 0);
    if ((m.redScore || 0) > (m.blueScore || 0)) c.redWins++;
    else if ((m.blueScore || 0) > (m.redScore || 0)) c.blueWins++;
    else c.draws++;

    for (const ev of (m.events || [])) {
      if (ev.type === 'goal' && ev.scorerId) {
        if (!c.playerContrib[ev.scorerId]) c.playerContrib[ev.scorerId] = { name: ev.scorerName, goals: 0, assists: 0 };
        c.playerContrib[ev.scorerId].goals++;
      }
      if (ev.type === 'goal' && ev.assistId) {
        if (!c.playerContrib[ev.assistId]) c.playerContrib[ev.assistId] = { name: ev.assistName, goals: 0, assists: 0 };
        c.playerContrib[ev.assistId].assists++;
      }
    }
  }

  return Object.values(conds)
    .map(c => ({
      ...c,
      avgGoals: c.matches > 0 ? (c.goals / c.matches).toFixed(1) : '0.0',
      mvp: Object.values(c.playerContrib)
        .map(p => ({ ...p, score: p.goals + p.assists * 0.5 }))
        .sort((a, b) => b.score - a.score)[0] || null,
    }))
    .sort((a, b) => b.matches - a.matches);
}

// Compact summary string for AI prompts
export function weatherStatsForAI(weatherStats) {
  if (!weatherStats || weatherStats.length === 0) return '';
  const lines = weatherStats
    .filter(w => w.matches >= 2)
    .map(w =>
      `- ${w.label}: ${w.matches} partite, media ${w.avgGoals} gol/partita` +
      (w.mvp ? `, MVP ${w.mvp.name} (${w.mvp.goals}G ${w.mvp.assists}A)` : '')
    );
  return lines.length > 0 ? '\n\nMETEO & RENDIMENTO:\n' + lines.join('\n') : '';
}
