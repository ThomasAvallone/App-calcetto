// ─── Dati storici calcetto — parsed da SIRO_stats.xlsx ─────────────────────
// Ogni stagione contiene: riassunto, record, e statistiche individuali.
// Il campo `assist` è null per la stagione 2018/19 (non tracciati).

export const HISTORICAL_SEASONS = [
  // ─── 2018/19 ──────────────────────────────────────────────────────────────
  {
    id: '2018-19',
    label: '2018/2019',
    months: 'aprile – agosto',
    totalMatches: 20,
    totalGoals: 259,
    totalAutoGoals: 5,
    totalPlayers: 21,
    notes: null,
    records: {
      mostPresent: { name: 'Boro / Matte', value: 19 },
      topScorer: { name: 'Boro / Sleva', value: 32 },
      assistman: null,
      topWinner: { name: 'Fede M.', value: 10 },
      mostLosses: { name: 'Luciano', value: 9 },
      bestMatchGoals: { name: 'Boro', value: 7, detail: '26/07/2019' },
      bestMonthGoals: { name: 'Boro / Fede M. / Matte / Sleva', value: 10 },
      bestMonth: { name: 'Agosto', value: 65 },
      biggestMatch: { score: '12-12', totalGoals: 24, detail: '26/07/2019' },
      smallestMatch: { score: '6-2', totalGoals: 8, detail: '17 e 24 maggio 2019' },
      bestWinStreak: { name: 'Sleva', value: 5 },
      bestLossStreak: { name: 'Luciano / Boro / Thomas / Lippa', value: 3 },
      mostAutoGoals: { name: 'Matte', value: 2 },
    },
    players: [
      { name: 'MASSI',    presenze: 17, gol: 26, autogol: 0, assist: null, vinte: 7,  nulle: 4, perse: 6 },
      { name: 'FEDE M.',  presenze: 16, gol: 17, autogol: 0, assist: null, vinte: 10, nulle: 4, perse: 2 },
      { name: 'LUCIANO',  presenze: 17, gol: 13, autogol: 1, assist: null, vinte: 3,  nulle: 5, perse: 9 },
      { name: 'BORO',     presenze: 19, gol: 32, autogol: 1, assist: null, vinte: 6,  nulle: 5, perse: 8 },
      { name: 'THOMAS',   presenze: 18, gol: 12, autogol: 0, assist: null, vinte: 6,  nulle: 5, perse: 7 },
      { name: 'MATTE',    presenze: 19, gol: 31, autogol: 2, assist: null, vinte: 7,  nulle: 5, perse: 7 },
      { name: 'PEDRO',    presenze: 11, gol: 8,  autogol: 0, assist: null, vinte: 3,  nulle: 3, perse: 5 },
      { name: 'NELLO',    presenze: 11, gol: 17, autogol: 1, assist: null, vinte: 3,  nulle: 3, perse: 5 },
      { name: 'MARCELLO', presenze: 8,  gol: 5,  autogol: 0, assist: null, vinte: 4,  nulle: 3, perse: 1 },
      { name: 'SLEVA',    presenze: 16, gol: 32, autogol: 0, assist: null, vinte: 8,  nulle: 4, perse: 4 },
      { name: 'BIK',      presenze: 9,  gol: 12, autogol: 0, assist: null, vinte: 4,  nulle: 1, perse: 4 },
      { name: 'LIPPA',    presenze: 14, gol: 18, autogol: 0, assist: null, vinte: 5,  nulle: 4, perse: 5 },
      { name: 'FABIO E.', presenze: 3,  gol: 2,  autogol: 0, assist: null, vinte: 1,  nulle: 0, perse: 2 },
      { name: 'RAFFA',    presenze: 1,  gol: 2,  autogol: 0, assist: null, vinte: 1,  nulle: 0, perse: 0 },
      { name: 'FEDE C.',  presenze: 2,  gol: 2,  autogol: 0, assist: null, vinte: 1,  nulle: 0, perse: 1 },
      { name: 'RICHI',    presenze: 6,  gol: 13, autogol: 0, assist: null, vinte: 3,  nulle: 1, perse: 2 },
      { name: 'GABBO',    presenze: 4,  gol: 6,  autogol: 0, assist: null, vinte: 1,  nulle: 3, perse: 0 },
      { name: 'BIONDO',   presenze: 1,  gol: 1,  autogol: 0, assist: null, vinte: 0,  nulle: 0, perse: 1 },
      { name: 'PISCO',    presenze: 1,  gol: 3,  autogol: 0, assist: null, vinte: 1,  nulle: 0, perse: 0 },
      { name: 'STEFANO',  presenze: 1,  gol: 1,  autogol: 0, assist: null, vinte: 1,  nulle: 0, perse: 0 },
      { name: 'JACK',     presenze: 1,  gol: 1,  autogol: 0, assist: null, vinte: 0,  nulle: 0, perse: 1 },
    ],
  },

  // ─── 2019/20 ──────────────────────────────────────────────────────────────
  {
    id: '2019-20',
    label: '2019/2020',
    months: 'settembre – agosto',
    totalMatches: 32,
    totalGoals: 424,
    totalAutoGoals: 13,
    totalPlayers: 24,
    notes: 'Sospeso dal 10 marzo al 18 luglio per Covid-19',
    records: {
      mostPresent: { name: 'Massi', value: 32 },
      topScorer: { name: 'Massi', value: 70 },
      assistman: { name: 'Massi', value: 53 },
      topWinner: { name: 'Massi', value: 23 },
      mostLosses: { name: 'Biondo', value: 13 },
      bestMatchGoals: { name: 'Sleva', value: 8, detail: '3/1/2020' },
      bestMonthGoals: { name: 'Sleva', value: 16, detail: 'gennaio 2020' },
      bestMonth: { name: 'Novembre', value: 70 },
      biggestMatch: { score: '8-13', totalGoals: 21, detail: '6/9/19 e 28/2/20' },
      smallestMatch: { score: '2-4', totalGoals: 6, detail: '24/7/20' },
      bestWinStreak: { name: 'Massi', value: 8 },
      bestLossStreak: { name: 'Biondo', value: 6 },
      mostAutoGoals: { name: 'Pedro', value: 3 },
    },
    players: [
      { name: 'MASSI',       presenze: 32, gol: 70, autogol: 0, assist: 53, vinte: 23, nulle: 3,  perse: 6 },
      { name: 'FEDE M.',     presenze: 30, gol: 42, autogol: 1, assist: 39, vinte: 20, nulle: 2,  perse: 8 },
      { name: 'LUCIANO',     presenze: 25, gol: 9,  autogol: 2, assist: 11, vinte: 10, nulle: 3,  perse: 12 },
      { name: 'BORO',        presenze: 25, gol: 47, autogol: 0, assist: 18, vinte: 12, nulle: 3,  perse: 10 },
      { name: 'THOMAS',      presenze: 27, gol: 21, autogol: 0, assist: 25, vinte: 17, nulle: 2,  perse: 8 },
      { name: 'MATTE',       presenze: 25, gol: 37, autogol: 1, assist: 20, vinte: 10, nulle: 3,  perse: 12 },
      { name: 'PEDRO',       presenze: 21, gol: 10, autogol: 3, assist: 7,  vinte: 8,  nulle: 2,  perse: 11 },
      { name: 'SLEVA',       presenze: 19, gol: 38, autogol: 1, assist: 30, vinte: 8,  nulle: 2,  perse: 9 },
      { name: 'NELLO',       presenze: 12, gol: 14, autogol: 0, assist: 8,  vinte: 5,  nulle: 0,  perse: 7 },
      { name: 'MARCELLO',    presenze: 14, gol: 6,  autogol: 0, assist: 5,  vinte: 6,  nulle: 1,  perse: 7 },
      { name: 'LIPPA',       presenze: 19, gol: 19, autogol: 0, assist: 8,  vinte: 5,  nulle: 2,  perse: 12 },
      { name: 'RICHI',       presenze: 8,  gol: 7,  autogol: 0, assist: 6,  vinte: 1,  nulle: 1,  perse: 6 },
      { name: 'BIK',         presenze: 16, gol: 25, autogol: 2, assist: 6,  vinte: 6,  nulle: 2,  perse: 8 },
      { name: 'BIONDO',      presenze: 18, gol: 31, autogol: 1, assist: 5,  vinte: 3,  nulle: 2,  perse: 13 },
      { name: 'RAFFA',       presenze: 7,  gol: 7,  autogol: 0, assist: 3,  vinte: 2,  nulle: 0,  perse: 5 },
      { name: 'FABIO E.',    presenze: 9,  gol: 12, autogol: 2, assist: 9,  vinte: 3,  nulle: 1,  perse: 5 },
      { name: 'JUAN',        presenze: 1,  gol: 1,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'PISCO',       presenze: 3,  gol: 5,  autogol: 0, assist: 6,  vinte: 2,  nulle: 1,  perse: 0 },
      { name: 'JACK',        presenze: 3,  gol: 7,  autogol: 0, assist: 0,  vinte: 2,  nulle: 0,  perse: 1 },
      { name: 'ZACCO',       presenze: 1,  gol: 1,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'SANTO',       presenze: 2,  gol: 2,  autogol: 0, assist: 2,  vinte: 1,  nulle: 0,  perse: 1 },
      { name: 'MASSIMILIANO',presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'STEFANO A.',  presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'STEFANO F.',  presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 0,  nulle: 0,  perse: 1 },
    ],
  },

  // ─── 2020/21 ──────────────────────────────────────────────────────────────
  {
    id: '2020-21',
    label: '2020/2021',
    months: 'set–ott 2020 + apr–ago 2021',
    totalMatches: 24,
    totalGoals: 236,
    totalAutoGoals: 5,
    totalPlayers: 32,
    notes: 'Stagione spezzata: pausa da novembre 2020 ad aprile 2021',
    records: {
      mostPresent: { name: 'Fede M.', value: 22 },
      topScorer: { name: 'Nello', value: 24 },
      assistman: { name: 'Fede M.', value: 22 },
      topWinner: { name: 'Matte', value: 11 },
      mostLosses: { name: 'Thomas', value: 13 },
      bestMatchGoals: { name: 'Pisco', value: 5, detail: '3/6/2021' },
      bestMonthGoals: { name: 'Biondo', value: 10, detail: 'giugno 2021' },
      bestMonth: { name: 'Giugno', value: 59 },
      biggestMatch: { score: '8-8 / 9-7', totalGoals: 16, detail: '3/6/21 e 10/8/21' },
      smallestMatch: { score: '3-2', totalGoals: 5, detail: '6/5/21' },
      bestWinStreak: { name: 'Fede M. / Bik', value: 4 },
      bestLossStreak: { name: 'Jack / Thomas', value: 4 },
      mostAutoGoals: { name: 'Fede M. / Matte / Thomas / Luciano / Fede T.', value: 1 },
    },
    players: [
      { name: 'MASSI',       presenze: 14, gol: 21, autogol: 0, assist: 14, vinte: 7,  nulle: 4, perse: 3 },
      { name: 'FEDE M.',     presenze: 22, gol: 20, autogol: 1, assist: 22, vinte: 10, nulle: 5, perse: 7 },
      { name: 'LUCIANO',     presenze: 20, gol: 8,  autogol: 1, assist: 4,  vinte: 9,  nulle: 4, perse: 7 },
      { name: 'BORO',        presenze: 10, gol: 7,  autogol: 0, assist: 3,  vinte: 3,  nulle: 3, perse: 4 },
      { name: 'THOMAS',      presenze: 21, gol: 7,  autogol: 1, assist: 11, vinte: 3,  nulle: 5, perse: 13 },
      { name: 'MATTE',       presenze: 19, gol: 11, autogol: 1, assist: 17, vinte: 11, nulle: 4, perse: 4 },
      { name: 'SLEVA',       presenze: 12, gol: 13, autogol: 0, assist: 14, vinte: 5,  nulle: 3, perse: 4 },
      { name: 'NELLO',       presenze: 15, gol: 24, autogol: 0, assist: 5,  vinte: 6,  nulle: 4, perse: 5 },
      { name: 'MARCELLO',    presenze: 5,  gol: 2,  autogol: 0, assist: 0,  vinte: 2,  nulle: 1, perse: 2 },
      { name: 'LIPPA',       presenze: 9,  gol: 4,  autogol: 0, assist: 4,  vinte: 3,  nulle: 3, perse: 3 },
      { name: 'BIK',         presenze: 17, gol: 18, autogol: 0, assist: 7,  vinte: 7,  nulle: 3, perse: 7 },
      { name: 'BIONDO',      presenze: 14, gol: 23, autogol: 0, assist: 4,  vinte: 5,  nulle: 4, perse: 5 },
      { name: 'FABIO E.',    presenze: 6,  gol: 5,  autogol: 0, assist: 1,  vinte: 3,  nulle: 1, perse: 2 },
      { name: 'RAFFA',       presenze: 8,  gol: 4,  autogol: 0, assist: 10, vinte: 5,  nulle: 0, perse: 3 },
      { name: 'JUAN',        presenze: 3,  gol: 3,  autogol: 0, assist: 3,  vinte: 1,  nulle: 0, perse: 2 },
      { name: 'GABBO',       presenze: 7,  gol: 10, autogol: 0, assist: 5,  vinte: 4,  nulle: 1, perse: 2 },
      { name: 'PISCO',       presenze: 3,  gol: 11, autogol: 0, assist: 3,  vinte: 1,  nulle: 1, perse: 1 },
      { name: 'JACK',        presenze: 6,  gol: 12, autogol: 0, assist: 1,  vinte: 0,  nulle: 2, perse: 4 },
      { name: 'SALMI',       presenze: 4,  gol: 3,  autogol: 0, assist: 4,  vinte: 2,  nulle: 0, perse: 2 },
      { name: 'PAVOLETTI',   presenze: 4,  gol: 2,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0, perse: 4 },
      { name: 'SANTO',       presenze: 3,  gol: 3,  autogol: 0, assist: 3,  vinte: 2,  nulle: 0, perse: 1 },
      { name: 'FEDE T.',     presenze: 4,  gol: 4,  autogol: 1, assist: 3,  vinte: 2,  nulle: 1, perse: 1 },
      { name: 'COLO',        presenze: 1,  gol: 1,  autogol: 0, assist: 2,  vinte: 1,  nulle: 0, perse: 0 },
      { name: 'KERRO',       presenze: 2,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0, perse: 2 },
      { name: 'VASON',       presenze: 2,  gol: 1,  autogol: 0, assist: 2,  vinte: 0,  nulle: 1, perse: 1 },
      { name: 'SPIGA',       presenze: 2,  gol: 8,  autogol: 0, assist: 2,  vinte: 2,  nulle: 0, perse: 0 },
      { name: 'ROMANO',      presenze: 1,  gol: 2,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0, perse: 0 },
      { name: 'GRZEGORZ',    presenze: 1,  gol: 3,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0, perse: 1 },
      { name: 'GAETANO',     presenze: 1,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0, perse: 1 },
      { name: 'CLAUDIO',     presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 0,  nulle: 0, perse: 1 },
      { name: 'ROBERT',      presenze: 1,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0, perse: 1 },
      { name: 'STEFANO F.',  presenze: 2,  gol: 1,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0, perse: 2 },
    ],
  },

  // ─── 2021/22 ──────────────────────────────────────────────────────────────
  {
    id: '2021-22',
    label: '2021/2022',
    months: 'settembre – agosto',
    totalMatches: 50,
    totalGoals: 571,
    totalAutoGoals: 16,
    totalPlayers: 33,
    notes: 'Dal 16/11 campo La Raquette; dal 3/5 Benassi',
    records: {
      mostPresent: { name: 'Thomas', value: 48 },
      topScorer: { name: 'Massi', value: 56 },
      assistman: { name: 'Thomas', value: 58 },
      topWinner: { name: 'Thomas', value: 24 },
      mostLosses: { name: 'Luciano', value: 23 },
      bestMatchGoals: { name: 'Lippa / Sleva / Spiga', value: 6 },
      bestMonthGoals: { name: 'Sleva', value: 17, detail: 'marzo 2022' },
      bestMonth: { name: 'Marzo', value: 71 },
      biggestMatch: { score: '11-11', totalGoals: 22, detail: '29/11/2021' },
      smallestMatch: { score: 'varie', totalGoals: 6, detail: 'in 5 occasioni' },
      bestWinStreak: { name: 'Fede M. / Thomas / Luciano', value: 5 },
      bestLossStreak: { name: 'Dani', value: 8 },
      mostAutoGoals: { name: 'Massi / Luciano / Thomas / Marcello / Santi', value: 2 },
    },
    players: [
      { name: 'MASSI',       presenze: 40, gol: 56, autogol: 2, assist: 45, vinte: 20, nulle: 7,  perse: 13 },
      { name: 'FEDE M.',     presenze: 44, gol: 30, autogol: 1, assist: 37, vinte: 23, nulle: 8,  perse: 13 },
      { name: 'LUCIANO',     presenze: 45, gol: 22, autogol: 2, assist: 14, vinte: 15, nulle: 7,  perse: 23 },
      { name: 'THOMAS',      presenze: 48, gol: 38, autogol: 2, assist: 58, vinte: 24, nulle: 9,  perse: 15 },
      { name: 'MATTE',       presenze: 32, gol: 39, autogol: 0, assist: 22, vinte: 15, nulle: 6,  perse: 11 },
      { name: 'BORO',        presenze: 22, gol: 24, autogol: 0, assist: 20, vinte: 4,  nulle: 3,  perse: 15 },
      { name: 'BIK',         presenze: 28, gol: 24, autogol: 1, assist: 19, vinte: 15, nulle: 6,  perse: 7 },
      { name: 'SALMI',       presenze: 37, gol: 40, autogol: 1, assist: 16, vinte: 9,  nulle: 7,  perse: 21 },
      { name: 'SANTI',       presenze: 34, gol: 52, autogol: 2, assist: 15, vinte: 10, nulle: 5,  perse: 19 },
      { name: 'LIPPA',       presenze: 29, gol: 48, autogol: 0, assist: 23, vinte: 12, nulle: 5,  perse: 12 },
      { name: 'MARCELLO',    presenze: 11, gol: 10, autogol: 2, assist: 2,  vinte: 5,  nulle: 2,  perse: 4 },
      { name: 'VASON',       presenze: 13, gol: 11, autogol: 0, assist: 7,  vinte: 5,  nulle: 2,  perse: 6 },
      { name: 'RAFFA',       presenze: 6,  gol: 5,  autogol: 0, assist: 1,  vinte: 2,  nulle: 0,  perse: 4 },
      { name: 'SPIGA',       presenze: 7,  gol: 28, autogol: 0, assist: 12, vinte: 3,  nulle: 2,  perse: 2 },
      { name: 'NELLO',       presenze: 16, gol: 15, autogol: 1, assist: 9,  vinte: 7,  nulle: 1,  perse: 8 },
      { name: 'SLEVA',       presenze: 17, gol: 34, autogol: 0, assist: 22, vinte: 9,  nulle: 4,  perse: 4 },
      { name: 'BIONDO',      presenze: 12, gol: 9,  autogol: 0, assist: 2,  vinte: 4,  nulle: 3,  perse: 5 },
      { name: 'GABBO',       presenze: 9,  gol: 12, autogol: 0, assist: 5,  vinte: 2,  nulle: 2,  perse: 5 },
      { name: 'FEDE T.',     presenze: 10, gol: 4,  autogol: 0, assist: 8,  vinte: 2,  nulle: 1,  perse: 7 },
      { name: 'SAMUELE',     presenze: 7,  gol: 16, autogol: 0, assist: 9,  vinte: 5,  nulle: 1,  perse: 1 },
      { name: 'MANUEL',      presenze: 6,  gol: 8,  autogol: 1, assist: 6,  vinte: 2,  nulle: 2,  perse: 2 },
      { name: 'PAVOLETTI',   presenze: 5,  gol: 5,  autogol: 0, assist: 0,  vinte: 3,  nulle: 1,  perse: 1 },
      { name: 'GIABBA',      presenze: 4,  gol: 6,  autogol: 0, assist: 3,  vinte: 3,  nulle: 0,  perse: 1 },
      { name: 'PISCO',       presenze: 3,  gol: 6,  autogol: 0, assist: 1,  vinte: 1,  nulle: 2,  perse: 0 },
      { name: 'CRESH',       presenze: 3,  gol: 6,  autogol: 0, assist: 2,  vinte: 1,  nulle: 1,  perse: 1 },
      { name: 'GMG',         presenze: 2,  gol: 2,  autogol: 0, assist: 1,  vinte: 2,  nulle: 0,  perse: 0 },
      { name: 'BONOMO',      presenze: 1,  gol: 1,  autogol: 0, assist: 0,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'EDOARDO',     presenze: 1,  gol: 2,  autogol: 0, assist: 1,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'VALERIO',     presenze: 1,  gol: 1,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'CESCO',       presenze: 2,  gol: 0,  autogol: 0, assist: 1,  vinte: 0,  nulle: 1,  perse: 1 },
      { name: 'FABIO (BIK)', presenze: 1,  gol: 1,  autogol: 0, assist: 0,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'VITO',        presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'ROMANO',      presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 0,  nulle: 0,  perse: 1 },
    ],
  },

  // ─── 2022/23 ──────────────────────────────────────────────────────────────
  {
    id: '2022-23',
    label: '2022/2023',
    months: 'settembre – agosto',
    totalMatches: 52,
    totalGoals: 487,
    totalAutoGoals: 16,
    totalPlayers: 29,
    notes: null,
    records: {
      mostPresent: { name: 'Thomas', value: 46 },
      topScorer: { name: 'Dani', value: 80 },
      assistman: { name: 'Thomas', value: 55 },
      topWinner: { name: 'Dani', value: 23 },
      mostLosses: { name: 'Luciano', value: 20 },
      bestMatchGoals: { name: 'Massi / Dani / Lippa', value: 5 },
      bestMonthGoals: { name: 'Dani', value: 17, detail: 'marzo 2023' },
      bestMonth: { name: 'Marzo', value: 54 },
      biggestMatch: { score: '10-8', totalGoals: 18, detail: '18/7/2023' },
      smallestMatch: { score: '1-1', totalGoals: 2, detail: '13/12/2022' },
      bestWinStreak: { name: 'Dani', value: 6, detail: '23 maggio – 27 giugno' },
      bestLossStreak: { name: 'Valerio', value: 4, detail: '9–30 maggio' },
      mostAutoGoals: { name: 'Massi / Luciano / Nello', value: 3 },
    },
    players: [
      { name: 'MASSI',       presenze: 35, gol: 42, autogol: 3, assist: 33, vinte: 17, nulle: 9,  perse: 9 },
      { name: 'FEDE M.',     presenze: 44, gol: 22, autogol: 0, assist: 35, vinte: 17, nulle: 10, perse: 17 },
      { name: 'LUCIANO',     presenze: 41, gol: 14, autogol: 3, assist: 6,  vinte: 12, nulle: 9,  perse: 20 },
      { name: 'THOMAS',      presenze: 46, gol: 45, autogol: 1, assist: 55, vinte: 21, nulle: 11, perse: 14 },
      { name: 'MATTE',       presenze: 30, gol: 17, autogol: 0, assist: 11, vinte: 8,  nulle: 7,  perse: 15 },
      { name: 'CRISTIAN',    presenze: 37, gol: 22, autogol: 0, assist: 26, vinte: 9,  nulle: 11, perse: 17 },
      { name: 'BIK',         presenze: 36, gol: 31, autogol: 1, assist: 23, vinte: 20, nulle: 5,  perse: 11 },
      { name: 'SALMI',       presenze: 34, gol: 27, autogol: 0, assist: 25, vinte: 10, nulle: 7,  perse: 17 },
      { name: 'DANI',        presenze: 43, gol: 80, autogol: 2, assist: 27, vinte: 23, nulle: 7,  perse: 13 },
      { name: 'LIPPA',       presenze: 31, gol: 45, autogol: 0, assist: 15, vinte: 10, nulle: 10, perse: 11 },
      { name: 'MARCELLO',    presenze: 16, gol: 5,  autogol: 0, assist: 3,  vinte: 7,  nulle: 4,  perse: 5 },
      { name: 'VALERIO',     presenze: 31, gol: 22, autogol: 1, assist: 27, vinte: 13, nulle: 3,  perse: 15 },
      { name: 'NELLO',       presenze: 26, gol: 29, autogol: 3, assist: 6,  vinte: 13, nulle: 5,  perse: 8 },
      { name: 'RAFFA',       presenze: 15, gol: 11, autogol: 0, assist: 4,  vinte: 5,  nulle: 3,  perse: 7 },
      { name: 'FEDE T.',     presenze: 11, gol: 7,  autogol: 0, assist: 3,  vinte: 3,  nulle: 3,  perse: 5 },
      { name: 'VASON',       presenze: 7,  gol: 4,  autogol: 0, assist: 2,  vinte: 4,  nulle: 2,  perse: 1 },
      { name: 'GABBO',       presenze: 7,  gol: 8,  autogol: 1, assist: 6,  vinte: 2,  nulle: 0,  perse: 5 },
      { name: 'BIONDO',      presenze: 7,  gol: 9,  autogol: 0, assist: 0,  vinte: 2,  nulle: 1,  perse: 4 },
      { name: 'EDOARDO',     presenze: 6,  gol: 9,  autogol: 0, assist: 4,  vinte: 3,  nulle: 1,  perse: 2 },
      { name: 'GMG',         presenze: 4,  gol: 5,  autogol: 0, assist: 2,  vinte: 3,  nulle: 0,  perse: 1 },
      { name: 'PISCO',       presenze: 3,  gol: 5,  autogol: 1, assist: 4,  vinte: 2,  nulle: 0,  perse: 1 },
      { name: 'PAVOLETTI',   presenze: 3,  gol: 5,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 2 },
      { name: 'SAMUELE',     presenze: 1,  gol: 3,  autogol: 0, assist: 2,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'JUAN',        presenze: 1,  gol: 2,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'COLO',        presenze: 1,  gol: 2,  autogol: 0, assist: 0,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'ETERE',       presenze: 1,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'ALEX',        presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'LORENZO',     presenze: 1,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'FABIO (BIK)', presenze: 2,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 2 },
    ],
  },

  // ─── 2023/24 ──────────────────────────────────────────────────────────────
  {
    id: '2023-24',
    label: '2023/2024',
    months: 'settembre – agosto',
    totalMatches: 50,
    totalGoals: 508,
    totalAutoGoals: 15,
    totalPlayers: 30,
    notes: 'Dal luglio, giocata al Circolo Panda',
    records: {
      mostPresent: { name: 'Thomas', value: 45 },
      topScorer: { name: 'Dani', value: 81 },
      assistman: { name: 'Fede M.', value: 50 },
      topWinner: { name: 'Fede M. / Thomas', value: 25 },
      mostLosses: { name: 'Salmi', value: 26 },
      bestMatchGoals: { name: 'Bik', value: 6, detail: '25 giugno 2024' },
      bestMonthGoals: { name: 'Lippa', value: 12, detail: 'luglio 2024' },
      bestMonth: { name: 'Luglio', value: 53 },
      biggestMatch: { score: '10-6', totalGoals: 16, detail: '27/2/2024' },
      smallestMatch: { score: '2-1', totalGoals: 3, detail: '11/6/2024' },
      bestWinStreak: { name: 'Bik', value: 6, detail: '10 gen – 13 feb' },
      bestLossStreak: { name: 'Dani', value: 6, detail: '17 ott – 21 nov' },
      mostAutoGoals: { name: 'Fede M. / Luciano / Thomas / Salmi', value: 2 },
    },
    players: [
      { name: 'MASSI',       presenze: 33, gol: 35, autogol: 0, assist: 21, vinte: 13, nulle: 5,  perse: 15 },
      { name: 'FEDE M.',     presenze: 44, gol: 24, autogol: 2, assist: 50, vinte: 25, nulle: 7,  perse: 12 },
      { name: 'LUCIANO',     presenze: 43, gol: 19, autogol: 2, assist: 15, vinte: 14, nulle: 5,  perse: 24 },
      { name: 'THOMAS',      presenze: 45, gol: 29, autogol: 2, assist: 36, vinte: 25, nulle: 6,  perse: 14 },
      { name: 'VALERIO',     presenze: 43, gol: 36, autogol: 0, assist: 25, vinte: 13, nulle: 6,  perse: 24 },
      { name: 'MATTE',       presenze: 40, gol: 34, autogol: 2, assist: 30, vinte: 14, nulle: 5,  perse: 21 },
      { name: 'BIK',         presenze: 35, gol: 32, autogol: 1, assist: 26, vinte: 20, nulle: 6,  perse: 9 },
      { name: 'DANI',        presenze: 44, gol: 81, autogol: 1, assist: 35, vinte: 20, nulle: 7,  perse: 17 },
      { name: 'SALMI',       presenze: 44, gol: 44, autogol: 2, assist: 22, vinte: 12, nulle: 6,  perse: 26 },
      { name: 'LIPPA',       presenze: 35, gol: 52, autogol: 1, assist: 22, vinte: 16, nulle: 5,  perse: 14 },
      { name: 'CRISTIAN',    presenze: 15, gol: 17, autogol: 0, assist: 13, vinte: 7,  nulle: 2,  perse: 6 },
      { name: 'NELLO',       presenze: 13, gol: 13, autogol: 1, assist: 5,  vinte: 8,  nulle: 1,  perse: 4 },
      { name: 'RAFFA',       presenze: 19, gol: 21, autogol: 0, assist: 7,  vinte: 9,  nulle: 3,  perse: 7 },
      { name: 'FEDE T.',     presenze: 13, gol: 14, autogol: 0, assist: 16, vinte: 6,  nulle: 1,  perse: 6 },
      { name: 'VASON',       presenze: 5,  gol: 1,  autogol: 1, assist: 3,  vinte: 2,  nulle: 0,  perse: 3 },
      { name: 'PAVOLETTI',   presenze: 9,  gol: 14, autogol: 0, assist: 3,  vinte: 3,  nulle: 2,  perse: 4 },
      { name: 'SAMUELE',     presenze: 1,  gol: 1,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'MARCELLO',    presenze: 1,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'PISCO',       presenze: 3,  gol: 3,  autogol: 0, assist: 3,  vinte: 2,  nulle: 1,  perse: 0 },
      { name: 'LUIGI',       presenze: 1,  gol: 3,  autogol: 0, assist: 1,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'ETERE',       presenze: 1,  gol: 2,  autogol: 0, assist: 1,  vinte: 0,  nulle: 1,  perse: 0 },
      { name: 'JACK',        presenze: 1,  gol: 2,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'BIONDO',      presenze: 4,  gol: 7,  autogol: 0, assist: 2,  vinte: 2,  nulle: 0,  perse: 2 },
      { name: 'MASSIMILIANO',presenze: 1,  gol: 1,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'ALESSANDRO',  presenze: 1,  gol: 0,  autogol: 0, assist: 2,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'FABIO (BIK)', presenze: 1,  gol: 2,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'TRONCA',      presenze: 1,  gol: 2,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'SLEVA',       presenze: 2,  gol: 4,  autogol: 0, assist: 3,  vinte: 1,  nulle: 0,  perse: 1 },
      { name: 'FRANCESCO',   presenze: 1,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
      { name: 'FRENK',       presenze: 1,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 1 },
    ],
  },

  // ─── 2024/25 ──────────────────────────────────────────────────────────────
  {
    id: '2024-25',
    label: '2024/2025',
    months: 'settembre – agosto',
    totalMatches: 48,
    totalGoals: 474,
    totalAutoGoals: 15,
    totalPlayers: 26,
    notes: '3 partite non giocate: 10 dic, 1 lug, 12 ago',
    records: {
      mostPresent: { name: 'Fede M. / Luciano', value: 45 },
      topScorer: { name: 'Dani', value: 70 },
      assistman: { name: 'Massi', value: 46 },
      topWinner: { name: 'Luciano', value: 26 },
      mostLosses: { name: 'Fede M. / Thomas', value: 21 },
      bestMatchGoals: { name: 'Pavoletti', value: 6, detail: '17 settembre 2024' },
      bestMonthGoals: { name: 'Dani / Salmi', value: 11, detail: 'ottobre e aprile' },
      bestMonth: { name: 'Ottobre', value: 51 },
      biggestMatch: { score: '10-8', totalGoals: 18, detail: '17/9/2024' },
      smallestMatch: { score: '2-2 / 1-3', totalGoals: 4, detail: '14/1 e 17/6' },
      bestWinStreak: { name: 'Luciano', value: 10, detail: '1 ott – 3 dic' },
      bestLossStreak: { name: 'Fede M.', value: 8, detail: '1 ott – 19 nov' },
      mostAutoGoals: { name: 'Fede M.', value: 4 },
    },
    players: [
      { name: 'MASSI',       presenze: 43, gol: 53, autogol: 2, assist: 46, vinte: 21, nulle: 5,  perse: 17 },
      { name: 'FEDE M.',     presenze: 45, gol: 36, autogol: 4, assist: 42, vinte: 18, nulle: 6,  perse: 21 },
      { name: 'LUCIANO',     presenze: 45, gol: 21, autogol: 0, assist: 13, vinte: 26, nulle: 5,  perse: 14 },
      { name: 'THOMAS',      presenze: 44, gol: 27, autogol: 2, assist: 38, vinte: 17, nulle: 6,  perse: 21 },
      { name: 'VALERIO',     presenze: 20, gol: 16, autogol: 3, assist: 11, vinte: 12, nulle: 2,  perse: 6 },
      { name: 'MATTE',       presenze: 30, gol: 36, autogol: 0, assist: 20, vinte: 13, nulle: 2,  perse: 15 },
      { name: 'BIK',         presenze: 27, gol: 21, autogol: 0, assist: 18, vinte: 12, nulle: 4,  perse: 11 },
      { name: 'DANI',        presenze: 38, gol: 70, autogol: 1, assist: 25, vinte: 22, nulle: 4,  perse: 12 },
      { name: 'SALMI',       presenze: 41, gol: 48, autogol: 1, assist: 27, vinte: 16, nulle: 5,  perse: 20 },
      { name: 'LIPPA',       presenze: 36, gol: 39, autogol: 0, assist: 23, vinte: 13, nulle: 6,  perse: 17 },
      { name: 'CRISTIAN',    presenze: 24, gol: 18, autogol: 1, assist: 15, vinte: 7,  nulle: 5,  perse: 12 },
      { name: 'PAVOLETTI',   presenze: 16, gol: 17, autogol: 0, assist: 4,  vinte: 6,  nulle: 2,  perse: 8 },
      { name: 'SLEVA',       presenze: 18, gol: 18, autogol: 0, assist: 16, vinte: 6,  nulle: 1,  perse: 11 },
      { name: 'FEDE T.',     presenze: 11, gol: 9,  autogol: 1, assist: 7,  vinte: 5,  nulle: 2,  perse: 4 },
      { name: 'FABIO GL.',   presenze: 10, gol: 9,  autogol: 0, assist: 4,  vinte: 2,  nulle: 2,  perse: 6 },
      { name: 'MARCELLO',    presenze: 5,  gol: 1,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 5 },
      { name: 'RAFFA',       presenze: 5,  gol: 5,  autogol: 0, assist: 2,  vinte: 3,  nulle: 1,  perse: 1 },
      { name: 'NELLO',       presenze: 4,  gol: 3,  autogol: 0, assist: 1,  vinte: 2,  nulle: 0,  perse: 2 },
      { name: 'CLAUDIO',     presenze: 4,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 1,  perse: 3 },
      { name: 'PISCO',       presenze: 3,  gol: 4,  autogol: 0, assist: 7,  vinte: 3,  nulle: 0,  perse: 0 },
      { name: 'ETERE',       presenze: 3,  gol: 3,  autogol: 0, assist: 3,  vinte: 1,  nulle: 0,  perse: 2 },
      { name: 'GABBO',       presenze: 2,  gol: 2,  autogol: 0, assist: 0,  vinte: 1,  nulle: 0,  perse: 1 },
      { name: 'JACK',        presenze: 1,  gol: 1,  autogol: 0, assist: 2,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'NAPO',        presenze: 1,  gol: 1,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'BIONDO',      presenze: 1,  gol: 0,  autogol: 0, assist: 1,  vinte: 0,  nulle: 1,  perse: 0 },
      { name: 'SAMUELE',     presenze: 1,  gol: 1,  autogol: 0, assist: 4,  vinte: 1,  nulle: 0,  perse: 0 },
    ],
  },

  // ─── 2025/26 (in corso) ───────────────────────────────────────────────────
  {
    id: '2025-26',
    label: '2025/2026',
    months: 'settembre – in corso',
    totalMatches: 25,
    totalGoals: 262,
    totalAutoGoals: 8,
    totalPlayers: 23,
    notes: 'Stagione in corso (dati aggiornati a febbraio 2026)',
    inCorso: true,
    records: {
      mostPresent: { name: 'Massi / Fede M.', value: 24 },
      topScorer: { name: 'Dani', value: 30 },
      assistman: { name: 'Massi', value: 29 },
      topWinner: { name: 'Massi / Fede M.', value: 13 },
      mostLosses: { name: 'Salmi', value: 16 },
      bestMonthGoals: { name: 'Cristian', value: 10, detail: 'gennaio 2026' },
      bestMonth: { name: 'Gennaio', value: 53 },
    },
    players: [
      { name: 'MASSI',       presenze: 24, gol: 23, autogol: 0, assist: 29, vinte: 13, nulle: 4,  perse: 7 },
      { name: 'FEDE M.',     presenze: 24, gol: 12, autogol: 0, assist: 14, vinte: 13, nulle: 4,  perse: 7 },
      { name: 'LUCIANO',     presenze: 20, gol: 8,  autogol: 0, assist: 6,  vinte: 4,  nulle: 3,  perse: 13 },
      { name: 'THOMAS',      presenze: 19, gol: 17, autogol: 0, assist: 16, vinte: 10, nulle: 2,  perse: 7 },
      { name: 'MATTE',       presenze: 20, gol: 22, autogol: 0, assist: 23, vinte: 11, nulle: 4,  perse: 5 },
      { name: 'BIK',         presenze: 15, gol: 5,  autogol: 0, assist: 15, vinte: 8,  nulle: 3,  perse: 4 },
      { name: 'DANI',        presenze: 16, gol: 30, autogol: 0, assist: 7,  vinte: 4,  nulle: 2,  perse: 10 },
      { name: 'SALMI',       presenze: 22, gol: 25, autogol: 0, assist: 12, vinte: 3,  nulle: 3,  perse: 16 },
      { name: 'LIPPA',       presenze: 18, gol: 22, autogol: 0, assist: 11, vinte: 7,  nulle: 1,  perse: 10 },
      { name: 'SLEVA',       presenze: 15, gol: 20, autogol: 0, assist: 9,  vinte: 10, nulle: 1,  perse: 4 },
      { name: 'CRISTIAN',    presenze: 13, gol: 24, autogol: 0, assist: 10, vinte: 7,  nulle: 2,  perse: 4 },
      { name: 'FEDE T.',     presenze: 2,  gol: 1,  autogol: 0, assist: 3,  vinte: 0,  nulle: 1,  perse: 1 },
      { name: 'FABIO GL.',   presenze: 4,  gol: 1,  autogol: 0, assist: 1,  vinte: 2,  nulle: 1,  perse: 1 },
      { name: 'PAVOLETTI',   presenze: 2,  gol: 0,  autogol: 0, assist: 0,  vinte: 0,  nulle: 0,  perse: 2 },
      { name: 'SAMUELE',     presenze: 2,  gol: 3,  autogol: 0, assist: 1,  vinte: 1,  nulle: 0,  perse: 1 },
      { name: 'FABIO E.',    presenze: 14, gol: 21, autogol: 0, assist: 8,  vinte: 5,  nulle: 4,  perse: 5 },
      { name: 'VALERIO',     presenze: 12, gol: 10, autogol: 0, assist: 9,  vinte: 3,  nulle: 2,  perse: 7 },
      { name: 'NELLO',       presenze: 1,  gol: 2,  autogol: 0, assist: 0,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'CLAUDIO H.',  presenze: 1,  gol: 1,  autogol: 0, assist: 1,  vinte: 0,  nulle: 1,  perse: 0 },
      { name: 'GIUSEPPE',    presenze: 1,  gol: 2,  autogol: 0, assist: 0,  vinte: 0,  nulle: 1,  perse: 0 },
      { name: 'PEPPE',       presenze: 1,  gol: 2,  autogol: 0, assist: 0,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'DAVIDE',      presenze: 1,  gol: 0,  autogol: 0, assist: 2,  vinte: 1,  nulle: 0,  perse: 0 },
      { name: 'VITO',        presenze: 1,  gol: 3,  autogol: 0, assist: 0,  vinte: 0,  nulle: 1,  perse: 0 },
    ],
  },
];

// ─── Utility: tutti i nomi storici unici ────────────────────────────────────
export function getAllHistoricalNames() {
  const names = new Set();
  for (const season of HISTORICAL_SEASONS) {
    for (const p of season.players) {
      names.add(p.name);
    }
  }
  return [...names].sort();
}

// ─── Utility: calcola stats cumulative per un set di nomi storici ───────────
export function computeCumulativeStats(historicalNames) {
  const stats = { goals: 0, assists: 0, autogoals: 0, wins: 0, losses: 0, draws: 0, matches: 0 };
  const upperNames = historicalNames.map(n => n.toUpperCase());

  for (const season of HISTORICAL_SEASONS) {
    for (const p of season.players) {
      if (upperNames.includes(p.name.toUpperCase())) {
        stats.goals += p.gol || 0;
        stats.assists += p.assist || 0;
        stats.autogoals += p.autogol || 0;
        stats.wins += p.vinte || 0;
        stats.losses += p.perse || 0;
        stats.draws += p.nulle || 0;
        stats.matches += p.presenze || 0;
      }
    }
  }
  return stats;
}

// ─── Utility: suggerisci nomi storici per un dato nome giocatore ────────────
export function suggestHistoricalNames(playerName, linkedNames = []) {
  const needle = (playerName || '').toUpperCase().replace(/[.\s]/g, '');
  // Needle vuoto → `startsWith('')`/`includes('')` matcherebbero ogni nome a 80%,
  // restituendo tutti i nomi storici come falsi suggerimenti. Meglio nessun match.
  if (!needle) return [];
  const allNames = getAllHistoricalNames();
  const alreadyLinked = new Set(linkedNames.map(n => n.toUpperCase()));
  const available = allNames.filter(n => !alreadyLinked.has(n.toUpperCase()));

  return available
    .map(name => {
      const normalized = name.toUpperCase().replace(/[.\s]/g, '');
      let score = 0;
      if (normalized === needle) score = 100;
      else if (normalized.startsWith(needle) || needle.startsWith(normalized)) score = 80;
      else if (normalized.includes(needle) || needle.includes(normalized)) score = 60;
      else {
        // Check first 3 chars
        const n3 = needle.slice(0, 3);
        const h3 = normalized.slice(0, 3);
        if (n3 === h3) score = 40;
      }
      return { name, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ─── Utility: rosa corrente (ultimi 3 stagioni, min 5 presenze totali) ───────
export function getCurrentRosterPlayers() {
  const recentIds = new Set(['2023-24', '2024-25', '2025-26']);
  const map = new Map(); // key uppercase → { displayName, historicalNames, totalPresenze }

  const toTitleCase = str =>
    str.split(/\s+/).map(word => {
      if (word.endsWith('.')) return word.charAt(0).toUpperCase() + word.slice(1, -1).toLowerCase() + '.';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');

  for (const season of HISTORICAL_SEASONS) {
    if (!recentIds.has(season.id)) continue;
    for (const p of season.players) {
      const key = p.name.toUpperCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          displayName: toTitleCase(p.name),
          historicalNames: [p.name],
          totalPresenze: p.presenze || 0,
        });
      } else {
        map.get(key).totalPresenze += p.presenze || 0;
      }
    }
  }

  return [...map.values()]
    .filter(p => p.totalPresenze >= 5)
    .sort((a, b) => b.totalPresenze - a.totalPresenze);
}

// ─── Utility: nomi storici non ancora linkati a nessun giocatore ────────────
export function getUnlinkedNames(players) {
  const linked = new Set();
  for (const p of players) {
    for (const n of (p.historicalNames || [])) {
      linked.add(n.toUpperCase());
    }
  }
  return getAllHistoricalNames().filter(n => !linked.has(n.toUpperCase()));
}
