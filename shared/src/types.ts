/**
 * Shared domain types used by the API, the web app, importers and tests.
 */

export type Category = 'personal' | 'business' | 'corporate' | 'social';
export const CATEGORIES: Category[] = ['personal', 'business', 'corporate', 'social'];

export type Source = 'linkedin' | 'facebook' | 'x' | 'contacts' | 'email' | 'manual';
export const SOURCES: Source[] = ['linkedin', 'facebook', 'x', 'contacts', 'email', 'manual'];

export type Role = 'owner' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  role: Role;
  createdAt: string;
  /** Email domains that count as "my company" for corporate classification. */
  corporateDomains: string[];
  /** The owner's own email addresses, used to detect bidirectional threads. */
  selfEmails: string[];
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface ContactSource {
  id: string;
  source: Source;
  externalId: string | null;
  handle: string | null;
  url: string | null;
  importedAt: string;
}

export interface Contact {
  id: string;
  workspaceId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  emails: string[];
  phones: string[];
  company: string | null;
  title: string | null;
  location: string | null;
  avatarUrl: string | null;
  notes: string;
  /** Categories inferred from sources, plus any manual overrides. */
  categories: Category[];
  /** Manual overrides win over inference. */
  categoryOverrides: Category[] | null;
  tags: string[];
  sources: ContactSource[];
  /** Relationship strength 0..1 computed from interactions and sources. */
  strength: number;
  interactionCount: number;
  lastInteractionAt: string | null;
  isSelf: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  id: string;
  workspaceId: string;
  fromContactId: string;
  toContactId: string;
  kind: Category;
  strength: number;
  /** What produced the edge: a source import, email co-occurrence, shared employer, or manual. */
  origin: 'linkedin' | 'facebook' | 'x' | 'contacts' | 'email' | 'employer' | 'manual';
  notes: string;
  createdAt: string;
}

export interface Interaction {
  id: string;
  workspaceId: string;
  contactId: string;
  channel: 'email' | 'meeting' | 'call' | 'message' | 'note';
  direction: 'inbound' | 'outbound' | 'mutual';
  subject: string;
  threadId: string | null;
  occurredAt: string;
}

export interface Tag {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

export type Provider =
  | 'linkedin'
  | 'facebook'
  | 'x'
  | 'google'
  | 'microsoft'
  | 'imap';

export interface IntegrationPublic {
  id: string;
  provider: Provider;
  label: string;
  /** Non-secret config (host, username, account id...) — secrets are never returned. */
  config: Record<string, string>;
  /** Which secret fields are set (true) but never their values. */
  secretsSet: Record<string, boolean>;
  status: 'configured' | 'syncing' | 'ok' | 'error';
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface ImportJob {
  id: string;
  workspaceId: string;
  source: Source;
  status: 'pending' | 'running' | 'done' | 'error';
  stats: ImportStats;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ImportStats {
  parsed: number;
  created: number;
  merged: number;
  skipped: number;
  relationships: number;
  interactions: number;
  warnings: string[];
}

/** A contact as produced by an importer, before it is reconciled with the database. */
export interface ImportedContact {
  source: Source;
  externalId?: string;
  handle?: string;
  url?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  emails?: string[];
  phones?: string[];
  company?: string;
  title?: string;
  location?: string;
  avatarUrl?: string;
  connectedAt?: string;
  /** Importer-suggested categories. */
  categories?: Category[];
  tags?: string[];
  notes?: string;
}

export interface ImportedInteraction {
  /** Emails of the other party on this message (not self). */
  participants: string[];
  participantNames: Record<string, string>;
  direction: 'inbound' | 'outbound';
  subject: string;
  threadId: string;
  occurredAt: string;
}

export interface ImportResult {
  contacts: ImportedContact[];
  interactions: ImportedInteraction[];
  warnings: string[];
}

/** Graph payload consumed by the visualizations. */
export interface GraphNode {
  id: string;
  name: string;
  company: string | null;
  categories: Category[];
  sources: Source[];
  strength: number;
  isSelf: boolean;
  avatarUrl: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: Category;
  strength: number;
  origin: Relationship['origin'];
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface Summary {
  contacts: number;
  relationships: number;
  interactions: number;
  byCategory: Record<Category, number>;
  bySource: Record<Source, number>;
  companies: { name: string; count: number }[];
  recentImports: ImportJob[];
}
