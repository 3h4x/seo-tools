export type GapSeverity = 'high' | 'medium' | 'low';
export type GapCategory = 'crawlability' | 'content' | 'social' | 'indexing' | 'structured-data' | 'performance' | 'security';

export const GAP_SEVERITY_STYLES: Record<GapSeverity, {
  label: string; bg: string; text: string; dot: string; border: string; accentBorder: string;
}> = {
  high:   { label: 'High',   bg: 'bg-red-500/10',   text: 'text-red-400',   dot: 'bg-red-500',   border: 'border-red-500/20',   accentBorder: 'border-l-red-500' },
  medium: { label: 'Medium', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500', border: 'border-amber-500/20', accentBorder: 'border-l-amber-500' },
  low:    { label: 'Low',    bg: 'bg-blue-500/10',  text: 'text-blue-400',  dot: 'bg-blue-500',  border: 'border-blue-500/20',  accentBorder: 'border-l-blue-500' },
};

export const CATEGORY_LABELS: Record<GapCategory, string> = {
  crawlability: 'Crawlability',
  content: 'Content',
  social: 'Social',
  indexing: 'Indexing',
  'structured-data': 'Structured Data',
  performance: 'Performance',
  security: 'Security',
};

export interface GapRecommendation {
  id: string;
  title: string;
  description: string;
  severity: GapSeverity;
  category: GapCategory;
  hint: string;
  affectedPages?: string[];
  evidence?: string[];
}
