import { GAP_SEVERITY_STYLES } from './constants';

export type GapSeverity = keyof typeof GAP_SEVERITY_STYLES;
export type GapCategory = 'crawlability' | 'content' | 'social' | 'indexing' | 'structured-data' | 'performance' | 'security';

export { GAP_SEVERITY_STYLES };

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
