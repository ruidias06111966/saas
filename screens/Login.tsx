import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Banner, Button, Card, Field, Icon, Input } from '../components/ui';
import { DEMO_ADMIN_ID, DEMO_PASSWORD, DEMO_USER_ID } from '../data/seed';
import { isEmail, sha256 } from '../services/utils';
import { signIn } from '../services/auth';
import { supabaseEnabled } from '../services/supabaseClient';

export function Login() {
  const { state, dispatch, navigate, toast } = useApp();
  const [email, setEmail] = useState(supabaseEnabled ? '' : 'joao@conexao.app');
  const [password, setPassword] = useState(supabaseEnabled ? '' : DEMO_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isEmail(email)) return setError('E-mail inválido.');
    setBusy(true);

    // Modo online: a senha nunca é comparada aqui. Vai para o Supabase Auth,
    // que faz bcrypt no servidor e devolve um JWT de curta duração.
    if (supabaseEnabled) {
      try {
        await signIn(email, password);
        // A sessão dispara onAuthChange, que hidrata o estado a partir do banco.
        toast('Bem-vindo de volta.', 'ok');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    const user = state.users.find((u) => (u.email ?? '').toLowerCase() === email.trim().toLowerCase());
    const hash = await sha256(password);
    setBusy(false);
    if (!user || user.passwordHash !== hash) return setError('E-mail ou senha incorretos.');
    if (user.status === 'banido') return setError('Esta conta está suspensa. Fale com o suporte.');
    dispatch({ type: 'LOGIN', userId: user.id });
    toast(`Bem-vindo de volta, ${user.name.split(' ')[0]}.`, 'ok');
  };

  const quick = (id: string) => {
    dispatch({ type: 'LOGIN', userId: id });
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-10">
      <button type="button" onClick={() => navigate({ name: 'landing' })} className="mb-8 flex items-center gap-2 text-sm text-muted">
        <Icon name="back" size={16} /> Voltar
      </button>

      <h1 className="font-display text-3xl font-bold tracking-tight">Entrar</h1>
      <p className="mt-2 text-sm text-muted">Que bom te ver de novo.</p>

      <Card className="mt-6 p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="voce@email.com" />
          </Field>
          <Field label="Senha" required error={error}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          <Button type="submit" full loading={busy}>Entrar</Button>
        </form>

        <p className="mt-4 text-center text-[13px]">
          <button
            type="button"
            className="text-muted hover:text-ink hover:underline"
            onClick={() => navigate({ name: 'recuperarSenha' })}
          >
            Esqueci minha senha
          </button>
        </p>

        <p className="mt-2 text-center text-[13px] text-muted">
          Não tem conta?{' '}
          <button type="button" className="font-semibold text-brand hover:underline" onClick={() => navigate({ name: 'signup' })}>
            Criar agora
          </button>
        </p>
      </Card>

      {supabaseEnabled ? (
        <div className="mt-6">
          <Banner tone="ok" icon="shield" title="Modo online">
            Este aplicativo está conectado a um banco real. Sua senha é verificada pelo
            Supabase Auth e suas conversas ficam protegidas por Row Level Security.
          </Banner>
        </div>
      ) : (
        <div className="mt-6">
          <Banner tone="info" icon="info" title="Contas de demonstração">
            Todas as contas fictícias usam a senha <code className="font-mono">{DEMO_PASSWORD}</code>.
          </Banner>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="sm" onClick={() => quick(DEMO_USER_ID)}>Entrar como João (usuário)</Button>
            <Button variant="outline" size="sm" onClick={() => quick(DEMO_ADMIN_ID)}>Entrar como administrador</Button>
          </div>
        </div>
      )}
    </div>
  );
}
