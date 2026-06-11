'use client';

import { useState } from 'react';

import { Badge, Disclosure, Surface } from '@/components/ui';
import { Icons } from './icons';

const DATALAYER_SNIPPET = `import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

function send({ name, value, id, rating, delta, navigationType }) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'core_web_vitals',
    vitals_name: name,
    vitals_value: value,
    vitals_id: id,
    vitals_rating: rating,
    vitals_delta: delta,
    vitals_navigation_type: navigationType,
  });
}

if (typeof window !== 'undefined') {
  onLCP(send); onINP(send); onCLS(send); onFCP(send); onTTFB(send);
}`;

const SETUP_GUIDE_TRIGGER_ID = 'cwv-setup-guide-trigger';
const SETUP_GUIDE_PANEL_ID = 'cwv-setup-guide-panel';

export default function CwvSetupGuide({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Surface padding="none" className="bg-neutral-900/40">
      <Disclosure
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        summaryProps={{
          id: SETUP_GUIDE_TRIGGER_ID,
          'aria-controls': SETUP_GUIDE_PANEL_ID,
          'aria-expanded': open ? 'true' : 'false',
        }}
        summary={
          <span className="flex w-full items-center justify-between gap-3 text-left">
            <span className="flex items-center gap-2">
              <span className={`inline-flex text-neutral-500 transition-transform ${open ? 'rotate-90' : ''}`}>
                {Icons.disclosure}
              </span>
              How to wire Core Web Vitals (GTM + GA4)
            </span>
            <Badge size="compact" shape="rounded" tone="subtle">
              required once per project
            </Badge>
          </span>
        }
        summaryClassName="flex min-h-11 cursor-pointer list-none items-center px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800/50 [&::-webkit-details-marker]:hidden"
        contentClassName={open ? 'px-4 pb-5 space-y-5 text-sm text-neutral-300' : undefined}
        contentProps={open ? {
          id: SETUP_GUIDE_PANEL_ID,
          role: 'region',
          'aria-labelledby': SETUP_GUIDE_TRIGGER_ID,
        } : undefined}
      >
        {open && (
          <>
            <Step n={1} title="Push CWV to dataLayer in your app">
              <p className="text-neutral-400">
                Install <code className="font-mono text-neutral-200">web-vitals</code> and emit each metric
                into <code className="font-mono text-neutral-200">dataLayer</code> in production builds only:
              </p>
              <Surface padding="none" className="overflow-hidden rounded bg-neutral-950">
                <pre className="overflow-x-auto p-3 font-mono text-xs text-neutral-300 whitespace-pre">
{DATALAYER_SNIPPET}
                </pre>
              </Surface>
            </Step>

            <Step n={2} title="GTM — Data Layer Variables">
              <p className="text-neutral-400">Variables → New → Data Layer Variable (Version 2). Create:</p>
              <ul className="list-disc pl-5 space-y-0.5 font-mono text-xs text-neutral-300">
                <li>DLV - vitals_name → <span className="text-neutral-500">vitals_name</span></li>
                <li>DLV - vitals_value → <span className="text-neutral-500">vitals_value</span></li>
                <li>DLV - vitals_id → <span className="text-neutral-500">vitals_id</span></li>
                <li>DLV - vitals_rating → <span className="text-neutral-500">vitals_rating</span> <em className="text-neutral-600">(optional)</em></li>
              </ul>
            </Step>

            <Step n={3} title="GTM — Trigger">
              <p className="text-neutral-400">
                Triggers → New → Custom Event. Event name: <code className="font-mono">core_web_vitals</code>.
                Fires on: All Custom Events. Name it <code className="font-mono">CE - core_web_vitals</code>.
              </p>
            </Step>

            <Step n={4} title="GTM — GA4 Event Tag">
              <p className="text-neutral-400">Tags → New → Google Analytics: GA4 Event:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                <li>Event Name: <code className="font-mono">core_web_vitals</code></li>
                <li>Event Parameters:
                  <ul className="list-disc pl-5 space-y-0.5 font-mono text-neutral-400">
                    <li>metric_name → {'{{DLV - vitals_name}}'}</li>
                    <li>metric_value → {'{{DLV - vitals_value}}'}</li>
                    <li>metric_id → {'{{DLV - vitals_id}}'}</li>
                    <li>metric_rating → {'{{DLV - vitals_rating}}'} <em className="text-neutral-600 not-italic">(optional)</em></li>
                  </ul>
                </li>
                <li>Triggering: <code className="font-mono">CE - core_web_vitals</code></li>
              </ul>
            </Step>

            <Step n={5} title="GA4 — Custom Definitions">
              <p className="text-neutral-400">
                Admin → Custom definitions. These names must match exactly — the Performance tab queries
                them via <code className="font-mono">customEvent:metric_name</code> and{' '}
                <code className="font-mono">customEvent:metric_value</code>.
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                <li>Custom dimension: <strong>Metric Name</strong> · scope Event · param <code className="font-mono">metric_name</code></li>
                <li>Custom dimension: <strong>Metric Rating</strong> · scope Event · param <code className="font-mono">metric_rating</code> <em className="text-neutral-600 not-italic">(optional)</em></li>
                <li>Custom metric: <strong>Metric Value</strong> · scope Event · param <code className="font-mono">metric_value</code> · unit Milliseconds</li>
              </ul>
            </Step>

            <Step n={6} title="Verify">
              <p className="text-neutral-400">
                GTM Preview on prod URL → click around (clicks fire INP) → confirm{' '}
                <code className="font-mono">core_web_vitals</code> events in Tag Assistant. Then GA4 →{' '}
                DebugView. Once events flow, Submit → Publish in GTM. Data appears here within ~30 minutes
                of cache TTL; standard reports lag 24–48h.
              </p>
            </Step>
          </>
        )}
      </Disclosure>
    </Surface>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
        <Badge tone="muted" className="size-5 justify-center !p-0">{n}</Badge>
        {title}
      </h4>
      <div className="pl-7 space-y-2 text-xs">{children}</div>
    </div>
  );
}
