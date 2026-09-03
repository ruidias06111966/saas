import React, { useState } from 'react';
import { useApp } from '../state/AppContext';
import { Button, Field, Input } from '../components/ui';
import { pedirRedefinicao } from '../services/auth';
import { supabaseEnabled } from '../services/supabaseClient';
import { isEmail } from '../services/utils';

// ---------------------------------------------------------------------------
// "Esqueci minha senha" — pedido.
//
// A tela responde SEMPRE a mesma coisa, exista a conta ou não. Dizer "e-mail não
// encontrado" transformaria esta página num oráculo: qualquer pessoa poderia
// testar endereços e descobrir quem tem conta num aplicativo de
// relacionamentos. É pouco visível e é sério.
// ---------------------------------------------------------------------------

export function RecuperarSenha() {
  const { navigate } = useApp();
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!isEmail(email)) return setErro('Confira o endereço de e-mail.');

    setOcupado(true);
    try {
      await pedirRedefinicao(email);
      setEnviado(true);
    } catch (err) {
      // Só chega aqui erro de infraestrutura — limite de envio, rede. Conta
      // inexistente não produz erro, de propósito.
      setErro((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  if (!supabaseEnabled) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-2xl font-bold">Recuperar senha</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          No modo demonstração não há servidor de e-mail, e as contas são
          fictícias. A senha de todas elas aparece na tela de entrada.
        </p>
        <Button className="mt-6" variant="outline" onClick={() => navigate({ name: 'login' })}>
          Voltar
        </Button>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-2xl font-bold leading-snug">
          Se existir uma conta com esse e-mail, o link já saiu.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Confira a caixa de entrada de <strong className="text-ink">{email}</strong>, e o
          spam também. O link vale por pouco tempo — é o que impede que sirva
          para outra pessoa depois.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Não chegou nada em alguns minutos? Pode ser que essa conta não exista.
          Não dizemos qual dos dois é o caso, e isso é proposital: protege quem
          tem conta aqui.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={() => navigate({ name: 'login' })}>Voltar para a entrada</Button>
          <Button variant="outline" onClick={() => { setEnviado(false); setErro(''); }}>
            Tentar outro e-mail
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <button
        type="button"
        onClick={() => navigate({ name: 'login' })}
        className="mb-8 flex items-center gap-2 text-sm text-muted hover:text-ink"
      >
        ← Voltar
      </button>

      <h1 className="font-display text-2xl font-bold">Esqueceu a senha?</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Informe o e-mail da conta. Mandamos um link para você criar uma senha nova.
      </p>

      <form onSubmit={enviar} className="mt-7 space-y-4">
        <Field label="E-mail" required error={erro}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </Field>
        <Button type="submit" full loading={ocupado}>Enviar o link</Button>
      </form>
    </div>
  );
}
