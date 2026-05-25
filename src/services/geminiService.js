// ─── Gemini AI Service ────────────────────────────────────────────────────────
// Tutte le chiamate all'API Gemini passano da qui.
// La chiave viene letta dall'env e non è mai esposta nel codice sorgente.
// Protezione aggiuntiva: imposta la restrizione HTTP referrer su Google Cloud Console.

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Gerarchia modelli: fast = velocità/costo, pro = ragionamento/qualità
const MODELS = {
  fast: [
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
  ],
  pro: [
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
  ],
};

// I modelli Gemini 3.x usano thinking tokens interni che scalano
// dal budget maxOutputTokens. Senza margine, l'output visibile viene troncato.
const THINKING_MODELS = new Set([
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
]);

// AI call counter — persistito in localStorage, non si azzera al refresh
const _AI_CALL_KEY = 'calcetto_ai_call_count';
let _aiCallCount = parseInt(localStorage.getItem(_AI_CALL_KEY) || '0', 10);
const _aiCallListeners = new Set();
export function getAICallCount() { return _aiCallCount; }
export function resetAICallCount() { _aiCallCount = 0; localStorage.setItem(_AI_CALL_KEY, '0'); _aiCallListeners.forEach(fn => fn(_aiCallCount)); }
export function onAICallCountChange(fn) { _aiCallListeners.add(fn); return () => _aiCallListeners.delete(fn); }

