type ComponentType = (props: Record<string, unknown>, context?: unknown) => ReactElement;

export type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactNode[];
export type MouseEvent = unknown;

export interface ReactElement {
  type: string | symbol | ComponentType;
  props: Record<string, unknown>;
  key: string | number | null;
}

export const Fragment = Symbol.for('react.fragment');

export function createElement(
  type: ReactElement['type'],
  props: Record<string, unknown> | null,
  ...children: ReactNode[]
): ReactElement {
  const nextProps = { ...(props ?? {}) };
  const key = nextProps.key as string | number | null | undefined;
  delete nextProps.key;

  if (children.length === 1) {
    nextProps.children = children[0];
  } else if (children.length > 1) {
    nextProps.children = children;
  }

  return { type, props: nextProps, key: key ?? null };
}

export function isValidElement(value: unknown): value is ReactElement {
  return Boolean(value && typeof value === 'object' && 'type' in value && 'props' in value);
}

export function useState<T>(initialValue: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] {
  const value = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  return [value, () => undefined];
}

export function useEffect(): void {
  return undefined;
}

export function useMemo<T>(factory: () => T): T {
  return factory();
}

export function useCallback<T extends (...args: never[]) => unknown>(callback: T): T {
  return callback;
}

export function useRef<T>(initialValue: T): { current: T } {
  return { current: initialValue };
}

export function createContext<T>(defaultValue: T) {
  return {
    Provider: ({ children }: { children: ReactNode }) => children,
    _defaultValue: defaultValue,
  };
}

export function useContext<T>(context: { _defaultValue: T }): T {
  return context._defaultValue;
}

const React = {
  Fragment,
  createElement,
  isValidElement,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  createContext,
  useContext,
};

export default React;
