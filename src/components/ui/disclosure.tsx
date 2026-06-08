import type { DetailsHTMLAttributes, ReactNode } from 'react';

interface DisclosureProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  children: ReactNode;
  contentClassName?: string;
  summary: ReactNode;
  summaryClassName?: string;
}

export function Disclosure({
  children,
  className,
  contentClassName,
  summary,
  summaryClassName,
  ...props
}: DisclosureProps) {
  return (
    <details className={className} {...props}>
      <summary className={summaryClassName}>{summary}</summary>
      {contentClassName ? <div className={contentClassName}>{children}</div> : children}
    </details>
  );
}