// tier: 'fast' (default) | 'pro' (task di ragionamento/qualità)
async function callGemini(prompt, { temperature = 0.85, maxTokens = 600, tier = 'fast' } = {}) {
  if (!API_KEY) throw new Error('Chiave Gemini non configurata (VITE_GEMINI_API_KEY)');

  const models = MODELS[tier];
  let lastError;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        // Backoff esponenziale: 1s, 2s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      // Thinking model: serve margine extra per il reasoning
      const effectiveMaxTokens = THINKING_MODELS.has(model)
        ? Math.max(maxTokens * 4, 2000)
        : maxTokens;

      const res = await fetch(`${url}?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: effectiveMaxTokens },
        }),
      });

      // Retry sullo stesso modello su 503/429
      if (res.status === 503 || res.status === 429) {
        const err = await res.json().catch(() => ({}));
        lastError = new Error(err?.error?.message || `Errore API Gemini: ${res.status}`);
        continue;
      }

      // Errore non recuperabile: salta al modello successivo
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        lastError = new Error(err?.error?.message || `Errore API Gemini: ${res.status}`);
        break;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (!text) throw new Error('Risposta AI vuota o bloccata dal filtro di sicurezza');
      _aiCallCount++;
      localStorage.setItem(_AI_CALL_KEY, String(_aiCallCount));
      _aiCallListeners.forEach(fn => fn(_aiCallCount));
      return text;
    }
    // Tutti i retry esauriti su questo modello → prova il prossimo
  }

  throw lastError;
}

function fmtMatchDate(d) {
  if (!d) return '';
  const dt = d?.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Commento narrativo post-partita ─────────────────────────────────────────
const _COMMENTARY_STYLES = [
  'Sei un vecchio cronista radiofonico anni \'70, incalzante e nostalgico, con esclamazioni improvvise e dettagli pittoreschi. Parli come se stessi raccontando la cosa più importante della settimana.',
  'Sei un giornalista investigativo convinto che dietro ogni risultato ci sia una storia nascosta. Cerca le cause, i colpevoli, i silenzi. Ogni gol è un indizio.',
  'Sei un telecronista straniero (magari britannico) che osserva il calcetto italiano con meraviglia antropologica, come se fosse un rituale tribale affascinante e incomprensibile.',
  'Sei un romanziere che usa la partita come metafora della vita: ogni gol, ogni errore, ogni pausa è simbolo di qualcosa di più grande. Tono letterario, denso, con immagini forti.',
  'Sei un vecchio filosofo greco che commenta la partita come se fosse una tragedia o una commedia classica: destino, hybris, catarsi. I giocatori sono archetipi.',
  'Sei un critico cinematografico che recensisce la partita come un film: c\'è un protagonista, un villain, colpi di scena, una regia discutibile, forse un finale insoddisfacente.',
  'Sei un cantastorie di piazza del sud Italia: ritmo incalzante, iperboli colorate, riferimenti alla famiglia e all\'onore, un umorismo graffiante e affettuoso.',
  'Sei un commentatore spietato alla Enzo Biagi: frasi secche, tagliente, niente fronzoli. Dici esattamente quello che pensi di ogni giocatore senza pietà, ma con stile.',
  'Sei un poeta che scrive in prosa lirica: il campo è un palcoscenico, i giocatori sono figure quasi mitologiche, la palla è destino. Usa immagini visive forti e inaspettate.',
  'Sei un telecronista che ha visto troppo calcio e ormai è cinico, stanco, ma ogni tanto — suo malgrado — si entusiasma per qualcosa. L\'ironia è la tua difesa contro la mediocrità.',
];

export async function generateMatchCommentary(match, players) {
  const playerById = Object.fromEntries(
    players.filter(p => p.id).map(p => [p.id, p.name])
  );
  const resolve = ev => ev.scorerName || playerById[ev.scorerId] || '?';
  const resolveAssist = ev => ev.assistName || playerById[ev.assistId] || null;

  const resolvePlayer = ev => ev.playerName || playerById[ev.playerId] || '?';

  const goals     = (match.events || []).filter(e => e.type === 'goal');
  const autogoals = (match.events || []).filter(e => e.type === 'autogoal');
  const saves     = (match.events || []).filter(e => e.type === 'save');
  const injuries  = (match.events || []).filter(e => e.type === 'injury');
  const timeline  = [...goals, ...autogoals].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

  const extraStr = [...saves, ...injuries]
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999))
    .map(ev => {
      const min = ev.minute != null ? `${ev.minute}'` : '?';
      return ev.type === 'save'
        ? `${min}: gran parata di ${resolvePlayer(ev)}`
        : `${min}: infortunio di ${resolvePlayer(ev)}`;
    }).join('\n');

  const redNames  = (match.redTeam  || []).map(p => p.name).join(', ');
  const blueNames = (match.blueTeam || []).map(p => p.name).join(', ');

  const eventsStr = timeline.length === 0
    ? 'Nessun gol segnato (0-0 imbarazzante).'
    : timeline.map(ev => {
        const min   = ev.minute != null ? `${ev.minute}'` : '?';
        const team  = ev.team === 'red' ? 'Rossi' : 'Blu';
        if (ev.type === 'goal') {
          const assist = resolveAssist(ev);
          return assist && assist !== 'Nessuno'
            ? `${min} ${team}: gol di ${resolve(ev)}, assist di ${assist}`
            : `${min} ${team}: gol di ${resolve(ev)}`;
        }
        return `${min} ${team}: AUTOGOL di ${resolve(ev)}`;
      }).join('\n');

  const winner = match.redScore > match.blueScore ? 'Rossi'
    : match.blueScore > match.redScore ? 'Blu' : 'pareggio';

  const style = _COMMENTARY_STYLES[Math.floor(Math.random() * _COMMENTARY_STYLES.length)];

  // Highlight any player who scored 2+ or had an autogoal — give the AI a hook
  const scorerCounts = {};
  timeline.forEach(ev => {
    const name = resolve(ev);
    if (ev.type === 'goal') scorerCounts[name] = (scorerCounts[name] || 0) + 1;
  });
  const protagonists = Object.entries(scorerCounts)
    .filter(([, n]) => n >= 2)
    .map(([name, n]) => `${name} (${n} gol)`);
  const autogolisti = timeline.filter(e => e.type === 'autogoal').map(e => resolve(e));
  const hookLines = [
    ...(protagonists.length ? [`Protagonista/i offensivo/i: ${protagonists.join(', ')}`] : []),
    ...(autogolisti.length  ? [`Autogol: ${autogolisti.join(', ')}`] : []),
    timeline.length === 0   ? 'NESSUN GOL: usa questo come elemento narrativo centrale (imbarazzo, tatticismo o sfortuna pura).' : '',
  ].filter(Boolean).join('\n');

  const prompt = `${style}

Scrivi un commento post-partita in italiano di circa 200-250 parole su questa partita di calcetto tra amici. \
Nomina i giocatori protagonisti. Parti con un'apertura originale e inaspettata — non iniziare con "È stata una partita" o frasi simili. \
Evita questi cliché: "cuore", "gruppo", "squadra vera", "hanno dato tutto", "partita combattuta", "meritavano di più". \
Non usare markdown, asterischi, titoli o elenchi. Solo prosa fluente nello stile indicato sopra.

DATI PARTITA:
Data: ${fmtMatchDate(match.date)}
Risultato: Rossi ${match.redScore} – ${match.blueScore} Blu → ${winner}
Squadra Rossa: ${redNames}
Squadra Blu: ${blueNames}

CRONACA GOL:
${eventsStr}
${extraStr ? `\nALTRI EVENTI (parate decisive e infortuni — citali nel commento dove ha senso):\n${extraStr}` : ''}
${hookLines ? `\nSPUNTI NARRATIVI:\n${hookLines}` : ''}
Scrivi il commento ora:`;

  return callGemini(prompt, { temperature: 0.9, maxTokens: 900 });
}

