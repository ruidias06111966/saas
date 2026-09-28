import { useApp } from '../state/AppContext';
import { Button, Card, Icon, Modal, SectionTitle } from './ui';

// ---------------------------------------------------------------------------
// "Para isto você precisa de um plano ativo."
//
// A REGRA QUE ESTA TELA EXPLICA
//
//   Paga quem bate na porta dos outros. Quem abre a própria porta nunca paga.
//
// Publicar é de graça — o que você precisa e o que você oferece. Responder ao
// anúncio de outra pessoa é que exige plano. E quem publicou responde de graça
// dentro do próprio anúncio, sempre.
//
// ESTA TELA NÃO BLOQUEIA NADA
//
// Quem recusa é o banco: a policy de `propostas` e a de `connections`, mais o
// gatilho que devolve a mensagem em português (migração 022). Não há URL,
// JavaScript alterado ou chamada direta que passe por cima.
//
// O que esta tela faz é AVISAR ANTES — para a pessoa não escrever uma proposta
// inteira e levar um "não" no fim — e dizer para onde ir. Se um dia ela
// aparecer por engano para quem TEM plano, o envio funciona mesmo assim,
// porque quem decide está do outro lado.
//
// DUAS FORMAS, UMA MENSAGEM
//
//   <PlanoNecessario.Cartao>  ocupa o lugar do formulário, antes de escrever.
//   <PlanoNecessario.Janela>  abre quando a pessoa tenta mesmo assim.
//
// As duas leem o mesmo texto, do mesmo lugar: duas explicações parecidas para
// a mesma regra divergem, e a pessoa acaba lendo a errada.
// ---------------------------------------------------------------------------

/** O porquê, em uma frase, e o que continua de graça. */
const PORQUE = 'Publicar é de graça, sempre — o que você precisa e o que você oferece. O plano é para responder ao anúncio de outra pessoa.';

const TITULO = 'Plano necessário';

function Explicacao({ acao }: { acao: string }) {
  return (
    <>
      <p className="text-sm leading-relaxed">
        Para {acao} você precisa de um plano ativo.
      </p>
      <p className="text-[13px] leading-relaxed text-muted">{PORQUE}</p>
      <p className="text-[13px] leading-relaxed text-muted">
        E se alguém responder a um anúncio <strong className="text-ink">seu</strong>, responder
        de volta não custa nada.
      </p>
    </>
  );
}

/**
 * Ocupa o lugar do formulário. Melhor do que deixar escrever para bloquear
 * depois: ninguém gosta de perder o que escreveu.
 */
function Cartao({ acao }: { acao: string }) {
  const { navigate } = useApp();
  return (
    <Card className="space-y-3 p-5">
      <SectionTitle>{TITULO}</SectionTitle>
      <Explicacao acao={acao} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button icon="crown" onClick={() => navigate({ name: 'premium' })}>Ver planos</Button>
      </div>
    </Card>
  );
}

/** Abre quando a pessoa tenta a ação mesmo assim. */
function Janela({ aberta, acao, onFechar }: {
  aberta: boolean; acao: string; onFechar: () => void;
}) {
  const { navigate } = useApp();
  return (
    <Modal open={aberta} onClose={onFechar} title={TITULO}>
      <div className="space-y-3">
        <Explicacao acao={acao} />
        <div className="flex flex-wrap gap-2 pt-2">
          <Button icon="crown" onClick={() => { onFechar(); navigate({ name: 'premium' }); }}>
            Ver planos
          </Button>
          <Button variant="ghost" onClick={onFechar}>Continuar navegando</Button>
        </div>
      </div>
    </Modal>
  );
}

export const PlanoNecessario = { Cartao, Janela };

/** Um cadeado pequeno, para pôr ao lado de um botão que vai pedir plano. */
export function Cadeado() {
  return <Icon name="lock" size={13} />;
}
