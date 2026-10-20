import React, { useState, useEffect } from 'react';
import { Api } from '../services/api';

interface HeaderProps {
  title: string;
  classNameTitle?: string;
  onOpenPinModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, classNameTitle, onOpenPinModal }) => {
  const [clockStr, setClockStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const datePart = d.toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });
      const timePart = d.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setClockStr(`${datePart} ${timePart}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {Api.isDemo && (
        <div className="bg-[#fff4d6] text-[#7a5200] text-center py-1.5 px-3 text-xs sm:text-sm font-medium border-b border-[#ffe69c]">
          데모 모드 — 구글 스프레드시트 연동 전입니다 (관리자 페이지 › 설정에서 연동)
        </div>
      )}
      <header className="flex items-center justify-between px-4 sm:px-7 py-3.5 sm:py-4 bg-white border-b border-[#dfe4ee] shadow-xs">
        <h1 className="m-0 text-xl sm:text-2xl font-black text-[#1d2433] flex items-center gap-2">
          <span>📮</span>
          <span>{title}</span>
          {classNameTitle && (
            <small className="text-sm sm:text-base text-[#5f6b80] font-normal hidden sm:inline ml-1">
              {classNameTitle}
            </small>
          )}
        </h1>
        <button
          type="button"
          onClick={onOpenPinModal}
          aria-label="담당자 로그인 및 시계"
          title="누르면 담당자 로그인 화면이 열립니다"
          className="bg-transparent border-0 py-2 pl-4 pr-1 text-sm sm:text-lg text-[#5f6b80] hover:text-[#1d2433] font-mono cursor-pointer transition-colors"
        >
          {clockStr}
        </button>
      </header>
    </>
  );
};
