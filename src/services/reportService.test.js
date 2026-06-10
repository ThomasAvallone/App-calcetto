import { describe, it, expect } from 'vitest';
import { generateMatchReport, generateMatchPreview, computeMatchMVP } from './reportService';

const players = [
  { id: 'p1', name: 'Marco' },
  { id: 'p2', name: 'Luca' },
  { id: 'p3', name: 'Gianni' },
  { id: 'p4', name: 'Dani' },
];

const goal = (over) => ({ type: 'goal', ...over });
const autogoal = (over) => ({ type: 'autogoal', ...over });

describe('generateMatchReport — esito', () => {
  it('determina il vincitore corretto', () => {
    expect(generateMatchReport({ redScore: 3, blueScore: 1, events: [] }, players)).toContain('VITTORIA ROSSI');
    expect(generateMatchReport({ redScore: 1, blueScore: 3, events: [] }, players)).toContain('VITTORIA BLU');
    expect(generateMatchReport({ redScore: 2, blueScore: 2, events: [] }, players)).toContain('PAREGGIO');
  });

  it('partita 0-0 senza eventi: nessun MVP, nessun gol', () => {
    const r = generateMatchReport({ redScore: 0, blueScore: 0, events: [] }, players);
    expect(r).toContain('Nessun meritevole trovato');
    expect(r).toContain('Nessun gol');
  });
});

