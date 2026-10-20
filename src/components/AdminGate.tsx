import React, { useState } from 'react';
import { Api } from '../services/api';

interface AdminGateProps {
  onLogin: (pin: string) => void;
  onBackToStaff: () => void;
  initialMessage?: string;
}

export const AdminGate: React.FC<AdminGateProps> = ({ onLogin, onBackToStaff, initialMessage }) => {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState(initialMessage || '');
  const [loading, setLoading] = useState(false);

  const handleTry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPin = pin.trim();
    if (!cleanPin) return;

    setLoading(true);
    setMsg('확인 중…');

    try {
      await Api.verifyPin(cleanPin);
      onLogin(cleanPin);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMsg(errorMsg || '관리자 비밀번호가 올바르지 않습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[380px] mx-auto my-[10vh] px-4">
      <div className="bg-white rounded-3xl p-7 sm:p-8 text-center shadow-xl border border-[#dfe4ee]">
        <h2 className="text-2xl font-bold text-[#1d2433] mb-6">🔒 관리자 로그인</h2>

        <form onSubmit={handleTry} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setMsg('');
            }}
            placeholder="비밀번호"
            autoComplete="off"
            autoFocus
            className="w-full text-center text-2xl tracking-[6px] py-3.5 px-4 rounded-xl border border-[#dfe4ee] focus:border-[#2f6fed] focus:ring-2 focus:ring-[#e7efff] outline-none transition-all"
          />

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="w-full py-3.5 px-4 rounded-xl bg-[#2f6fed] hover:bg-[#2558be] disabled:bg-[#c3cbdb] text-white font-bold text-base shadow transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? '확인 중…' : '확인'}
          </button>
        </form>

        {msg && (
          <div className="text-[#d64545] min-h-6 mt-4 text-sm font-semibold">{msg}</div>
        )}

        {Api.isDemo && (
          <p className="text-xs text-[#5f6b80] mt-3">데모 모드 비밀번호: 1234</p>
        )}

        <button
          type="button"
          onClick={onBackToStaff}
          className="w-full mt-4 py-2.5 px-4 rounded-xl border border-[#dfe4ee] hover:bg-slate-50 text-[#1d2433] text-sm font-medium transition-colors"
        >
          ← 교직원 화면
        </button>
      </div>
    </div>
  );
};
