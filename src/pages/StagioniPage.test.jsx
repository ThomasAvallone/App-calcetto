// @vitest-environment jsdom
//
// Test di RENDER della pagina Annali. Il resto della suite gira in ambiente
// node (nessun DOM): qui l'ambiente jsdom è scelto per-file col docblock qui
// sopra, così i test dei moduli puri restano com'erano.
//
// Perché servono: i calcoli sono già coperti da seasonRecap.test.js, ma i bug
// trovati nell'ultima revisione erano tutti di PAGINA — badge e note in
// contraddizione, flag "In Corso" scritto a mano, ordinamento che sopravvive al
// cambio stagione. Nessuno di quelli è visibile a un test di modulo puro.
//
// Firebase non è importabile nei test (legge la config a load-time): si
// sostituiscono i due hook che portano i dati nella pagina.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const matchesRef = { current: [] };
const playersRef = { current: [] };

vi.mock('../hooks/useMatchesSubscription', () => ({
  useMatchesSubscription: () => matchesRef.current,
}));
vi.mock('../store/playersStore', () => ({
  default: () => ({ players: playersRef.current }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const exportSeasonCSV = vi.fn();
vi.mock('../utils/dataExport', () => ({ exportSeasonCSV: (...a) => exportSeasonCSV(...a) }));

const StagioniPage = (await import('./StagioniPage')).default;

const P = [
  { id: 'p1', name: 'Marco' },
  { id: 'p2', name: 'Luca' },
];
const at = (y, m, d) => new Date(y, m, d, 21).getTime();
const match = (date, over = {}) => ({
  status: 'finished', date,
  redTeam: [P[0]], blueTeam: [P[1]],
  redScore: 2, blueScore: 1, events: [], ...over,
});

function setup({ matches = [], players = P, now = at(2026, 3, 1) } = {}) {
  matchesRef.current = matches;
  playersRef.current = players;
  vi.setSystemTime(now);
  return render(<StagioniPage />);
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); exportSeasonCSV.mockClear(); });

describe('StagioniPage — chiusura di stagione', () => {
  // stagione 2026/27: non ha una controparte statica, quindi la pagina mostra
  // davvero il calcolo live (per la 2025/26 vincerebbe la entry dichiarata,
  // molto più ricca di questi fixture minimi)
  const matches = [match(at(2026, 9, 7)), match(at(2027, 1, 3))];

  it('durante la stagione mostra "In Corso"', () => {
    setup({ matches, now: at(2027, 7, 26) }); // 26 agosto 2027
    expect(screen.getByText('In Corso')).toBeTruthy();
    expect(screen.queryByText('Conclusa')).toBeNull();
    expect(screen.getByText(/settembre – in corso/)).toBeTruthy();
  });

  it('dal 1° settembre la stagione risulta conclusa, senza note contraddittorie', () => {
    setup({ matches, now: at(2027, 8, 1) });
    expect(screen.getByText('Conclusa')).toBeTruthy();
    expect(screen.queryByText('In Corso')).toBeNull();
    expect(screen.queryByText(/settembre – in corso/)).toBeNull();
    expect(screen.getByText(/settembre – agosto/)).toBeTruthy();
  });

  it('nessuna stagione statica resta "In Corso" a tempo indeterminato', () => {
    // nessuna partita app: restano solo le entry statiche, fra cui la 2025/26
    // che ha inCorso scritto a mano nel file dei dati
    setup({ matches: [], now: at(2027, 5, 1) });
    expect(screen.queryByText('In Corso')).toBeNull();
    expect(screen.getByText('Conclusa')).toBeTruthy();
  });
});

describe('StagioniPage — classifica', () => {
  it('passando a una stagione senza assist l ordinamento non resta su una colonna assente', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // stagione live 2026/27 (con assist) + le statiche più vecchie (senza)
    setup({ matches: [match(at(2026, 9, 10))], now: at(2027, 2, 1) });

    await user.click(screen.getByRole('button', { name: 'Assist' }));
    // la colonna A esiste e l'ordinamento è su di essa
    expect(screen.getByRole('columnheader', { name: 'A' })).toBeTruthy();

    // passa alla 2018/19, che negli annali non ha assist
    await user.click(screen.getByRole('button', { name: /18\/19/ }));
    expect(screen.queryByRole('columnheader', { name: 'A' })).toBeNull();
    // il chip Assist non deve restare quello attivo: l'ordinamento ripiega su Gol
    const golChip = screen.getByRole('button', { name: 'Gol' });
    expect(golChip.style.color).toBe('rgb(79, 209, 197)');
  });

  it('i gol ignoti si distinguono dallo zero', () => {
    // un nome storico non collegato: presenze note, gol no
    setup({
      matches: [
        match(at(2026, 9, 10)),                                     // partita app: apre la stagione live
        match(at(2026, 9, 17), { isHistorical: true, redTeam: [P[0], { name: 'PISCO' }] }),
      ],
      now: at(2027, 2, 1),
    });
    const riga = screen.getByText('PISCO').closest('tr');
    expect(within(riga).getAllByText('-').length).toBeGreaterThan(0);
  });
});

describe('StagioniPage — export', () => {
  it('il bottone CSV esporta la stagione mostrata', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup({ matches: [match(at(2026, 9, 10))], now: at(2027, 2, 1) });
    await user.click(screen.getByRole('button', { name: /Scarica riepilogo CSV/ }));
    expect(exportSeasonCSV).toHaveBeenCalledTimes(1);
    expect(exportSeasonCSV.mock.calls[0][0]).toMatchObject({ id: '2026-27' });
  });
});