// ─── Formazione squadre equilibrate con AI ────────────────────────────────────
// players: giocatori liberi da distribuire (i locked sono già separati dal chiamante)
// constraints (opzionale): { slotsRed, slotsBlue, lockedRedNames, lockedBlueNames }
// Ritorna { red: [...], blue: [...], reasoning: string }
export async function generateAIBalancedTeams(players, constraints = null) {
  const playerList = players.map(p => {
    const pi = (p.powerIndex || 50).toFixed(1);
    const role = p.primaryRole || 'N/A';
    const streakStr = p.streak?.count >= 2
      ? ` — streak ${p.streak.count} ${p.streak.type === 'win' ? 'vittorie' : 'sconfitte'} consecutive`
      : '';
    return `- ${p.name} (PI: ${pi}, Ruolo: ${role}${streakStr})`;
  }).join('\n');

  const lockNote = constraints
    ? `\nVINCOLO FORMAZIONE: dei ${players.length} giocatori liberi qui sopra, \
assegna ESATTAMENTE ${constraints.slotsRed} ai Rossi e ${constraints.slotsBlue} ai Blu. \
(Già bloccati — Rossi: ${constraints.lockedRedNames || 'nessuno'}; \
Blu: ${constraints.lockedBlueNames || 'nessuno'}. Non includerli nella risposta JSON.)`
    : `\nOgni squadra deve avere al massimo ${Math.ceil(players.length / 2)} giocatori.`;

  const prompt = `Sei il responsabile tecnico di un torneo di calcetto amatoriale. \
Devi formare due squadre il più equilibrate possibile tra i seguenti ${players.length} giocatori.

GIOCATORI DISPONIBILI:
${playerList}

CRITERI DI EQUILIBRIO (in ordine di priorità):
1. Power Index totale simile tra le due squadre
2. Almeno un portiere per squadra (se disponibili tra i giocatori)
3. Distribuzione equilibrata degli altri ruoli
4. Non concentrare tutte le streak positive nella stessa squadra
${lockNote}
Assegna ogni giocatore a una sola squadra, nessuno deve essere escluso.

Rispondi ESCLUSIVAMENTE con un JSON valido (niente testo prima o dopo):
{"red":["Nome1","Nome2"],"blue":["Nome3","Nome4"],"reasoning":"breve spiegazione in italiano di max 2 frasi"}`;

  const raw = await callGemini(prompt, { temperature: 0.25, maxTokens: 2000, tier: 'pro' });

  // Extract JSON from response (handles potential extra text)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Risposta AI non parseable');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('JSON AI non valido');
  }

  // Map names back to player objects (case-insensitive)
  const nameToPlayer = Object.fromEntries(players.map(p => [p.name.toLowerCase().trim(), p]));
  const red = (parsed.red || []).map(n => nameToPlayer[n.toLowerCase().trim()]).filter(Boolean);
  const blue = (parsed.blue || []).map(n => nameToPlayer[n.toLowerCase().trim()]).filter(Boolean);

  // Safety: assign any unassigned player to the smaller team
  const assigned = new Set([...red, ...blue].map(p => p.id));
  for (const p of players) {
    if (!assigned.has(p.id)) {
      if (red.length <= blue.length) red.push(p);
      else blue.push(p);
    }
  }

  return { red, blue, reasoning: parsed.reasoning || '' };
}

