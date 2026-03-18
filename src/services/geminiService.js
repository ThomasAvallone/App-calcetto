// ─── Gemini AI Service ────────────────────────────────────────────────────────
// Tutte le chiamate all'API Gemini passano da qui.
// La chiave viene letta dall'env e non è mai esposta nel codice sorgente.
// Protezione aggiuntiva: imposta la restrizione HTTP referrer su Google Cloud Console.

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL   = 'gemini-3.1-flash-lite-preview';
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function callGemini(prompt, { temperature = 0.85, maxTokens = 600 } = {}) {
  if (!API_KEY) throw new Error('Chiave Gemini non configurata (VITE_GEMINI_API_KEY)');

  const res = await fetch(`${BASE_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Errore API Gemini: ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

function fmtMatchDate(d) {
  if (!d) return '';
  const dt = d?.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Commento narrativo post-partita ─────────────────────────────────────────
export async function generateMatchCommentary(match, players) {
  const playerById = Object.fromEntries(
    players.filter(p => p.id).map(p => [p.id, p.name])
  );
  const resolve = ev => ev.scorerName || playerById[ev.scorerId] || '?';
  const resolveAssist = ev => ev.assistName || playerById[ev.assistId] || null;

  const goals     = (match.events || []).filter(e => e.type === 'goal');
  const autogoals = (match.events || []).filter(e => e.type === 'autogoal');
  const timeline  = [...goals, ...autogoals].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));

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

  const prompt = `Sei il commentatore ufficiale di una partita settimanale di calcetto tra amici. \
Tutti si conoscono, ci sono rivalità, ironie, drammi. \
Scrivi un commento post-partita in italiano di circa 200-250 parole, in stile giornalistico sportivo (alla Caressa/Bizzotto): \
narrativo, drammatico, con ironia e calore umano. Nomina i giocatori che si sono distinti. \
Non usare markdown, asterischi, titoli o elenchi. Solo prosa narrativa fluente.

DATI PARTITA:
Data: ${fmtMatchDate(match.date)}
Risultato finale: Rossi ${match.redScore} – ${match.blueScore} Blu → ${winner}
Squadra Rossa: ${redNames}
Squadra Blu: ${blueNames}

CRONACA GOL:
${eventsStr}

Scrivi il commento narrativo ora:`;

  return callGemini(prompt, { temperature: 0.9, maxTokens: 500 });
}

// ─── Formazione squadre equilibrate con AI ────────────────────────────────────
// players: array di oggetti player con id, name, powerIndex, primaryRole, streak
// Ritorna { red: [...], blue: [...], reasoning: string }
export async function generateAIBalancedTeams(players) {
  const playerList = players.map(p => {
    const pi = (p.powerIndex || 50).toFixed(1);
    const role = p.primaryRole || 'N/A';
    const streakStr = p.streak?.count >= 2
      ? ` — streak ${p.streak.count} ${p.streak.type === 'win' ? 'vittorie' : 'sconfitte'} consecutive`
      : '';
    return `- ${p.name} (PI: ${pi}, Ruolo: ${role}${streakStr})`;
  }).join('\n');

  const half = Math.ceil(players.length / 2);

  const prompt = `Sei il responsabile tecnico di un torneo di calcetto amatoriale. \
Devi formare due squadre il più equilibrate possibile tra i seguenti ${players.length} giocatori.

GIOCATORI DISPONIBILI:
${playerList}

CRITERI DI EQUILIBRIO (in ordine di priorità):
1. Power Index totale simile tra le due squadre
2. Almeno un portiere per squadra (se disponibili tra i giocatori)
3. Distribuzione equilibrata degli altri ruoli
4. Non concentrare tutte le streak positive nella stessa squadra

Ogni squadra deve avere al massimo ${half} giocatori. \
Assegna ogni giocatore a una sola squadra, nessuno deve essere escluso.

Rispondi ESCLUSIVAMENTE con un JSON valido (niente testo prima o dopo):
{"red":["Nome1","Nome2"],"blue":["Nome3","Nome4"],"reasoning":"breve spiegazione in italiano di max 2 frasi"}`;

  const raw = await callGemini(prompt, { temperature: 0.25, maxTokens: 400 });

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

// ─── Analisi trend giocatore ──────────────────────────────────────────────────
// recentData: array di max 4 oggetti { result: 'W'|'L'|'D', goals, assists, autogoals }
export async function generatePlayerTrendAnalysis(player, recentData) {
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

  const prompt = `Sei un analista sportivo sarcastico, divertente e tagliente che commenta le prestazioni \
di un giocatore di calcetto amatoriale tra amici. \
Scrivi un'analisi del suo momento di forma in italiano: circa 3 paragrafi brevi. \
Sii diretto, ironico, a tratti brutale ma bonario — come farebbe un amico. \
Non usare markdown, asterischi o titoli. Solo prosa.

DATI DI ${player.name.toUpperCase()}:
Power Index attuale: ${(player.powerIndex || 50).toFixed(1)} / 100
Streak: ${streakStr}

ULTIME ${recentData.length} PARTITE:
${matchLines}

Scrivi l'analisi ora:`;

  return callGemini(prompt, { temperature: 0.92, maxTokens: 400 });
}
