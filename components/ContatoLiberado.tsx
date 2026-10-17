import { useEffect, useState } from 'react';
import { contatoDoNegocio } from '../services/backend';
import { Banner } from './ui';

// ---------------------------------------------------------------------------
// O TELEFONE DO OUTRO LADO, DEPOIS DO ACEITE
//
// O DEFEITO QUE ISTO CONSERTA
//
// O sistema prometia isto em quatro lugares — na página inicial ("Combinado
// fechado, os telefones dos dois lados são liberados"), no cadastro, no aviso
// da tela Início ("O telefone dos dois lados já foi liberado") e na lista do
// que o plano pago inclui ("Ver o telefone do outro lado quando uma proposta é
// aceita").
//
// E não entregava. A função `contato_do_negocio` existia no banco, a função
// `contatoDoNegocio` existia em services/backend.ts — e NENHUMA TELA a
// chamava. Encontrado a contar quem usa cada coisa exportada: ela aparecia uma
// vez só em todo o projeto, na linha onde é declarada.
//
// Não dava erro em lugar nenhum. A pessoa aceitava a proposta, lia que o
// telefone fora liberado, e não havia lugar nenhum onde ele estivesse.
//
// POR QUE É UM COMPONENTE, E NÃO O MESMO CÓDIGO NAS DUAS TELAS
//
// São dois lados do mesmo acordo, e os dois têm direito ao mesmo: quem propôs
// vê o telefone de quem publicou, e quem publicou vê o de quem propôs. Duas
// cópias disto divergiriam — e divergir aqui significa um dos lados ficar sem
// o contato, calado, que é exactamente o defeito que acabou de ser consertado.
//
// QUEM DECIDE SE RESPONDE É O BANCO
//
// Este componente não confere nada: pede, e mostra o que vier. A função do
// banco (`contato_do_negocio`, migração 012) só devolve linha quando a
// proposta está ACEITA e quem pergunta é uma das duas partes. Pedir numa
// proposta ainda não aceita devolve vazio — e aqui isso vira silêncio, não
// erro. É de propósito: a regra mora num lugar só, e esse lugar é o banco.
//
// O TELEFONE PODE NÃO EXISTIR
//
// `telefone` é opcional no cadastro. Quando a pessoa não cadastrou nenhum, a
// promessa não pode ser cumprida — e aí o que este componente faz é DIZER
// isso, em vez de mostrar um espaço vazio que parece defeito. Ver o último
// ramo do `return`.
// ---------------------------------------------------------------------------

type Contato = { pessoaId: string; nome: string; telefone?: string };
type Estado =
  | { fase: 'carregando' }
  | { fase: 'pronto'; contato: Contato }
  | { fase: 'nada' };

/** Só dígitos, para o link `tel:` — que não aceita parêntese nem traço. */
const soDigitos = (t: string) => t.replace(/\D/g, '');

export function ContatoLiberado({ propostaId }: { propostaId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: 'carregando' });
    contatoDoNegocio(propostaId)
      .then((c) => { if (vivo) setEstado(c ? { fase: 'pronto', contato: c } : { fase: 'nada' }); })
      // Falha de rede não pode derrubar a tela da proposta: o acordo continua
      // valendo, e a pessoa ainda tem a conversa para combinar o resto.
      .catch(() => { if (vivo) setEstado({ fase: 'nada' }); });
    return () => { vivo = false; };
  }, [propostaId]);

  if (estado.fase === 'carregando') {
    return (
      <Banner tone="ok" icon="handshake" title="Contato liberado">
        <span className="text-muted">Buscando o telefone…</span>
      </Banner>
    );
  }

  // Proposta ainda não aceita, ou quem pergunta não é parte do acordo. O banco
  // decidiu que não há o que mostrar, e calar é a resposta certa.
  if (estado.fase === 'nada') return null;

  const { nome, telefone } = estado.contato;

  if (!telefone) {
    return (
      <Banner tone="warn" icon="info" title="Sem telefone cadastrado">
        <strong>{nome}</strong> não cadastrou telefone. Combine por aqui mesmo, pela conversa.
      </Banner>
    );
  }

  return (
    <Banner tone="ok" icon="handshake" title="Contato liberado">
      <p>
        <strong>{nome}</strong> —{' '}
        <a
          href={`tel:${soDigitos(telefone)}`}
          className="font-semibold text-brand underline underline-offset-2"
        >
          {telefone}
        </a>
      </p>
      <p className="mt-1 text-[12px] text-muted">
        Toque no número para ligar. Ele só apareceu porque a proposta foi aceita.
      </p>
    </Banner>
  );
}