// ─── Previsione risultato pre-partita ─────────────────────────────────────────
const WEATHER_LABELS_IT = {
  sunny: 'Soleggiato ☀️', cloudy: 'Nuvoloso ☁️', rainy: 'Pioggia 🌧️',
  cold: 'Freddo 🥶', hot: 'Caldo 🔥', wind: 'Vento 💨',
};

export async function generateMatchPrediction(redTeam, blueTeam, weather) {
  const fmt = team => team.map(p => {
    const pi = (p.powerIndex || 50).toFixed(1);
    const role = p.primaryRole || 'N/A';
    const streakStr = p.streak?.count >= 2
      ? ` [streak ${p.streak.count} ${p.streak.type === 'win' ? 'V' : 'S'}]`
      : '';
    return `${p.name} (PI:${pi}, ${role}${streakStr})`;
  }).join(', ');
  const redPI = redTeam.reduce((s, p) => s + (p.powerIndex || 50), 0).toFixed(1);
  const bluePI = blueTeam.reduce((s, p) => s + (p.powerIndex || 50), 0).toFixed(1);

  const weatherLine = weather?.condition
    ? `\nMETEO: ${WEATHER_LABELS_IT[weather.condition] || weather.condition}${weather.temp ? ` (${weather.temp}°C)` : ''}`
    : '';

  const prompt = `Sei un pronosticatore calcistico saccente e spesso sbagliato. \
Analizza le due squadre di calcetto e fai un pronostico divertente e sarcastico in italiano, \
circa 3 paragrafi. Cita i nomi dei giocatori, fai battute, esagera difetti e pregi. \
Se le condizioni meteo sono particolari, commentale con ironia. \
Concludi con un risultato finale "pronosticato" (tipo "3-2 per i Rossi" o "0-0 imbarazzante"). \
Non usare markdown, solo prosa.

SQUADRA ROSSA (PI totale: ${redPI}):
${fmt(redTeam)}

SQUADRA BLU (PI totale: ${bluePI}):
${fmt(blueTeam)}${weatherLine}

Scrivi il pronostico ora:`;

  return callGemini(prompt, { temperature: 0.95, maxTokens: 900 });
}

