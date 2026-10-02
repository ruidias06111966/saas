import React, { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import { Button, CampoDeSenha, Field } from '../components/ui';
import { erroDoLink, redefinirSenha, signOut } from '../services/auth';
import { RECADO_NAO_CONSEGUI, conferirSenha, recadoDaSenhaVazada } from '../services/senhaVazada';

// ---------------------------------------------------------------------------
// "Esqueci minha senha" — a nova senha.
//
// Chegar aqui significa que o link funcionou: o Supabase já criou uma sessão de
// recuperação. É por isso que a tela não pede a senha antiga — quem tem o link
// do e-mail já provou ter acesso à caixa.
//
// Ao terminar, a sessão é encerrada de propósito. A pessoa entra de novo com a
// senha que acabou de criar, o que confirma para ela que deu certo e derruba
// qualquer outra sessão que estivesse aberta com a senha antiga.
// ---------------------------------------------------------------------------

const MINIMO = 8;

export function RedefinirSenha() {
  const { navigate, toast } = useApp();
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [erro, setErro] = useState('');
  // Aviso não é erro: ele aparece quando a conferência de vazamento não rodou, e
  // NÃO impede de salvar. Separado do `erro` justamente para não bloquear.
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [linkQuebrado, setLinkQuebrado] = useState<string | null>(null);

  useEffect(() => {
    setLinkQuebrado(erroDoLink());
  }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (senha.length < MINIMO) return setErro(`Use pelo menos ${MINIMO} caracteres.`);
    if (senha !== senha2) return setErro('As duas senhas não conferem.');

    setOcupado(true);
    setAviso('');
    try {
      // A senha é conferida contra a lista de vazamentos ANTES de ser gravada.
      // Depois de gravada não haveria o que fazer: a pessoa sairia daqui com uma
      // senha que qualquer lista de ataque já tem.
      const veredito = await conferirSenha(senha);
      if (veredito.tipo === 'vazada') {
        setErro(recadoDaSenhaVazada(veredito.vezes));
        return;
      }
      if (veredito.tipo === 'nao-consegui') setAviso(RECADO_NAO_CONSEGUI);

      await redefinirSenha(senha);
      // Sai da sessão de recuperação para entrar com a senha nova.
      await signOut();
      toast('Senha alterada. Entre com a senha nova.', 'ok');
      navigate({ name: 'login' });
    } catch (err) {
      const msg = (err as Error).message;
      // Sem sessão de recuperação, o Supabase recusa — e o motivo real é
      // quase sempre o link, não a senha.
      setErro(
        /session|sessão|missing|jwt/i.test(msg)
          ? 'A sessão de recuperação expirou. Peça um link novo.'
          : msg,
      );
    } finally {
      setOcupado(false);
    }
  };

  if (linkQuebrado) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-2xl font-bold leading-snug">Este link não serve mais</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{linkQuebrado}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={() => navigate({ name: 'recuperarSenha' })}>Pedir um link novo</Button>
          <Button variant="outline" onClick={() => navigate({ name: 'login' })}>Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-2xl font-bold">Crie uma senha nova</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Mínimo de {MINIMO} caracteres. Conferimos também se a senha já apareceu em vazamentos
        de outros sites — sem que ela saia do seu aparelho. Depois de salvar, você entra de novo
        com ela.
      </p>

      <form onSubmit={salvar} className="mt-7 space-y-4">
        <Field label="Nova senha" required error={erro}>
          <CampoDeSenha
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        <Field label="Confirmar a nova senha" required hint={aviso || undefined}>
          <CampoDeSenha
            value={senha2}
            onChange={(e) => setSenha2(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" full loading={ocupado}>Salvar e entrar</Button>
      </form>
    </div>
  );
}
