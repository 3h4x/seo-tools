import { NextResponse } from 'next/server';
import type { SiteFieldErrors } from '@/lib/sites';

type SiteRouteErrorOptions = {
  status?: number;
  errors?: unknown;
};

type SiteRouteParamsContext = {
  params: Promise<{ site: string }>;
};

export function siteRouteOk() {
  return NextResponse.json({ ok: true });
}

export function siteRouteError(error: string, options: SiteRouteErrorOptions = {}) {
  const body = options.errors ? { ok: false, error, errors: options.errors } : { ok: false, error };
  return NextResponse.json(body, { status: options.status ?? 400 });
}

export function siteValidationError(errors: SiteFieldErrors) {
  const error = Object.values(errors).filter(Boolean).join('; ');
  return siteRouteError(error, { errors });
}

export function siteNotFoundError() {
  return NextResponse.json({ error: 'Site not found' }, { status: 404 });
}

export function getRequiredQueryParam(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key)?.trim();
  return value ? value : null;
}

export async function getRouteSiteParam(context: SiteRouteParamsContext): Promise<string> {
  return (await context.params).site;
}

export function parseOrderedSiteIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const orderedIds = value
    .map((entry) => typeof entry === 'string' ? entry.trim() : null);

  if (orderedIds.some((entry) => !entry)) {
    return null;
  }

  return orderedIds as string[];
}
