import React from 'react';

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed left-1/2 bottom-6 -translate-x-1/2 bg-[#1d2433] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50 pointer-events-none transition-opacity duration-200">
      {message}
    </div>
  );
};
