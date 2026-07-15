import React, { useState, useEffect } from 'react';

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isMobileDevice = () =>
  isIOS() || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (installed || !isMobileDevice()) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    setShowModal(true);
  };

  return (
    <>
      <button className="tk-hover tk-press" style={styles.installBtn} onClick={handleClick} title="Add to Home Screen">
        📲 Install
      </button>
      {showModal && (
        <div className="tk-fade-in" style={styles.overlay} onClick={() => setShowModal(false)}>
          <div className="tk-pop" style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={styles.title}>📲 Add to Home Screen</h3>
            <div style={styles.step}>
              <span style={styles.stepNum}>1</span>
              <span>Tap the <strong>Share</strong> button <span style={styles.shareIcon}>⬆️</span> in Safari's toolbar</span>
            </div>
            <div style={styles.step}>
              <span style={styles.stepNum}>2</span>
              <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
            </div>
            <div style={styles.step}>
              <span style={styles.stepNum}>3</span>
              <span>Tap <strong>"Add"</strong> in the top right corner</span>
            </div>
            <button className="tk-hover tk-press" style={styles.closeBtn} onClick={() => setShowModal(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}

const NAVY = '#1A2744';
const AMBER = '#F5A623';
const AMBER_DARK = '#D98C0F';

const styles = {
  installBtn: {
    background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`,
    color: NAVY,
    border: 'none',
    padding: '8px 14px',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: '0.1px',
    boxShadow: '0 4px 12px rgba(245,166,35,0.35)',
  },
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(18,27,52,0.55)', WebkitBackdropFilter: 'blur(2px)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20,
  },
  modal: {
    backgroundColor: '#fff', borderRadius: 22, width: '100%', maxWidth: 380,
    padding: '26px 24px', boxSizing: 'border-box',
    boxShadow: '0 12px 32px rgba(26,39,68,0.14), 0 2px 8px rgba(26,39,68,0.08)',
    borderTop: `3px solid ${AMBER}`,
  },
  title: { margin: '0 0 18px', fontSize: 18, fontWeight: 800, color: NAVY, textAlign: 'center' },
  step: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, fontSize: 14, color: '#3A4463', lineHeight: 1.5 },
  stepNum: {
    flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
    background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`, color: NAVY,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
  },
  shareIcon: { fontSize: 13 },
  closeBtn: {
    width: '100%', marginTop: 8, padding: 13,
    background: `linear-gradient(135deg, ${NAVY}, #253358)`, color: '#fff',
    border: 'none', borderRadius: 10, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
  },
};
