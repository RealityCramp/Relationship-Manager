import type { Category, Contact, Graph, ImportJob, IntegrationPublic, Interaction, Relationship, Source, Summary, Tag, User, Workspace, WorkspaceMember } from '@shared/types.ts';
import type { VennRegion, TreeNode } from '@shared/graph.ts';
import type { ProviderSpec } from '../../../server/src/connectors/index.ts';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    public offline = false,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline', null, true);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const d = data as { error?: string; details?: unknown; offline?: boolean } | null;
    throw new ApiError(res.status, d?.error ?? res.statusText, d?.details, !!d?.offline);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  auth: {
    me: () => request<{ user: User; workspaces: Workspace[] }>('GET', '/auth/me'),
    login: (email: string, password: string) => request<{ user: User; workspaces: Workspace[] }>('POST', '/auth/login', { email, password }),
    register: (email: string, name: string, password: string) => request<{ user: User; workspaces: Workspace[] }>('POST', '/auth/register', { email, name, password }),
    logout: () => request<void>('POST', '/auth/logout', {}),
    update: (body: { name?: string; password?: string; currentPassword?: string }) => request<{ user: User }>('PATCH', '/auth/me', body),
  },
  workspaces: {
    list: () => request<Workspace[]>('GET', '/workspaces'),
    create: (body: { name: string; selfEmails?: string[]; corporateDomains?: string[] }) => request<Workspace>('POST', '/workspaces', body),
    update: (id: string, body: Partial<Pick<Workspace, 'name' | 'selfEmails' | 'corporateDomains'>>) => request<Workspace>('PATCH', `/workspaces/${id}`, body),
    remove: (id: string) => request<void>('DELETE', `/workspaces/${id}`),
    members: (id: string) => request<{ members: WorkspaceMember[]; invites: { id: string; email: string; role: string; token: string | null; createdAt: string }[] }>('GET', `/workspaces/${id}/members`),
    invite: (id: string, email: string, role: string) => request<{ joined: boolean; token?: string; link?: string; members?: WorkspaceMember[] }>('POST', `/workspaces/${id}/invites`, { email, role }),
    revokeInvite: (id: string, inviteId: string) => request<void>('DELETE', `/workspaces/${id}/invites/${inviteId}`),
    setRole: (id: string, userId: string, role: string) => request<WorkspaceMember[]>('PATCH', `/workspaces/${id}/members/${userId}`, { role }),
    removeMember: (id: string, userId: string) => request<void>('DELETE', `/workspaces/${id}/members/${userId}`),
    invitePreview: (token: string) => request<{ email: string; role: string; workspaceName: string; accepted: boolean }>('GET', `/invites/${token}`),
    acceptInvite: (token: string) => request<Workspace>('POST', `/invites/${token}/accept`, {}),
  },
  contacts: {
    list: (ws: string, params: Record<string, string | undefined> = {}) => request<{ total: number; contacts: Contact[] }>('GET', `/workspaces/${ws}/contacts${qs(params)}`),
    get: (ws: string, id: string) => request<ContactDetail>('GET', `/workspaces/${ws}/contacts/${id}`),
    create: (ws: string, body: Partial<Contact>) => request<Contact>('POST', `/workspaces/${ws}/contacts`, body),
    update: (ws: string, id: string, body: Partial<Contact> & { categoryOverrides?: Category[] | null }) => request<Contact>('PATCH', `/workspaces/${ws}/contacts/${id}`, body),
    remove: (ws: string, id: string) => request<void>('DELETE', `/workspaces/${ws}/contacts/${id}`),
    merge: (ws: string, keepId: string, otherId: string) => request<Contact>('POST', `/workspaces/${ws}/contacts/${keepId}/merge`, { otherId }),
    duplicates: (ws: string) => request<{ a: Contact; b: Contact; reason: string }[]>('GET', `/workspaces/${ws}/duplicates`),
    addInteraction: (ws: string, id: string, body: { channel: string; direction: string; subject: string; occurredAt?: string }) => request<Contact>('POST', `/workspaces/${ws}/contacts/${id}/interactions`, body),
  },
  graph: (ws: string, params: Record<string, string | undefined> = {}) => request<Graph>('GET', `/workspaces/${ws}/graph${qs(params)}`),
  relationships: {
    create: (ws: string, body: { fromContactId: string; toContactId: string; kind: Category; strength?: number; notes?: string }) => request<Relationship>('POST', `/workspaces/${ws}/relationships`, body),
    remove: (ws: string, id: string) => request<void>('DELETE', `/workspaces/${ws}/relationships/${id}`),
  },
  summary: (ws: string) => request<Summary>('GET', `/workspaces/${ws}/summary`),
  analytics: (ws: string, params: Record<string, string | undefined> = {}) => request<Analytics>('GET', `/workspaces/${ws}/analytics${qs(params)}`),
  exportAll: (ws: string) => request<unknown>('GET', `/workspaces/${ws}/export`),
  tags: {
    list: (ws: string) => request<Tag[]>('GET', `/workspaces/${ws}/tags`),
    create: (ws: string, name: string, color?: string) => request<Tag>('POST', `/workspaces/${ws}/tags`, { name, color }),
    remove: (ws: string, id: string) => request<void>('DELETE', `/workspaces/${ws}/tags/${id}`),
  },
  imports: {
    list: (ws: string) => request<ImportJob[]>('GET', `/workspaces/${ws}/imports`),
    preview: (ws: string, body: { source: Source; filename: string; text: string; bidirectionalOnly?: boolean }) => request<ImportPreview>('POST', `/workspaces/${ws}/imports/preview`, body),
    run: (ws: string, body: { source: Source; filename: string; text: string; bidirectionalOnly?: boolean }) => request<ImportJob>('POST', `/workspaces/${ws}/imports`, body),
  },
  providers: () => request<ProviderSpec[]>('GET', '/providers'),
  integrations: {
    list: (ws: string) => request<IntegrationPublic[]>('GET', `/workspaces/${ws}/integrations`),
    create: (ws: string, body: { provider: string; label?: string; config: Record<string, string> }) => request<IntegrationPublic>('POST', `/workspaces/${ws}/integrations`, body),
    update: (ws: string, id: string, body: { label?: string; config?: Record<string, string>; clearSecrets?: string[] }) => request<IntegrationPublic>('PATCH', `/workspaces/${ws}/integrations/${id}`, body),
    remove: (ws: string, id: string) => request<void>('DELETE', `/workspaces/${ws}/integrations/${id}`),
    test: (ws: string, id: string) => request<{ ok: true; detail: string }>('POST', `/workspaces/${ws}/integrations/${id}/test`, {}),
    sync: (ws: string, id: string) => request<{ integration: IntegrationPublic; jobs: ImportJob[] }>('POST', `/workspaces/${ws}/integrations/${id}/sync`, {}),
  },
};

export interface ContactDetail {
  contact: Contact;
  interactions: Interaction[];
  relationships: (Relationship & { other: { id: string; name: string; company: string | null; isSelf: boolean; categories: Category[] } })[];
  timeline: { month: string; count: number }[];
}

export interface ImportPreview {
  total: number;
  interactions: number;
  warnings: string[];
  sample: { displayName: string; company?: string; title?: string; emails?: string[]; categories?: Category[] }[];
}

export interface Analytics {
  total: number;
  venn: VennRegion[];
  chord: { labels: Category[]; matrix: number[][] };
  sankey: { nodes: { id: string; label: string; kind: 'source' | 'category' | 'company' }[]; links: { source: string; target: string; value: number }[] };
  hierarchy: TreeNode;
  timeline: { month: string; count: number }[];
  sourcesByCategory: Record<Category, Record<Source, number>>;
  strengthHistogram: { bucket: string; count: number }[];
  topContacts: { id: string; name: string; strength: number; categories: Category[]; interactionCount: number }[];
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}
