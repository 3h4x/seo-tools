import type { ReactNode } from 'react';

interface ConfiguredNoticeProps {
  children: ReactNode;
  className?: string;
}

export function ConfiguredNotice({ children, className = '' }: ConfiguredNoticeProps) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md bg-neutral-900 border border-neutral-700 text-sm text-neutral-400 ${className}`}>
      <span className="text-green-500">●</span>
      {children}
    </div>
  );
}
