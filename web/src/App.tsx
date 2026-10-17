import { useEffect, useState, type ReactNode } from 'react';
import { RouterProvider, Link, matchPath, useRouter } from './lib/router.tsx';
import { SessionProvider, ThemeProvider, ToastProvider, useOnline, useSession, useTheme, useToast, initials } from './lib/store.tsx';
import { Icon, type IconName } from './ui/Icon.tsx';
import { Button, Fab, IconButton, Loading, Menu } from './ui/components.tsx';
import { AuthPage } from './pages/Auth.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { NetworkPage } from './pages/Network.tsx';
import { PeoplePage } from './pages/People.tsx';
import { ContactPage } from './pages/Contact.tsx';
import { ImportPage } from './pages/Import.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { TrainingPage } from './pages/Training.tsx';
import { InvitePage } from './pages/Invite.tsx';

declare const __APP_VERSION__: string;

export function App() {
  return (
    <RouterProvider>
      <ThemeProvider>
        <ToastProvider>
          <SessionProvider>
            <Root />
          </SessionProvider>
        </ToastProvider>
      </ThemeProvider>
    </RouterProvider>
  );
}

const NAV: { to: string; icon: IconName; label: string; match: string[] }[] = [
  { to: '/', icon: 'dashboard', label: 'Home', match: ['/'] },
  { to: '/network', icon: 'hub', label: 'Network', match: ['/network'] },
  { to: '/people', icon: 'people', label: 'People', match: ['/people', '/people/:id'] },
  { to: '/import', icon: 'cloudUpload', label: 'Import', match: ['/import'] },
  { to: '/training', icon: 'school', label: 'Learn', match: ['/training', '/training/:id'] },
  { to: '/settings', icon: 'settings', label: 'Settings', match: ['/settings', '/settings/:tab'] },
];

function Root() {
  const { user, loading } = useSession();
  const { path } = useRouter();
  if (loading) return <Loading label="Starting up…" />;
  if (matchPath('/invite/:token', path)) return <InvitePage />;
  if (!user) return <AuthPage />;
  return <Shell />;
}

function Shell() {
  const { path, navigate } = useRouter();
  const { user, workspace, workspaces, selectWorkspace, logout } = useSession();
  const { toast, dismiss } = useToast();
  const online = useOnline();
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw?.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
      });
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!workspace) return <Loading label="Loading workspace…" />;

  let page: ReactNode;
  let params: Record<string, string> | null;
  if (path === '/' || path === '') page = <DashboardPage />;
  else if (path.startsWith('/network')) page = <NetworkPage />;
  else if ((params = matchPath('/people/:id', path))) page = <ContactPage id={params.id} />;
  else if (path.startsWith('/people')) page = <PeoplePage />;
  else if (path.startsWith('/import')) page = <ImportPage />;
  else if ((params = matchPath('/training/:id', path))) page = <TrainingPage id={params.id} />;
  else if (path.startsWith('/training')) page = <TrainingPage />;
  else if ((params = matchPath('/settings/:tab', path))) page = <SettingsPage tab={params.tab} />;
  else if (path.startsWith('/settings')) page = <SettingsPage />;
  else page = <NotFound />;

  const navItems = NAV.map((n) => {
    const current = n.match.some((m) => matchPath(m, path) !== null);
    return (
      <Link key={n.to} to={n.to} className="rail__item" aria-current={current ? 'page' : undefined} data-testid={`nav-${n.label.toLowerCase()}`}>
        <span className="rail__icon">
          <Icon name={n.icon} />
        </span>
        <span className="label-md">{n.label}</span>
      </Link>
    );
  });

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <Menu
          placement="right"
          trigger={(open) => (
            <IconButton icon="menu" label="Workspaces" onClick={open} data-testid="workspace-menu" />
          )}
          items={[
            ...workspaces.map((w) => ({ label: `${w.id === workspace.id ? '✓ ' : ''}${w.name}`, icon: 'groups' as IconName, onClick: () => selectWorkspace(w.id) })),
            { label: 'New workspace…', icon: 'add', onClick: () => navigate('/settings/workspace?new=1') },
          ]}
        />
        <div className="rail__fab">
          <Fab icon="cloudUpload" label="Import" onClick={() => navigate('/import')} data-testid="rail-fab-import" />
        </div>
        {navItems}
        <div className="rail__spacer" />
        <Menu
          placement="top-right"
          trigger={(open) => (
            <button type="button" className="rail__avatar" onClick={open} aria-label="Account" data-testid="account-menu">
              {initials(user?.name ?? '')}
            </button>
          )}
          items={[
            { label: user?.email ?? '', icon: 'person', onClick: () => navigate('/settings/profile') },
            ...(installPrompt ? [{ label: 'Install app', icon: 'installDesktop' as IconName, onClick: () => installPrompt.prompt() }] : []),
            { label: 'Sign out', icon: 'logout', onClick: () => void logout() },
          ]}
        />
      </nav>
      <div className="main">
        {!online ? (
          <div className="banner" style={{ borderRadius: 0 }}>
            <Icon name="wifiOff" />
            You're offline. You can keep browsing what's cached; changes will fail until you're back online.
          </div>
        ) : null}
        {updateReady ? (
          <div className="banner banner--tertiary" style={{ borderRadius: 0 }}>
            <Icon name="sync" />
            <span style={{ flex: 1 }}>A new version is ready.</span>
            <Button variant="text" onClick={() => navigator.serviceWorker.getRegistration().then((r) => r?.waiting?.postMessage('SKIP_WAITING')).then(() => location.reload())}>
              Reload
            </Button>
          </div>
        ) : null}
        {page}
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {navItems.slice(0, 5)}
      </nav>
      {toast ? (
        <div className="snackbar" role="status" data-testid="snackbar">
          <span style={{ flex: 1 }}>{toast.message}</span>
          {toast.action ? (
            <Button variant="text" onClick={() => (toast.action!.onClick(), dismiss())}>
              {toast.action.label}
            </Button>
          ) : null}
          <IconButton icon="close" label="Dismiss" onClick={dismiss} />
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  const { navigate } = useRouter();
  return (
    <header className="topbar">
      {back ? <IconButton icon="back" label="Back" onClick={() => navigate(back)} /> : null}
      <div className="topbar__title">
        <h1 className="headline-md truncate" data-testid="page-title">
          {title}
        </h1>
        {subtitle ? <div className="body-md muted truncate">{subtitle}</div> : null}
      </div>
      {actions ? <div className="topbar__actions">{actions}</div> : null}
    </header>
  );
}

export function ThemeToggle() {
  const { dark, setMode } = useTheme();
  return <IconButton icon={dark ? 'light' : 'dark'} label={dark ? 'Light theme' : 'Dark theme'} onClick={() => setMode(dark ? 'light' : 'dark')} data-testid="theme-toggle" />;
}

function NotFound() {
  return (
    <>
      <TopBar title="Not found" />
      <div className="page">
        <p className="body-lg">That page doesn't exist.</p>
        <Link to="/" className="btn btn--tonal">
          Go home
        </Link>
      </div>
    </>
  );
}

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
