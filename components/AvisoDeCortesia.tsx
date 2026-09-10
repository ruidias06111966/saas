import { useApp } from '../state/AppContext';
import { Banner } from './ui';

// ---------------------------------------------------------------------------
// "Você ganhou o Premium."
//
// A promoção de lançamento dá 60 dias de Premium a quem chega cedo, e é
// concedida no banco, no momento do cadastro (migração 005). Sem este aviso a
// pessoa recebe o benefício e não fica sabendo: entraria no app com mais
// alcance e mais ferramentas achando que o app é assim mesmo, e no dia 61
// sentiria uma perda que nunca foi apresentada como ganho.
//
// Aparece apenas enquanto a cortesia está valendo, e some sozinho quando ela
// expira — o que é decidido pela data que veio do servidor, não por contagem
// no navegador.
// ---------------------------------------------------------------------------

/** Dias inteiros que faltam. Zero quando termina hoje; negativo já expirou. */
function diasAte(iso: string): number {
  const fim = new Date(iso);
  const hoje = new Date();
  // Compara datas do calendário, não instantes: faltando 30 horas ainda são
  // "2 dias" para quem lê, e não 1,25.
  const dia = 86400000;
  return Math.ceil((fim.getTime() - hoje.getTime()) / dia);
}

const formata = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });

export function AvisoDeCortesia({ compacto = false }: { compacto?: boolean }) {
  const { me, state } = useApp();
  if (!me) return null;

  const cortesia = state.subscriptions.find(
    (s) => s.userId === me.id && s.provider === 'cortesia' && s.status === 'ativa',
  );
  if (!cortesia?.expiresAt) return null;

  const dias = diasAte(cortesia.expiresAt);
  if (dias < 0) return null;

  // Nos últimos dez dias o tom muda: deixa de ser novidade e passa a ser
  // lembrete. Antes disso, insistir seria cobrança disfarçada de aviso.
  const acabando = dias <= 10;

  return (
    <Banner
      tone={acabando ? 'warn' : 'ok'}
      icon={acabando ? 'clock' : 'sparkle'}
      title={acabando
        ? dias === 0 ? 'Seu Premium de cortesia termina hoje' : `Seu Premium de cortesia termina em ${dias} dia${dias === 1 ? '' : 's'}`
        : 'Você tem o Premium de graça'}
    >
      {acabando ? (
        <>
          Depois de {formata(cortesia.expiresAt)} sua conta volta ao plano gratuito.
          Nada do que você escreveu se perde — as conversas, as conexões e o
          perfil continuam seus.
        </>
      ) : (
        <>
          Por ter chegado no lançamento, você ganhou <strong>60 dias de Premium</strong>,
          sem pagar nada e sem cartão. Vale até <strong>{formata(cortesia.expiresAt)}</strong>.
          {!compacto && ' Mais alcance na curadoria, filtros avançados e o Copiloto liberado.'}
        </>
      )}
    </Banner>
  );
}
