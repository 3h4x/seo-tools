import { createElement, Fragment } from './react';
import type { ReactElement } from './react';

export { Fragment };

export function jsx(
  type: ReactElement['type'],
  props: Record<string, unknown> | null,
  key?: string | number,
): ReactElement {
  return createElement(type, key === undefined ? props : { ...(props ?? {}), key });
}

export const jsxs = jsx;
