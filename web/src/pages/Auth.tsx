import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useSession } from '../lib/store.tsx';
import { useRouter } from '../lib/router.tsx';
import { Banner, Button, TextField } from '../ui/components.tsx';
import { ThemeToggle } from '../App.tsx';

export function AuthPage({ invite }: { invite?: { token: string; email: string; workspaceName: string } }) {
  const { setSession } = useSession();
  const { navigate } = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>(invite ? 'register' : 'login');
  const [email, setEmail] = useState(invite?.email ?? '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = mode === 'login' ? await api.auth.login(email, password) : await api.auth.register(email, name, password);
      if (invite) {
        try {
          await api.workspaces.acceptInvite(invite.token);
          const me = await api.auth.me();
          setSession(me.user, me.workspaces);
          navigate('/', { replace: true });
          return;
        } catch {
          /* invite may already be consumed */
        }
      }
      setSession(res.user, res.workspaces);
      if (location.pathname !== '/') navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth__card pop-in" onSubmit={submit} data-testid="auth-form">
        <div className="row row--between">
          <img className="auth__logo" src="/icons/icon.svg" alt="" />
          <ThemeToggle />
        </div>
        <div>
          <h1 className="headline-md">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="body-md muted">
            {invite ? (
              <>
                You've been invited to <strong>{invite.workspaceName}</strong>.
              </>
            ) : (
              'All your relationships — personal, business, corporate and social — in one place.'
            )}
          </p>
        </div>
        {error ? <Banner kind="error" icon="error">{error}</Banner> : null}
        {mode === 'register' ? <TextField label="Your name" value={name} onChange={setName} required autoFocus name="name" testId="auth-name" /> : null}
        <TextField label="Email" type="email" value={email} onChange={setEmail} required autoFocus={mode === 'login'} name="email" testId="auth-email" disabled={!!invite} />
        <TextField label="Password" type="password" value={password} onChange={setPassword} required name="password" help={mode === 'register' ? 'At least 8 characters' : undefined} testId="auth-password" />
        <Button type="submit" size="lg" disabled={busy} data-testid="auth-submit">
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="body-md muted">{mode === 'login' ? 'New here?' : 'Already have an account?'}</span>
          <Button variant="text" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} data-testid="auth-switch">
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}