describe('generateMatchReport — MVP (guardia punteggio positivo)', () => {
  it('NON nomina MVP se decisa da un solo autogol (punteggio negativo)', () => {
    const match = {
      redScore: 1, blueScore: 0,
      events: [autogoal({ team: 'blue', scorerId: 'p2', scorerName: 'Luca' })],
    };
    const r = generateMatchReport(match, players);
    // Luca ha -2 pt: non deve essere MVP
    expect(r).toContain('Nessun meritevole trovato');
    expect(r).not.toMatch(/⭐ Luca/);
    expect(r).not.toContain('-2 pt');
  });

  it('nomina MVP con un gol regolare (+3 pt)', () => {
    const match = {
      redScore: 1, blueScore: 0,
      events: [goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' })],
    };
    const r = generateMatchReport(match, players);
    expect(r).toContain('⭐ Marco (3 pt)');
  });

  it('chi segna e fa autogol resta MVP solo se il saldo è positivo', () => {
    // Marco: 1 gol (+3) e 2 autogol (-4) = -1 → niente MVP
    const negMatch = {
      redScore: 1, blueScore: 2,
      events: [
        goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
        autogoal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
        autogoal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
      ],
    };
    expect(generateMatchReport(negMatch, players)).toContain('Nessun meritevole trovato');
  });
});

describe('generateMatchReport — premi di latta e cronaca', () => {
  it('hat trick e capocannoniere secondo soglia', () => {
    const hat = {
      redScore: 3, blueScore: 0,
      events: [
        goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
        goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
        goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
      ],
    };
    expect(generateMatchReport(hat, players)).toContain('🎩 Hat Trick');

    const cap = {
      redScore: 2, blueScore: 0,
      events: [
        goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
        goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
      ],
    };
    expect(generateMatchReport(cap, players)).toContain('⚽ Capocannoniere');
  });

  it('cronaca con parziale progressivo corretto (autogol conta per gli avversari)', () => {
    const match = {
      redScore: 1, blueScore: 1,
      events: [
        goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco', minute: 5 }),
        autogoal({ team: 'red', scorerId: 'p2', scorerName: 'Luca', minute: 10 }),
      ],
    };
    const r = generateMatchReport(match, players);
    // primo evento: gol rosso → [1-0]
    expect(r).toContain('[1–0]');
    // secondo evento: autogol rosso → punto al blu → [1-1]
    expect(r).toContain('[1–1]');
    expect(r).toContain('🤦 AUTOGOL Luca');
  });

  it('risolve i nomi da scorerId quando manca scorerName (partite storiche)', () => {
    const match = {
      redScore: 1, blueScore: 0,
      events: [goal({ team: 'red', scorerId: 'p3', minute: 12 })], // niente scorerName
    };
    const r = generateMatchReport(match, players);
    expect(r).toContain('Gianni');
  });
});

describe('generateMatchReport — formattazione WhatsApp-friendly', () => {
  const match = {
    redScore: 2, blueScore: 1,
    redTeam: [{ id: 'p1', name: 'Marco' }],
    blueTeam: [{ id: 'p2', name: 'Luca' }],
    events: [
      goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco', minute: 5 }),
      goal({ team: 'blue', scorerId: 'p2', scorerName: 'Luca', minute: 20 }),
      goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco', minute: 40 }),
    ],
  };

  it('niente righe-separatore lunghe (impaginano male su WhatsApp)', () => {
    expect(generateMatchReport(match, players)).not.toContain('━');
  });

  it('header in stile preview: titolo bold + sezioni bold', () => {
    const r = generateMatchReport(match, players);
    expect(r).toContain('*VERDETTO FINALE*');
    expect(r).toContain('*Cronaca gol*');
    expect(r).toContain('*MVP Tecnico*');
    expect(r).toContain('*Premi di Latta*');
    expect(r).toContain(`🔴 Rossi *2 – 1* Blu 🔵`);
  });

  it('blocchi separati da UNA sola riga vuota (mai doppie)', () => {
    expect(generateMatchReport(match, players)).not.toMatch(/\n\n\n/);
  });

  it('formazioni su riga compatta, omesse se mancanti', () => {
    const r = generateMatchReport(match, players);
    expect(r).toContain('🔴 *Rossi:* Marco');
    expect(r).toContain('🔵 *Blu:* Luca');
    // Senza team: nessuna riga formazione orfana
    const bare = generateMatchReport({ redScore: 0, blueScore: 0, events: [] }, players);
    expect(bare).not.toContain('*Rossi:*');
  });
});

describe('computeMatchMVP — source of truth unica (card + verdetto)', () => {
  it('lista vuota / null → null', () => {
    expect(computeMatchMVP([])).toBeNull();
    expect(computeMatchMVP(null)).toBeNull();
  });

  it('un gol → MVP con 3 pt e 1 gol', () => {
    const mvp = computeMatchMVP([goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' })]);
    expect(mvp).toMatchObject({ id: 'p1', name: 'Marco', points: 3, goals: 1, assists: 0 });
  });

  it('pesa gol(+3), assist(+2), autogol(-2)', () => {
    // Marco: 1 gol (+3); Luca: 1 assist (+2)
    const events = [goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco', assistId: 'p2', assistName: 'Luca' })];
    const mvp = computeMatchMVP(events);
    expect(mvp).toMatchObject({ id: 'p1', points: 3, goals: 1 });
    // Luca ha 2 pt < Marco 3 pt
  });

  it('assist-man può essere MVP se totalizza più punti', () => {
    // Luca: 3 assist = +6 ; Marco: 1 gol = +3
    const events = [
      goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco', assistId: 'p2', assistName: 'Luca' }),
      goal({ team: 'red', scorerId: 'p3', scorerName: 'Gianni', assistId: 'p2', assistName: 'Luca' }),
      goal({ team: 'red', scorerId: 'p4', scorerName: 'Dani', assistId: 'p2', assistName: 'Luca' }),
    ];
    const mvp = computeMatchMVP(events);
    expect(mvp).toMatchObject({ id: 'p2', name: 'Luca', points: 6, goals: 0, assists: 3 });
  });

  it('saldo non positivo → null (solo autogol)', () => {
    expect(computeMatchMVP([autogoal({ team: 'blue', scorerId: 'p2', scorerName: 'Luca' })])).toBeNull();
  });

  it('ignora assistName "Nessuno" come nome', () => {
    const mvp = computeMatchMVP([goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco', assistId: 'p1', assistName: 'Nessuno' })]);
    expect(mvp.name).toBe('Marco');
  });

  it('coerente col verdetto testuale (stesso MVP nel report)', () => {
    const events = [
      goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
      goal({ team: 'red', scorerId: 'p1', scorerName: 'Marco' }),
    ];
    const mvp = computeMatchMVP(events);
    const r = generateMatchReport({ redScore: 2, blueScore: 0, events }, players);
    expect(r).toContain(`⭐ ${mvp.name} (${mvp.points} pt)`);
  });
});

describe('generateMatchPreview', () => {
  const team = (ids) => ids.map(id => players.find(p => p.id === id));

  it('non lancia con team vuoti e mostra equilibrio', () => {
    const out = generateMatchPreview({ redTeam: [], blueTeam: [], weather: null, date: null });
    expect(out).toContain('MATCH PREVIEW');
    expect(out).toContain('Equilibrio perfetto');
  });

  it('indica la squadra favorita per scarto PI > 5', () => {
    const red = [{ id: 'a', name: 'A', powerIndex: 80 }];
    const blue = [{ id: 'b', name: 'B', powerIndex: 50 }];
    expect(generateMatchPreview({ redTeam: red, blueTeam: blue, weather: { condition: 'sunny' }, date: Date.now() }))
      .toContain('🔴 Rossi favoriti');
  });

  it('lista gli obiettivi imminenti (gol vicino a milestone)', () => {
    const red = [{ id: 'p1', name: 'Marco', powerIndex: 60, stats: { goals: 8, assists: 0, matches: 20 } }];
    const out = generateMatchPreview({ redTeam: red, blueTeam: team(['p2']), weather: null, date: Date.now() });
    // 8 gol → prossima milestone 10, a 2 gol (<=3) → obiettivo mostrato
    expect(out).toContain('Marco a 2 gol dai 10 totali');
  });
});
