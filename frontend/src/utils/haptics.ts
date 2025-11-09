import sdk from "@farcaster/miniapp-sdk";

/**
 * Haptic feedback utility using Farcaster Mini App SDK
 * Falls back to Web Vibration API if SDK is not available
 */
export const triggerHaptic = (
  type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error' = 'selection'
) => {
  try {
    // Use Farcaster SDK haptic methods
    if (type === 'selection' && sdk?.haptics?.selectionChanged) {
      sdk.haptics.selectionChanged();
      return;
    }
    
    if (sdk?.haptics?.impactOccurred) {
      const impactStyle = 
        type === 'light' ? 'light' : 
        type === 'medium' ? 'medium' : 
        type === 'success' ? 'medium' :
        type === 'error' ? 'heavy' :
        'heavy';
      sdk.haptics.impactOccurred(impactStyle);
      return;
    }
    
    // Fallback to Web Vibration API
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      const pattern = 
        type === 'light' ? 10 : 
        type === 'medium' ? 20 : 
        type === 'success' ? [20, 50, 20] :
        type === 'error' ? [30, 50, 30] :
        type === 'heavy' ? 30 : 
        15;
      navigator.vibrate(pattern);
    }
  } catch (error) {
    // Silently fail if haptics aren't available
    console.debug('Haptic feedback not available:', error);
  }
};

