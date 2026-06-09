import { describe, it, expect } from 'vitest';
import { matchSyncState, shouldShowSyncChip } from './matchSyncState';

describe('matchSyncState', () => {
  it('offline ha priorità anche con scritture in attesa', () => {
    expect(matchSyncState(false, true)).toBe('offline');
    expect(matchSyncState(false, false)).toBe('offline');
  });

  it('online con scritture non confermate → syncing', () => {
    expect(matchSyncState(true, true)).toBe('syncing');
  });

  it('online e tutto confermato → synced', () => {
    expect(matchSyncState(true, false)).toBe('synced');
  });
});

describe('shouldShowSyncChip', () => {
  it('nasconde solo lo stato synced ai viewer', () => {
    expect(shouldShowSyncChip('synced', false)).toBe(false);
    expect(shouldShowSyncChip('synced', true)).toBe(true);
  });

  it('offline e syncing sono sempre visibili (admin e viewer)', () => {
    expect(shouldShowSyncChip('offline', false)).toBe(true);
    expect(shouldShowSyncChip('offline', true)).toBe(true);
    expect(shouldShowSyncChip('syncing', false)).toBe(true);
    expect(shouldShowSyncChip('syncing', true)).toBe(true);
  });
});
