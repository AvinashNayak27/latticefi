/**
 * Haptics utility tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerHaptic } from '../../../frontend/src/utils/haptics';

// Mock Farcaster SDK
vi.mock('@farcaster/miniapp-sdk', () => ({
  default: {
    haptics: {
      selectionChanged: vi.fn(),
      impactOccurred: vi.fn(),
    },
  },
}));

describe('haptics', () => {
  beforeEach(() => {
    // Mock window.navigator.vibrate
    global.navigator = {
      ...global.navigator,
      vibrate: vi.fn(),
    } as Navigator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trigger light haptic feedback', () => {
    triggerHaptic('light');
    // Should call either SDK or fallback to vibrate
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('should trigger medium haptic feedback', () => {
    triggerHaptic('medium');
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('should trigger heavy haptic feedback', () => {
    triggerHaptic('heavy');
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('should trigger success haptic feedback', () => {
    triggerHaptic('success');
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('should trigger error haptic feedback', () => {
    triggerHaptic('error');
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('should trigger selection haptic feedback', () => {
    triggerHaptic('selection');
    // Selection might use SDK method, so just check it doesn't throw
    expect(() => triggerHaptic('selection')).not.toThrow();
  });

  it('should handle missing vibrate API gracefully', () => {
    // @ts-ignore - simulate missing vibrate
    delete (global.navigator as any).vibrate;
    expect(() => triggerHaptic('light')).not.toThrow();
  });
});

