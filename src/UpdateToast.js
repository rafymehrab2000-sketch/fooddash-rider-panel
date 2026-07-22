import React, { useEffect, useState } from 'react';

const NAVY = '#1A2744';
const AMBER = '#F5A623';

// Registers the service worker and watches for a new version becoming
// available. When one activates, it takes over immediately (see sw.js
// skipWaiting/clients.claim), so we show a toast and reload shortly after.
export default function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    const reloadOnce = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const watchForUpdate = (registration) => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          setVisible(true);
          setTimeout(reloadOnce, 2000);
        }
      });
    };

    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          registration.addEventListener('updatefound', () => watchForUpdate(registration));
        })
        .catch(err => console.error('SW registration failed:', err));
    };
    window.addEventListener('load', onLoad);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', reloadOnce);
      window.removeEventListener('load', onLoad);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="tk-pop" style={styles.toast}>Updating to latest version...</div>
  );
}

const styles = {
  toast: {
    position: 'fixed', top: 20, right: 20, zIndex: 99999,
    background: `linear-gradient(135deg, ${NAVY}, #253358)`, color: '#fff',
    padding: '15px 20px', borderRadius: 12,
    boxShadow: '0 12px 32px rgba(26,39,68,0.14), 0 2px 8px rgba(26,39,68,0.08)',
    fontSize: 13.5, fontWeight: 600, borderLeft: `4px solid ${AMBER}`, maxWidth: '86vw',
  },
};
