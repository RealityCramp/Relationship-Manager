import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** A very small history-based router: enough for a handful of app routes without a dependency. */

interface RouterState {
  path: string;
  search: URLSearchParams;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterState>({ path: '/', search: new URLSearchParams(), navigate: () => undefined });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: new URLSearchParams(location.search) }));
  useEffect(() => {
    const onPop = () => setLoc({ path: location.pathname, search: new URLSearchParams(location.search) });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = (to: string, opts: { replace?: boolean } = {}) => {
    if (opts.replace) history.replaceState(null, '', to);
    else history.pushState(null, '', to);
    setLoc({ path: location.pathname, search: new URLSearchParams(location.search) });
    window.scrollTo(0, 0);
  };
  return <RouterContext.Provider value={{ ...loc, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  return useContext(RouterContext);
}

/** Matches "/contacts/:id" style patterns. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, children, className, replace, ...rest }: { to: string; children: ReactNode; className?: string; replace?: boolean; [k: string]: unknown }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      {...rest}
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to, { replace });
      }}
    >
      {children}
    </a>
  );
}