// ─── Report mensile/stagionale AI ─────────────────────────────────────────────
export async function generatePeriodReport(periodLabel, topStats, weatherStats) {
  const { topScorer, topAssist, topWinRate, mostMatches, topAutogoal, worstGk, matchCount, totalGoals, bestStreak, worstStreak } = topStats;
  const line = (label, val) => val ? `\n- ${label}: ${val}` : '';

  const filteredWeather = Array.isArray(weatherStats)
    ? weatherStats.filter(w => w.matches >= 2)
    : [];
  const weatherLines = filteredWeather.length > 0
    ? '\n\nMETEO & RENDIMENTO:\n' + filteredWeather
        .map(w => `- ${w.label}: ${w.matches} partite, ${w.avgGoals} gol/partita${w.mvp ? `, MVP ${w.mvp.name} (${w.mvp.goals}G ${w.mvp.assists}A)` : ''}`)
        .join('\n')
    : '';

  const prompt = `Sei il cronista ufficiale di un torneo di calcetto amatoriale tra amici. \
Scrivi un report del periodo "${periodLabel}" in italiano, nello stile di un giornale sportivo: \
drammatico, ironico, con aneddoti sui giocatori più significativi. \
Circa 4 paragrafi. No markdown, solo prosa.

STATISTICHE DEL PERIODO:
- Partite disputate: ${matchCount}
- Gol totali: ${totalGoals}${line('Capocannoniere', topScorer ? `${topScorer.name} con ${topScorer.goals} gol` : null)}${line('Top Assistman', topAssist ? `${topAssist.name} con ${topAssist.assists} assist` : null)}${line('Miglior Win Rate', topWinRate ? `${topWinRate.name} (${topWinRate.pct}%, min 5 partite)` : null)}${line('Più presente', mostMatches ? `${mostMatches.name} con ${mostMatches.matches} partite` : null)}${line('Re degli Autogol', topAutogoal ? `${topAutogoal.name} con ${topAutogoal.autogoals} autogol` : null)}${line('Peggior Portiere', worstGk ? `${worstGk.name} con ${worstGk.goals} gol subiti` : null)}${line('Streak migliore', bestStreak ? `${bestStreak.name}: ${bestStreak.count} vittorie consecutive` : null)}${line('Streak peggiore', worstStreak ? `${worstStreak.name}: ${worstStreak.count} sconfitte consecutive` : null)}${weatherLines}

Scrivi il report ora:`;

  return callGemini(prompt, { temperature: 0.9, maxTokens: 3500, tier: 'pro' });
}

// ─── Hall of Fame / Hall of Shame AI ─────────────────────────────────────────
export async function generateHallOfFame(hallStats) {
  const { fame, shame } = hallStats;
  const fmtFame  = fame.map(p  => `${p.name} (${p.reason})`).join('; ');
  const fmtShame = shame.map(p => `${p.name} (${p.reason})`).join('; ');

  const prompt = `Sei il presidente di un circolo calcistico amatoriale che tiene il discorso \
annuale di premiazione (e di umiliazione pubblica). \
Scrivi la cerimonia in italiano: prima celebra i campioni nella "Hall of Fame", \
poi "consegna" i premi della vergogna nella "Hall of Shame". \
Sii cerimonioso, esagerato, ironico, comico. Circa 5 paragrafi. No markdown.

HALL OF FAME (i migliori di sempre):
${fmtFame || 'Nessuno abbastanza degno'}

HALL OF SHAME (i peggiori di sempre):
${fmtShame || 'Tutti si sono comportati decentemente (miracolo)'}

Scrivi la cerimonia ora:`;

  return callGemini(prompt, { temperature: 0.93, maxTokens: 4000, tier: 'pro' });
}

// ─── Rivalità tra giocatori AI ────────────────────────────────────────────────
export async function generateRivalryNarrative(p1name, p2name, rivalryStats) {
  const { together, against, p1Goals, p2Goals } = rivalryStats;

  const prompt = `Sei un telecronista appassionato che racconta la grande rivalità/amicizia \
tra due giocatori di calcetto amatoriale. \
Scrivi una narrazione drammatica in italiano: circa 3-4 paragrafi. \
Usa toni epici ma ironici, come se fosse una rivalità da Champions League tra amici del quartiere. \
No markdown, solo prosa.

PROTAGONISTI: ${p1name} vs ${p2name}

QUANDO HANNO GIOCATO INSIEME (${together.matches} partite):
- Vittorie: ${together.wins} | Pareggi: ${together.draws} | Sconfitte: ${together.losses}
- Assist reciproci: ${together.mutualAssists || 0}

QUANDO SI SONO AFFRONTATI (${against.matches} partite):
- Vittorie ${p1name}: ${against.p1wins}
- Vittorie ${p2name}: ${against.p2wins}
- Pareggi: ${against.draws}

GOL TOTALI NELLE PARTITE CONDIVISE:
- ${p1name}: ${p1Goals} gol
- ${p2name}: ${p2Goals} gol

Racconta la loro storia ora:`;

  return callGemini(prompt, { temperature: 0.93, maxTokens: 1000 });
}

