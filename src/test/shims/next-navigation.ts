export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}

export function redirect(url: string): never {
  throw new Error(`NEXT_REDIRECT:${url}`);
}

export function usePathname(): string {
  return '/';
}

export function useRouter() {
  return {
    push: () => undefined,
    refresh: () => undefined,
    replace: () => undefined,
  };
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}
