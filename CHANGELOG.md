# Changelog

## [Unreleased]

### Robustezza

- **Timeout sulle chiamate AI (Gemini)** — `callGemini` ora impone una deadline per ogni tentativo di richiesta tramite `AbortController` (default 45s; 15s per il riconoscimento vocale dei gol, che ha già il parser rule-based offline come via primaria). Su rete mobile instabile — scenario tipico di una partita all'aperto — una connessione "stallata" non lascia più la fetch appesa indefinitamente bloccando i pulsanti gol durante l'elaborazione vocale. Inoltre gli errori di rete non-HTTP, prima fatali al primo colpo, vengono ora ritentati sui modelli/tentativi successivi.

### Miglioramenti

- **Commento AI post-partita più originale** — Il prompt viene ora scelto casualmente tra 10 stili narrativi diversi (cronista radiofonico anni '70, giornalista investigativo, telecronista straniero, romanziere, filosofo greco, critico cinematografico, cantastorie meridionale, stile Biagi, poetico/lirico, cinico disilluso), in modo che ogni partita produca un commento con un carattere unico. Aggiunti divieto esplicito dei cliché più abusati ("cuore", "gruppo", "hanno dato tutto", ecc.) e spunti narrativi automatici basati sui dati reali (doppiette, autogol, partite a reti inviolate).