// ─── Soprannome AI ────────────────────────────────────────────────────────────
export async function generatePlayerNickname(player, stats) {
  const { goals, assists, autogoals, matches, wins, losses, primaryRole, powerIndex, streak } = stats;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
  const streakStr = streak?.count >= 2
    ? `streak di ${streak.count} ${streak.type === 'win' ? 'vittorie' : 'sconfitte'}`
    : 'nessuna streak attiva';

  const prompt = `Sei un tifoso creativo che inventa soprannomi calcistici per i giocatori \
della squadra amatoriale. Inventa UN SOLO soprannome in italiano per il giocatore seguendo queste regole:
- Deve essere divertente, memorabile, eventualmente irriverente
- Può essere un gioco di parole col nome, col ruolo, o con le statistiche
- Massimo 4 parole
- Poi aggiungi UNA sola riga di motivazione (max 15 parole)

Rispondi ESATTAMENTE in questo formato (due righe, niente altro):
Soprannome: [il soprannome]
Motivazione: [breve spiegazione]

DATI GIOCATORE: ${player.name}
- Ruolo: ${primaryRole || 'N/A'}
- Power Index: ${(powerIndex || 50).toFixed(1)}/100
- Partite: ${matches} | Gol: ${goals} | Assist: ${assists} | Autogol: ${autogoals}
- Win Rate: ${winRate}% | Vittorie: ${wins} | Sconfitte: ${losses}
- Streak attuale: ${streakStr}`;

  return callGemini(prompt, { temperature: 0.97, maxTokens: 120 });
}

// ─── Voice goal parsing (fallback AI) ────────────────────────────────────────
// Chiamata solo quando il parser rule-based non riesce a identificare lo scorer.
// Riceve la trascrizione vocale italiana + i roster delle due squadre.
// Ritorna { isAutogoal, scorer, assist, gk, team } come parseVoiceGoal.
export async function parseVoiceGoalWithAI(transcript, redTeam, blueTeam) {
  const fmtTeam = (team) => team.map(p => `  - ${p.id}: ${p.name}`).join('\n');
  const prompt = `Sei un assistente che estrae info da una trascrizione vocale italiana di un gol in una partita di calcetto.

SQUADRE IN CAMPO:
Rossa:
${fmtTeam(redTeam)}
Blu:
${fmtTeam(blueTeam)}

TRASCRIZIONE: "${transcript}"

Identifica:
- isAutogoal: true se è un autogol (es. "autogol", "autorete", "se l'è fatto in casa")
- scorerId: ID del marcatore (esattamente uno degli ID elencati, oppure null se non identificabile)
- assistId: ID di chi ha fatto assist (o null)
- gkId: ID del portiere che ha subito il gol (o null)
- team: "red" o "blue" della squadra del marcatore (per gli autogol è la squadra di chi ha sbagliato, non l'avversaria)

Sii flessibile: gestisci frasi come "doppietta di Marco", "Luca ha appoggiato a Marco che ha segnato", "tiro di Marco, autorete del portiere".
Se ci sono più nomi, scegli quello più coerente con la frase.
Se non sei sicuro di un campo, ritorna null per quel campo (non inventare).

Rispondi ESCLUSIVAMENTE con JSON valido (niente testo prima o dopo):
{"isAutogoal":false,"scorerId":"...","assistId":null,"gkId":null,"team":"red"}`;

  const raw = await callGemini(prompt, { temperature: 0.15, maxTokens: 200, tier: 'fast' });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Risposta AI non valida');
  const parsed = JSON.parse(jsonMatch[0]);
  // Resolve IDs → player objects, scartando ID inventati da Gemini
  const playerById = Object.fromEntries(
    [...redTeam, ...blueTeam].map(p => [p.id, p]),
  );
  const scorer = parsed.scorerId ? (playerById[parsed.scorerId] || null) : null;
  const assist = parsed.assistId ? (playerById[parsed.assistId] || null) : null;
  const gk     = parsed.gkId     ? (playerById[parsed.gkId]     || null) : null;
  // Team: trust Gemini if scorer absent (raro), altrimenti deduci dallo scorer
  const team = scorer
    ? (redTeam.some(p => p.id === scorer.id) ? 'red' : 'blue')
    : (parsed.team === 'red' || parsed.team === 'blue' ? parsed.team : null);
  return { isAutogoal: !!parsed.isAutogoal, scorer, assist, gk, team };
}

