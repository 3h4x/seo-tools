import { NextResponse } from 'next/server';
import { clearCache, deleteConfig, getConfig, setConfig } from '@/lib/db';
import { readJsonBody } from '@/lib/json-body';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
      try {
        return NextResponse.json({ source: getSource(configKey, envKey) });
      } catch (error) {
        console.error(`[GET config:${configKey}]`, error);
        return NextResponse.json({ error: 'failed_to_load_config_source' }, { status: 500 });
      }
    },

    async POST(req: Request) {
      const parsed = await readJsonBody(req);
      if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
      }
      if (!isRecord(parsed.body)) {
        return NextResponse.json({ ok: false, error: 'Request body must be an object' }, { status: 400 });
      }

      const { key, testOnly } = parsed.body;
      if (testOnly !== undefined && typeof testOnly !== 'boolean') {
        return NextResponse.json({ ok: false, error: 'testOnly must be a boolean' }, { status: 400 });
      }

      let normalizedKey: string;
      try {
        normalizedKey = await validateAndNormalize(typeof key === 'string' ? key : '');
      } catch (err) {
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
      }

      if (testOnly === true) {
        return NextResponse.json({ ok: true });
      }

      try {
        setConfig(configKey, normalizedKey);
        clearCache(clearCachePrefix);
        afterMutate?.();
        return NextResponse.json({ ok: true });
      } catch (error) {
        console.error(`[POST config:${configKey}]`, error);
        return NextResponse.json({ ok: false, error: 'failed_to_save_config' }, { status: 500 });
      }
    },

    DELETE() {
      try {
        deleteConfig(configKey);
        clearCache(clearCachePrefix);
        afterMutate?.();
        return NextResponse.json({ ok: true });
      } catch (error) {
        console.error(`[DELETE config:${configKey}]`, error);
        return NextResponse.json({ ok: false, error: 'failed_to_delete_config' }, { status: 500 });
      }
    },
  };
}
