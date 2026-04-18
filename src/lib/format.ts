export function pluralize(count: number, singular: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : singular + 's'}`;
}

const SOURCE_MAP: Record<string, string> = {
  '(direct) / (none)': 'Direct',
  '(not set) / (not set)': 'Unknown',
  't.co / referral': 'Twitter/X',
  'l.facebook.com / referral': 'Facebook',
  'm.facebook.com / referral': 'Facebook (Mobile)',
  'facebook.com / referral': 'Facebook',
  'google / organic': 'Google (Organic)',
  'bing / organic': 'Bing (Organic)',
  'google / cpc': 'Google Ads',
};

export function formatSource(source: string, medium: string): string {
  const key = `${source} / ${medium}`;
  if (SOURCE_MAP[key]) return SOURCE_MAP[key];
  if (medium === '(none)' || medium === '(not set)') return source;
  if (medium === 'organic') return `${source.charAt(0).toUpperCase() + source.slice(1)} (Organic)`;
  if (medium === 'referral') return source;
  return `${source} / ${medium}`;
}

export function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function formatBounce(rate: number): string {
  return (rate * 100).toFixed(0) + '%';
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

export function calcPercentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  if (Math.abs(change) < 1) return null;
  return change;
}

export function formatDateShort(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