// ─── Analisi trend giocatore ──────────────────────────────────────────────────
// recentData: array di max 4 oggetti { result: 'W'|'L'|'D', goals, assists, autogoals }
// weatherStats: array opzionale di { label, matches, wins, draws, losses, goals, assists }
//   filtrato a ≥2 partite per condizione (small-sample escluso).
export async function generatePlayerTrendAnalysis(player, recentData, weatherStats = []) {
  const matchLines = recentData.map((m, i) => {
    const res    = m.result === 'W' ? 'Vittoria' : m.result === 'L' ? 'Sconfitta' : 'Pareggio';
    const parts  = [];
    if (m.goals)     parts.push(`${m.goals} gol`);
    if (m.assists)   parts.push(`${m.assists} assist`);
    if (m.autogoals) parts.push(`${m.autogoals} autogol`);
    return `Partita ${i + 1}: ${res} — ${parts.length ? parts.join(', ') : 'nessun contributo offensivo'}`;
  }).join('\n');

  const streakStr = player.streak?.count >= 2
    ? `${player.streak.count} ${player.streak.type === 'win' ? 'vittorie' : 'sconfitte'} consecutive`
    : 'nessuna streak attiva';

  const significantWeather = (weatherStats || []).filter(w => w.matches >= 2);
  const weatherBlock = significantWeather.length > 0
    ? '\n\nRENDIMENTO PER METEO (≥2 partite):\n' + significantWeather.map(w => {
        const total = w.wins + w.draws + w.losses;
        const wr = total ? Math.round((w.wins / total) * 100) : 0;
        return `- ${w.label}: ${w.matches}p, ${wr}% vittoria, ${w.goals}G ${w.assists}A`;
      }).join('\n')
    : '';

  const prompt = `Sei un analista sportivo sarcastico, divertente e tagliente che commenta le prestazioni \
di un giocatore di calcetto amatoriale tra amici. \
Scrivi un'analisi del suo momento di forma in italiano: circa 3 paragrafi brevi. \
Sii diretto, ironico, a tratti brutale ma bonario — come farebbe un amico. \
Se ci sono dati meteo significativi e mostrano un pattern marcato (es. molto meglio col sole, \
disastro sotto la pioggia), commentalo con ironia; altrimenti ignorali. \
Non usare markdown, asterischi o titoli. Solo prosa.

DATI DI ${player.name.toUpperCase()}:
Power Index attuale: ${(player.powerIndex || 50).toFixed(1)} / 100
Streak: ${streakStr}

ULTIME ${recentData.length} PARTITE:
${matchLines}${weatherBlock}

Scrivi l'analisi ora:`;

  return callGemini(prompt, { temperature: 0.92, maxTokens: 1000 });
}
