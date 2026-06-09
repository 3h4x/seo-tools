import type { DetailsHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

interface DisclosureProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  children: ReactNode;
  contentProps?: HTMLAttributes<HTMLDivElement>;
  contentClassName?: string;
  summary: ReactNode;
  summaryProps?: HTMLAttributes<HTMLElement>;
  summaryClassName?: string;
}

export function Disclosure({
  children,
  className,
  contentProps,
  contentClassName,
  summary,
  summaryProps,
  summaryClassName,
  ...props
}: DisclosureProps) {
  return (
    <details className={className} {...props}>
      <summary className={summaryClassName} {...summaryProps}>{summary}</summary>
      {contentClassName ? <div className={contentClassName} {...contentProps}>{children}</div> : children}
    </details>
  );
}
