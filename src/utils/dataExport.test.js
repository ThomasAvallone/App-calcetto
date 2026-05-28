import { describe, it, expect } from 'vitest';
import { escapeCsv, buildMatchesCSV, buildPlayersCSV } from './dataExport';

describe('escapeCsv', () => {
  it('passa valori semplici senza quote', () => {
    expect(escapeCsv('Marco')).toBe('Marco');
    expect(escapeCsv(42)).toBe('42');
  });

  it('null/undefined → stringa vuota', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });

  it('quota e raddoppia le virgolette', () => {
    expect(escapeCsv('Anto "il Capitano"')).toBe('"Anto ""il Capitano"""');
  });

  it('quota se contiene virgola, punto e virgola, newline o CR', () => {
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('a;b')).toBe('"a;b"');
    expect(escapeCsv('a\nb')).toBe('"a\nb"');
    expect(escapeCsv('a\rb')).toBe('"a\rb"'); // \r incluso (RFC 4180)
  });

  it('neutralizza la CSV formula injection con apice iniziale', () => {
    expect(escapeCsv('=1+1')).toBe("'=1+1");
    expect(escapeCsv('+SUM(A1)')).toBe("'+SUM(A1)");
    expect(escapeCsv('-2+3')).toBe("'-2+3");
    expect(escapeCsv('@cmd')).toBe("'@cmd");
  });

  it('formula + separatore → prima apice, poi quote', () => {
    expect(escapeCsv('=HYPERLINK(1,2)')).toBe('"\'=HYPERLINK(1,2)"');
  });

  it('non tocca valori numerici legittimi non negativi', () => {
    expect(escapeCsv('75.3')).toBe('75.3');
    expect(escapeCsv('2024-01-15')).toBe('2024-01-15'); // la data inizia con cifra, non con -
  });
});

describe('buildMatchesCSV', () => {
  const match = (over) => ({
    status: 'finished', date: '2024-03-10T20:00:00.000Z',
    redTeam: [{ name: 'A' }], blueTeam: [{ name: 'B' }],
    redScore: 0, blueScore: 0, isHistorical: false, ...over,
  });

  it('include solo partite finished', () => {
    const csv = buildMatchesCSV([
      match({ redScore: 3, blueScore: 1 }),
      match({ status: 'active', redScore: 9, blueScore: 9 }),
      match({ status: 'scheduled' }),
    ]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // header + 1 finished
    expect(csv).not.toContain('9,9');
  });

  it('header corretto e risultato calcolato', () => {
    const csv = buildMatchesCSV([match({ redScore: 2, blueScore: 5 })]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('Data,Squadra Rossa,Squadra Blu,Gol Rossi,Gol Blu,Risultato,Storica');
    expect(row).toContain('2024-03-10');
    expect(row).toContain('Blu'); // 2-5 → vince Blu
  });

  it('pareggio etichettato correttamente', () => {
    const csv = buildMatchesCSV([match({ redScore: 3, blueScore: 3 })]);
    expect(csv.split('\n')[1]).toContain('Pareggio');
  });

  it('ordina per data crescente', () => {
    const csv = buildMatchesCSV([
      match({ date: '2024-05-01T00:00:00Z', redScore: 1 }),
      match({ date: '2024-01-01T00:00:00Z', redScore: 2 }),
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('2024-01-01');
    expect(lines[2]).toContain('2024-05-01');
  });

  it('i nomi squadra con ; vengono quotati (join "; ")', () => {
    const csv = buildMatchesCSV([match({ redTeam: [{ name: 'A' }, { name: 'B' }] })]);
    expect(csv).toContain('"A; B"');
  });

  it('data mancante/invalida → cella vuota, nessun crash', () => {
    expect(() => buildMatchesCSV([match({ date: null })])).not.toThrow();
    expect(() => buildMatchesCSV([match({ date: 'non-una-data' })])).not.toThrow();
  });

  it('lista vuota / null → solo header', () => {
    expect(buildMatchesCSV([]).split('\n')).toHaveLength(1);
    expect(buildMatchesCSV(null).split('\n')).toHaveLength(1);
  });
});

describe('buildPlayersCSV', () => {
  const player = (over) => ({ name: 'X', powerIndex: 50, stats: {}, ...over });

  it('ordina per Power Index decrescente', () => {
    const csv = buildPlayersCSV([
      player({ name: 'Basso', powerIndex: 40 }),
      player({ name: 'Alto', powerIndex: 90 }),
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('Alto');
    expect(lines[2]).toContain('Basso');
  });

  it('header con 12 colonne e riga con 12 valori', () => {
    const csv = buildPlayersCSV([player({ name: 'Y', stats: { matches: 5, wins: 3, draws: 1, losses: 1 } })]);
    const [header, row] = csv.split('\n');
    expect(header.split(',')).toHaveLength(12);
    expect(row.split(',')).toHaveLength(12);
  });

  it('default robusti: powerIndex 50.0 e stats a 0', () => {
    const csv = buildPlayersCSV([{ name: 'Nuovo' }]);
    const row = csv.split('\n')[1];
    expect(row).toContain('Nuovo');
    expect(row).toContain('50.0');
  });

  it('neutralizza un nome malevolo che inizia con =', () => {
    const csv = buildPlayersCSV([player({ name: '=2+5+cmd' })]);
    expect(csv.split('\n')[1]).toContain("'=2+5+cmd");
  });

  it('lista vuota / null → solo header', () => {
    expect(buildPlayersCSV([]).split('\n')).toHaveLength(1);
    expect(buildPlayersCSV(null).split('\n')).toHaveLength(1);
  });
});
