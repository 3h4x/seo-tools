'use client';

import { useState } from 'react';
import { FormButton } from '@/components/ui';
import { Icons } from './icons';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <FormButton
      onClick={handleCopy}
      hasIcon
      size="compact"
      variant={copied ? 'success' : 'muted'}
      className={`font-medium ${className}`}
      title={`Copy ${label || 'to clipboard'}`}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? `Copied ${label || 'text'} to clipboard` : ''}
      </span>
      {copied ? (
        <>
          {Icons.check}
          Copied
        </>
      ) : (
        <>
          {Icons.copy}
          Copy
        </>
      )}
    </FormButton>
  );
}
