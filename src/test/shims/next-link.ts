import { createElement } from './react';
import type { ReactNode } from './react';

export default function Link({ href, children, ...props }: { href: string; children?: ReactNode }) {
  return createElement('a', { href, ...props }, children);
}
