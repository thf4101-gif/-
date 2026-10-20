import React, { useState } from 'react';
import { Api } from '../services/api';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
}

export const PinModal: React.FC<PinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 8) {
      setPin((prev) => prev + digit);
      setMsg('');
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setMsg('');
  };

  const handleVerify = async () => {
    if (!pin || loading) return;
    setLoading(true);
    setMsg('확인 중…');

    try {
      await Api.verifyPin(pin);
      onSuccess(pin);
      setPin('');
      setMsg('');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setMsg(errorMsg || '비밀번호가 올바르지 않습니다.');
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/55 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setPin('');
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-3xl p-6 w-full max-w-[360px] text-center shadow-2xl">
        <h3 className="text-xl font-bold text-[#1d2433] mb-3">🔒 관리자 비밀번호</h3>

        {/* PIN Dots */}
        <div className={`flex justify-center items-center gap-3 h-6 mb-2 ${shaking ? 'animate-shake' : ''}`}>
          {Array.from({ length: Math.max(pin.length, 0) }).map((_, i) => (
            <span key={i} className="w-4 h-4 rounded-full bg-[#2f6fed] inline-block" />
          ))}
          {pin.length === 0 && <span className="text-xs text-[#5f6b80]">비밀번호를 입력하세요</span>}
        </div>

        {/* Message */}
        <div className="min-h-5 text-sm text-[#c0392b] mb-3 font-medium">{msg}</div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="py-3.5 text-2xl font-semibold rounded-2xl border border-[#dfe4ee] bg-[#f8f9fc] active:bg-[#e7efff] text-[#1d2433] transition-colors"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDelete}
            className="py-3.5 text-lg font-medium rounded-2xl border border-[#dfe4ee] bg-[#f8f9fc] active:bg-[#e7efff] text-[#5f6b80] transition-colors"
          >
            지움
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="py-3.5 text-2xl font-semibold rounded-2xl border border-[#dfe4ee] bg-[#f8f9fc] active:bg-[#e7efff] text-[#1d2433] transition-colors"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={loading || !pin}
            className="py-3.5 text-lg font-bold rounded-2xl bg-[#2f6fed] active:bg-[#2558be] disabled:bg-[#c3cbdb] text-white transition-colors"
          >
            확인
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setPin('');
            onClose();
          }}
          className="text-sm text-[#5f6b80] hover:text-[#1d2433] py-2 px-4 rounded-lg"
        >
          닫기
        </button>
      </div>
    </div>
  );
};
