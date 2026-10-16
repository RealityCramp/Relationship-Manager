import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { matchPath, useRouter } from '../lib/router.tsx';
import { useSession } from '../lib/store.tsx';
import { Banner, Button, Loading } from '../ui/components.tsx';
import { AuthPage } from './Auth.tsx';

/** /invite/:token — accepts a workspace invitation (signs the person up first if needed). */
export function InvitePage() {
  const { path, navigate } = useRouter();
  const { user, refresh } = useSession();
  const token = matchPath('/invite/:token', path)!.token;
  const [info, setInfo] = useState<{ email: string; role: string; workspaceName: string; accepted: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.workspaces
      .invitePreview(token)
      .then(setInfo)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="auth">
        <div className="auth__card">
          <Banner kind="error" icon="error">{error}</Banner>
          <Button onClick={() => navigate('/')}>Go to the app</Button>
        </div>
      </div>
    );
  }
  if (!info) return <Loading label="Checking invitation…" />;
  if (!user) return <AuthPage invite={{ token, email: info.email, workspaceName: info.workspaceName }} />;

  const accept = async () => {
    try {
      const ws = await api.workspaces.acceptInvite(token);
      await refresh();
      localStorage.setItem('rm.workspace', ws.id);
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 600);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card pop-in" data-testid="invite-card">
        <h1 className="headline-md">Join {info.workspaceName}</h1>
        <p className="body-md muted">
          You've been invited as <strong>{info.role}</strong>. You're signed in as {user.email}.
        </p>
        {done ? <Banner icon="checkCircle">You're in! Taking you to the workspace…</Banner> : null}
        <div className="row row--end">
          <Button variant="text" onClick={() => navigate('/')}>
            Not now
          </Button>
          <Button onClick={accept} data-testid="invite-accept">
            Accept invitation
          </Button>
        </div>
      </div>
    </div>
  );
}
