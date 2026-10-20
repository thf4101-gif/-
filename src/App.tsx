import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { StaffView } from './components/StaffView';
import { AdminGate } from './components/AdminGate';
import { AdminDashboard } from './components/AdminDashboard';
import { PinModal } from './components/PinModal';
import { Toast } from './components/Toast';
import { sessionStore, SESSION_PIN_KEY, defaultConfig } from './services/api';

type AppMode = 'staff' | 'admin' | 'gate';

export const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('staff');
  const [pin, setPin] = useState<string>(() => sessionStore.get(SESSION_PIN_KEY) || '');
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2500);
  }, []);

  // Sync document title
  useEffect(() => {
    const title = defaultConfig.title || '연수 이수증 수합';
    const className = defaultConfig.className || '';
    document.title = (className ? className + ' ' : '') + title;
  }, []);

  const handlePinSuccessFromModal = (verifiedPin: string) => {
    setPin(verifiedPin);
    sessionStore.set(SESSION_PIN_KEY, verifiedPin);
    setPinModalOpen(false);
    setMode('admin');
  };

  const handleAdminGateLogin = (verifiedPin: string) => {
    setPin(verifiedPin);
    sessionStore.set(SESSION_PIN_KEY, verifiedPin);
    setMode('admin');
  };

  const handleLogout = () => {
    setPin('');
    sessionStore.set(SESSION_PIN_KEY, null);
    setMode('staff');
    showToast('로그아웃했습니다');
  };

  const handlePinChange = (newPin: string) => {
    setPin(newPin);
    sessionStore.set(SESSION_PIN_KEY, newPin);
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-[#1d2433] selection:bg-[#e7efff] selection:text-[#2f6fed]">
      {mode === 'staff' && (
        <>
          <Header
            title={defaultConfig.title}
            classNameTitle={defaultConfig.className}
            onOpenPinModal={() => {
              if (pin) {
                setMode('admin');
              } else {
                setPinModalOpen(true);
              }
            }}
          />
          <StaffView />
          <PinModal
            isOpen={pinModalOpen}
            onClose={() => setPinModalOpen(false)}
            onSuccess={handlePinSuccessFromModal}
          />
        </>
      )}

      {mode === 'gate' && (
        <AdminGate
          onLogin={handleAdminGateLogin}
          onBackToStaff={() => setMode('staff')}
        />
      )}

      {mode === 'admin' && (
        <AdminDashboard
          pin={pin}
          onLogout={handleLogout}
          onNavigateToStaff={() => setMode('staff')}
          onPinChange={handlePinChange}
          showToast={showToast}
        />
      )}

      <Toast message={toastMessage} />
    </div>
  );
};

export default App;
