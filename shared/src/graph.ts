import { CATEGORIES, type Category, type Contact, type Source } from './types.ts';

/** Count of contacts for every combination of categories — the input to the Venn diagram. */
export interface VennRegion {
  sets: Category[];
  /** Contacts that are in exactly these sets (and no others). */
  exclusive: number;
  /** Contacts that are in all of these sets (possibly others too). */
  inclusive: number;
  contactIds: string[];
}

export function vennRegions(contacts: Contact[], sets: Category[] = CATEGORIES): VennRegion[] {
  const regions: VennRegion[] = [];
  const n = sets.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const combo = sets.filter((_, i) => mask & (1 << i));
    const exclusiveIds: string[] = [];
    let inclusive = 0;
    for (const c of contacts) {
      const has = combo.every((s) => c.categories.includes(s));
      if (!has) continue;
      inclusive++;
      const extra = sets.some((s, i) => !(mask & (1 << i)) && c.categories.includes(s));
      if (!extra) exclusiveIds.push(c.id);
    }
    regions.push({ sets: combo, exclusive: exclusiveIds.length, inclusive, contactIds: exclusiveIds });
  }
  return regions;
}

/** Square matrix of shared contacts between categories (diagonal = exclusive counts) for the chord diagram. */
export function categoryMatrix(contacts: Contact[]): { labels: Category[]; matrix: number[][] } {
  const labels = CATEGORIES;
  const matrix = labels.map(() => labels.map(() => 0));
  for (const c of contacts) {
    const cats = c.categories.filter((k) => labels.includes(k));
    if (cats.length === 1) {
      const i = labels.indexOf(cats[0]);
      matrix[i][i]++;
    }
    for (const a of cats)
      for (const b of cats)
        if (a !== b) matrix[labels.indexOf(a)][labels.indexOf(b)]++;
  }
  return { labels, matrix };
}

/** Source → Category → Company flows for the Sankey diagram. */
export function sankeyFlows(contacts: Contact[], maxCompanies = 12): { nodes: { id: string; label: string; kind: 'source' | 'category' | 'company' }[]; links: { source: string; target: string; value: number }[] } {
  const nodes = new Map<string, { id: string; label: string; kind: 'source' | 'category' | 'company' }>();
  const links = new Map<string, number>();
  const companyCounts = new Map<string, number>();
  for (const c of contacts) if (c.company) companyCounts.set(c.company, (companyCounts.get(c.company) ?? 0) + 1);
  const topCompanies = new Set(
    Array.from(companyCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxCompanies)
      .map(([k]) => k),
  );
  const add = (id: string, label: string, kind: 'source' | 'category' | 'company') => {
    if (!nodes.has(id)) nodes.set(id, { id, label, kind });
  };
  const link = (a: string, b: string) => links.set(`${a}→${b}`, (links.get(`${a}→${b}`) ?? 0) + 1);
  for (const c of contacts) {
    const sources = Array.from(new Set(c.sources.map((s) => s.source)));
    for (const s of sources) {
      add(`src:${s}`, s, 'source');
      for (const k of c.categories) {
        add(`cat:${k}`, k, 'category');
        link(`src:${s}`, `cat:${k}`);
      }
    }
    const company = c.company && topCompanies.has(c.company) ? c.company : c.company ? 'Other companies' : 'No company';
    add(`co:${company}`, company, 'company');
    for (const k of c.categories) link(`cat:${k}`, `co:${company}`);
  }
  return {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.entries()).map(([key, value]) => {
      const [source, target] = key.split('→');
      return { source, target, value };
    }),
  };
}

export interface TreeNode {
  name: string;
  value?: number;
  id?: string;
  category?: Category;
  children?: TreeNode[];
}

/** Category → Company → Person hierarchy for the treemap and radial tree. */
export function hierarchy(contacts: Contact[]): TreeNode {
  const root: TreeNode = { name: 'Network', children: [] };
  for (const cat of CATEGORIES) {
    const catNode: TreeNode = { name: cat, category: cat, children: [] };
    const byCompany = new Map<string, TreeNode>();
    for (const c of contacts) {
      if (!c.categories.includes(cat) || c.isSelf) continue;
      const company = c.company || 'Independent';
      let co = byCompany.get(company);
      if (!co) {
        co = { name: company, category: cat, children: [] };
        byCompany.set(company, co);
      }
      co.children!.push({ name: c.displayName, id: c.id, category: cat, value: 1 + c.strength * 3 });
    }
    catNode.children = Array.from(byCompany.values()).sort((a, b) => b.children!.length - a.children!.length);
    if (catNode.children.length) root.children!.push(catNode);
  }
  return root;
}

/** Interaction buckets per month for the activity timeline. */
export function monthlyBuckets(dates: string[], months = 24): { month: string; count: number }[] {
  const now = new Date();
  const buckets: { month: string; count: number }[] = [];
  const index = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    index.set(key, buckets.length);
    buckets.push({ month: key, count: 0 });
  }
  for (const iso of dates) {
    const key = iso.slice(0, 7);
    const i = index.get(key);
    if (i !== undefined) buckets[i].count++;
  }
  return buckets;
}

export function countBy<T extends string>(items: T[], keys: readonly T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const i of items) if (i in out) out[i]++;
  return out;
}

export const SOURCE_LABEL: Record<Source, string> = {
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
  contacts: 'Contacts',
  email: 'Email',
  manual: 'Manual',
};
