// DevTools Protection Script
// Prevents console manipulation and debugging attempts
(function() {
  'use strict';

  // Disable right-click context menu in production
  if (window.location.hostname !== 'localhost') {
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      return false;
    });
  }

  // Disable common keyboard shortcuts for DevTools
  document.addEventListener('keydown', function(e) {
    // F12
    if (e.keyCode === 123) {
      e.preventDefault();
      return false;
    }
    // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
      e.preventDefault();
      return false;
    }
    // Ctrl+U (view source)
    if (e.ctrlKey && e.keyCode === 85) {
      e.preventDefault();
      return false;
    }
  });

  // Clear console periodically
  setInterval(function() {
    console.clear();
  }, 1000);

  // Override console methods
  const noop = function() {};
  const originalConsole = { ...console };
  
  // Preserve error logging for debugging but disable in production for sensitive logs
  if (window.location.hostname !== 'localhost') {
    console.log = noop;
    console.debug = noop;
    console.info = noop;
    console.warn = noop;
  }

  // Debugger detection
  let devtoolsOpen = false;
  
  const detectDevTools = function() {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    if (widthThreshold || heightThreshold) {
      if (!devtoolsOpen) {
        devtoolsOpen = true;
        // Redirect or show warning
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:#fff;font-family:system-ui;"><div style="text-align:center;"><h1 style="color:#f97316;">⚠️ DevTools Detectado</h1><p>Por favor, feche as ferramentas do desenvolvedor para continuar.</p></div></div>';
      }
    } else {
      devtoolsOpen = false;
    }
  };

  // Check periodically
  setInterval(detectDevTools, 1000);

  // Anti-debugging techniques
  (function antiDebug() {
    function detectDebugger() {
      const start = performance.now();
      debugger;
      const end = performance.now();
      if (end - start > 100) {
        // Debugger was triggered, user has DevTools open
        window.location.reload();
      }
    }
    
    // Run anti-debug check periodically in production
    if (window.location.hostname !== 'localhost') {
      setInterval(detectDebugger, 5000);
    }
  })();
})();
