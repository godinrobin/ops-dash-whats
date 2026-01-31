// Facebook Pixel utility for tracking events
// Pixel ID: 1633663818061727

declare global {
  interface Window {
    fbq?: (action: string, event: string, params?: Record<string, unknown>) => void;
  }
}

// Track CompleteRegistration event
export const trackCompleteRegistration = () => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'CompleteRegistration');
    console.log('[Facebook Pixel] CompleteRegistration event fired');
  }
};

// Track Purchase event with value
export const trackPurchase = (value: number, currency: string = 'BRL') => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Purchase', {
      value: value,
      currency: currency,
    });
    console.log(`[Facebook Pixel] Purchase event fired: ${value} ${currency}`);
  }
};

// Generic track event
export const trackEvent = (eventName: string, params?: Record<string, unknown>) => {
  if (typeof window !== 'undefined' && window.fbq) {
    if (params) {
      window.fbq('track', eventName, params);
    } else {
      window.fbq('track', eventName);
    }
    console.log(`[Facebook Pixel] ${eventName} event fired`, params);
  }
};
