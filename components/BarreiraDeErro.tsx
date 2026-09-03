import * as Sentry from '@sentry/react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// A tela que aparece quando o app quebra.
//
// Antes disto, um erro de renderização deixava a página BRANCA: sem mensagem,
// sem botão, sem nada. A pessoa não tem como saber se o problema é a internet
// dela, o celular ou o app — e nós não ficávamos sabendo de nada.
//
// A barreira faz duas coisas, e a segunda importa tanto quanto a primeira:
// mostra uma saída para quem está do outro lado, e manda o erro para o registro.
// ---------------------------------------------------------------------------

function Escombros({ resetError }: { resetError: () => void }) {
  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="font-display text-2xl font-bold leading-snug">
          Alguma coisa quebrou aqui do nosso lado.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Não foi a sua internet e não foi o seu celular — o erro é nosso, e já
          fomos avisados. Suas conversas e seu perfil estão salvos no servidor,
          nada se perdeu.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={resetError}
            className="rounded-xl2 bg-brand px-5 py-3 text-sm font-semibold text-white shadow-soft
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-brand"
          >
            Tentar de novo
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl2 border border-line px-5 py-3 text-sm font-semibold
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-brand"
          >
            Recarregar a página
          </button>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          Se continuar acontecendo, recarregar costuma resolver — e se não
          resolver, o problema já está na nossa fila.
        </p>
      </div>
    </div>
  );
}

/**
 * "Tentar de novo" refaz a árvore sem recarregar, o que basta quando a quebra
 * veio de um estado momentâneo. Quando não basta, o segundo botão existe.
 */
export function BarreiraDeErro({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <Escombros resetError={resetError} />}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
