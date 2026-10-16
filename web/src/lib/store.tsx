import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User, Workspace } from '@shared/types.ts';
import { api, ApiError } from './api.ts';
import { applyTheme } from '../theme/color.ts';

/* ---------- session & workspace ---------- */

interface Session {
  user: User | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  loading: boolean;
  setSession: (user: User | null, workspaces: Workspace[]) => void;
  selectWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session>(null as never);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => localStorage.getItem('rm.workspace'));
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((u: User | null, w: Workspace[]) => {
    setUser(u);
    setWorkspaces(w);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setSession(me.user, me.workspaces);
    } catch (e) {
      if (e instanceof ApiError && e.offline) {
        // keep whatever we had
      } else setSession(null, []);
    } finally {
      setLoading(false);
    }
  }, [setSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const workspace = useMemo(() => workspaces.find((w) => w.id === workspaceId) ?? workspaces[0] ?? null, [workspaces, workspaceId]);
  useEffect(() => {
    if (workspace) localStorage.setItem('rm.workspace', workspace.id);
  }, [workspace]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setSession(null, []);
  }, [setSession]);

  return <SessionContext.Provider value={{ user, workspaces, workspace, loading, setSession, selectWorkspace: setWorkspaceId, refresh, logout }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** The active workspace — only valid inside the signed-in app shell. */
export function useWorkspace(): Workspace {
  const { workspace } = useSession();
  if (!workspace) throw new Error('No workspace');
  return workspace;
}

/* ---------- theme ---------- */

interface ThemeState {
  seed: string;
  mode: 'light' | 'dark' | 'system';
  dark: boolean;
  setSeed: (s: string) => void;
  setMode: (m: 'light' | 'dark' | 'system') => void;
}

const ThemeContext = createContext<ThemeState>(null as never);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [seed, setSeedState] = useState(() => localStorage.getItem('rm.seed') ?? '#0b57d0');
  const [mode, setModeState] = useState<'light' | 'dark' | 'system'>(() => (localStorage.getItem('rm.mode') as 'light' | 'dark' | 'system') ?? 'system');
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = mode === 'system' ? systemDark : mode === 'dark';
  useEffect(() => applyTheme(seed, dark), [seed, dark]);
  const setSeed = (s: string) => {
    localStorage.setItem('rm.seed', s);
    setSeedState(s);
  };
  const setMode = (m: 'light' | 'dark' | 'system') => {
    localStorage.setItem('rm.mode', m);
    setModeState(m);
  };
  return <ThemeContext.Provider value={{ seed, mode, dark, setSeed, setMode }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/* ---------- snackbar ---------- */

interface Toast {
  message: string;
  action?: { label: string; onClick: () => void };
}
interface ToastState {
  toast: Toast | null;
  show: (message: string, action?: Toast['action']) => void;
  dismiss: () => void;
}
const ToastContext = createContext<ToastState>(null as never);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const show = useCallback((message: string, action?: Toast['action']) => setToast({ message, action }), []);
  return <ToastContext.Provider value={{ toast, show, dismiss: () => setToast(null) }}>{children}</ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);

/* ---------- async data hook ---------- */

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void; setData: (d: T | null) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

/* ---------- misc ---------- */

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
