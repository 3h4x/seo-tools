import { NextResponse } from 'next/server';
import { clearCache, deleteConfig, getConfig, setConfig } from '@/lib/db';

type ConfigSource = 'db' | 'env' | 'none';

type ConfigRouteOptions = {
  configKey: string;
  envKey?: string;
  clearCachePrefix?: string;
  afterMutate?: () => void;
  validateAndNormalize: (raw: string) => Promise<string>;
};

function getSource(configKey: string, envKey?: string): ConfigSource {
  const dbValue = getConfig(configKey);
  if (dbValue) return 'db';

  if (envKey && process.env[envKey]) {
    return 'env';
  }

  return 'none';
}

export function createConfigRouteHandlers({
  configKey,
  envKey,
  clearCachePrefix,
  afterMutate,
  validateAndNormalize,
}: ConfigRouteOptions) {
  return {
    GET() {
      return NextResponse.json({ source: getSource(configKey, envKey) });
    },

    async POST(req: Request) {
      const { key, testOnly } = await req.json() as { key?: string; testOnly?: boolean };

      try {
        const normalizedKey = await validateAndNormalize(key ?? '');

        if (!testOnly) {
          setConfig(configKey, normalizedKey);
          clearCache(clearCachePrefix);
          afterMutate?.();
        }

        return NextResponse.json({ ok: true });
      } catch (err) {
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
      }
    },

    DELETE() {
      deleteConfig(configKey);
      clearCache(clearCachePrefix);
      afterMutate?.();
      return NextResponse.json({ ok: true });
    },
  };
}
