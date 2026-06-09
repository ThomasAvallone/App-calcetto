// Icona emoji per ruolo giocatore — condivisa tra le viste di setup/dettaglio.
export function getRoleIcon(role) {
  const icons = { 'Portiere': '🧤', 'Difensore': '🛡️', 'Centrocampista': '⚙️', 'Attaccante': '⚡' };
  return icons[role] || '⚽';
}
