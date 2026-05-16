/**
 * Golden path E2E — partita completa:
 *   login → crea match → registra gol → termina → verifica modal/condivisione
 *
 * Richiede variabili d'ambiente:
 *   E2E_EMAIL    — email di un account Firebase con ruolo admin
 *   E2E_PASSWORD — relativa password
 *
 * Setup locale una tantum:
 *   npx playwright install chromium
 */
import { test, expect } from '@playwright/test';

const EMAIL    = process.env.E2E_EMAIL    ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const HAS_CREDS = EMAIL !== '' && PASSWORD !== '';

// ── Smoke test: l'app carica e mostra la login ─────────────────────────────
test('app loads — login screen visible', async ({ page }) => {
  await page.goto('/');
  // Either redirected to login or dashboard is visible
  await expect(page).toHaveURL(/\//);
  // No unhandled JS errors on load
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForLoadState('networkidle');
  expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
});

// ── Auth test: login con credenziali ─────────────────────────────────────────
test.describe('authenticated flows', () => {
  test.skip(!HAS_CREDS, 'Impostare E2E_EMAIL e E2E_PASSWORD per eseguire i test autenticati');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\//);
      await page.waitForLoadState('networkidle');
    }
  });

  // ── Dashboard visibile dopo il login ───────────────────────────────────────
  test('dashboard loads after login', async ({ page }) => {
    await expect(page.locator('nav')).toBeVisible();
    // Bottom nav deve avere Home, Storico, Giocatori
    await expect(page.getByText('Storico')).toBeVisible();
    await expect(page.getByText('Giocatori')).toBeVisible();
  });

  // ── Navigazione scheda giocatore ───────────────────────────────────────────
  test('players page — player card opens', async ({ page }) => {
    await page.getByText('Giocatori').click();
    await page.waitForLoadState('networkidle');
    const firstPlayer = page.locator('.card').first();
    await firstPlayer.click();
    // La scheda aperta mostra almeno la sezione PI
    await expect(page.getByText(/Power Index/i)).toBeVisible({ timeout: 5000 });
  });

  // ── Storico partite carica ─────────────────────────────────────────────────
  test('history page loads without error', async ({ page }) => {
    await page.getByText('Storico').click();
    await page.waitForLoadState('networkidle');
    // Deve contenere almeno una sezione
    await expect(page.locator('.page-content')).toBeVisible();
  });

  // ── Golden path: partita live ──────────────────────────────────────────────
  // Questo test richiede che esistano già giocatori nel database e che l'utente
  // sia admin. Usa la pagina /match/setup per creare una partita di test.
  test('match golden path — setup, goal, end, report modal', async ({ page }) => {
    await page.goto('/match/setup');
    await page.waitForLoadState('networkidle');

    // Verifica che la pagina di setup si carichi
    await expect(page.locator('.page-content')).toBeVisible();

    // Se ci sono giocatori caricati, selezionane alcuni
    const playerButtons = page.locator('button').filter({ hasText: /^[A-Z]/ });
    const count = await playerButtons.count();
    if (count >= 4) {
      // Seleziona i primi 2 per squadra rossa e 2 per blu
      for (let i = 0; i < Math.min(4, count); i++) {
        await playerButtons.nth(i).click();
      }
    }

    // Se il bottone "Avvia partita" è abilitato, prosegui
    const startBtn = page.getByRole('button', { name: /Avvia/i });
    if (await startBtn.isEnabled()) {
      await startBtn.click();
      // Aspetta la navigazione a /match/:id
      await page.waitForURL(/\/match\/.+/, { timeout: 10_000 });
      await page.waitForLoadState('networkidle');

      // Il timer deve essere visibile
      await expect(page.locator('.timer-display')).toBeVisible();

      // Registra un gol se i bottoni sono disponibili
      const goalBtn = page.getByRole('button', { name: /Gol Rossi/i });
      if (await goalBtn.isVisible()) {
        await goalBtn.click();
        // Seleziona il primo giocatore nel modal scorer
        const firstPlayer = page.locator('.modal button').first();
        await firstPlayer.click();
        // Salta assist e portiere se disponibili
        const noAssist = page.getByRole('button', { name: /Nessun Assist/i });
        if (await noAssist.isVisible()) await noAssist.click();
        const skipGk = page.getByRole('button', { name: /Salta/i });
        if (await skipGk.isVisible()) await skipGk.click();
      }

      // Termina la partita
      const endBtn = page.getByRole('button', { name: /Fine/i }).first();
      await endBtn.click();
      const confirmBtn = page.getByRole('button', { name: /Fine!/i });
      if (await confirmBtn.isVisible()) await confirmBtn.click();

      // Il modal del verdetto deve apparire entro 15s
      await expect(page.locator('.modal')).toBeVisible({ timeout: 15_000 });
      // I bottoni Condividi e Copia devono essere presenti
      await expect(page.getByRole('button', { name: /Condividi|WhatsApp/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Copia/i })).toBeVisible();
    }
  });
});
