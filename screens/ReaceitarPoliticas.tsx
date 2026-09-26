import { useState } from 'react';
import { APP_NAME, POLICY_VERSION, URL_DIRETRIZES, URL_PRIVACIDADE, URL_TERMOS } from '../constants';
import { useApp } from '../state/AppContext';
import { Banner, Button, Card, Checkbox, Icon, Modal } from '../components/ui';
import { downloadJson, exportUserData } from '../services/lgpd';
import * as backend from '../services/backend';
import { supabaseEnabled } from '../services/supabaseClient';
import {
  NOME_DO_DOCUMENTO, consentimentosAGravar, documentosPendentes, versaoAceita,
} from '../services/politicas';

// ---------------------------------------------------------------------------
// "As regras mudaram. Você aceita as novas?"
//
// Em 26/09/2026 os três documentos foram reescritos de ponta a ponta, porque o
// produto deixou de ser um aplicativo de relacionamentos. Quem tinha aceitado a
// versão anterior concordou com outra coisa — inclusive com uma política de
// privacidade que listava dados que o sistema não coleta mais.
//
// Esta tela existe para não fingir que aquele consentimento ainda vale.
//
// TRÊS DECISÕES, E O PORQUÊ DE CADA UMA
//
// 1. BLOQUEIA o aplicativo, em vez de ser um aviso que dá para ignorar. Um
//    pedido de consentimento que a pessoa pode fechar e seguir usando não é
//    pedido de consentimento: é enfeite jurídico.
//
// 2. NÃO PRENDE NINGUÉM. Tem saída em toda tela: sair da conta, baixar os
//    dados e excluir a conta. Bloquear sem saída seria coagir o consentimento,
//    que é justamente o que a LGPD não aceita (art. 8º, §3º — consentimento
//    tem de ser livre).
//
// 3. São TRÊS caixas, não uma. Cada documento é um consentimento próprio, com
//    o seu link ao lado. Uma caixa só para os três seria mais rápido e diria
//    menos sobre o que a pessoa leu.
//
// O que já está na versão vigente não é regravado — ver `consentimentosAGravar`.
// ---------------------------------------------------------------------------

const LINK: Record<string, string> = {
  termos: URL_TERMOS,
  privacidade: URL_PRIVACIDADE,
  diretrizes: URL_DIRETRIZES,
};

export function ReaceitarPoliticas() {
  const { me, state, dispatch, refresh, logout, deleteAccount, toast } = useApp();
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [gravando, setGravando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  if (!me) return null;
  const pendentes = documentosPendentes(me.consents);
  const antiga = versaoAceita(me.consents);
  const faltaAlgum = pendentes.some((d) => !marcados[d]);

  const aceitar = async () => {
    if (faltaAlgum) return;
    setGravando(true);
    try {
      const novos = consentimentosAGravar(me.consents);
      if (supabaseEnabled) {
        // GRAVA PRIMEIRO, recarrega depois. Se mexêssemos no estado local
        // antes, uma falha na gravação tiraria a tela do caminho sem o
        // registro ter entrado — a pessoa acharia que aceitou, e não haveria
        // prova nenhuma disso.
        await backend.saveConsents(me.id, novos);
        await refresh();
      } else {
        // Modo demonstração não tem servidor. `saveConsents` lançaria
        // "Supabase não configurado", a tela nunca sairia do caminho, e o
        // aplicativo inteiro ficaria inacessível — que é o que acontecia
        // antes desta linha existir.
        dispatch({
          type: 'UPDATE_USER', id: me.id,
          patch: { consents: [...(me.consents ?? []), ...novos] },
        });
      }
      toast('Obrigado. Registramos o seu aceite da versão ' + POLICY_VERSION + '.', 'ok');
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg px-5 py-10">
      <div className="mx-auto max-w-xl">
        <p className="font-display text-xl font-bold tracking-tight">{APP_NAME}</p>

        <Card className="mt-6 space-y-5 p-6">
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">
              As regras mudaram. Dá uma olhada?
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              O QICONEXÃO deixou de ser um aplicativo de relacionamentos e virou um mercado de
              serviços profissionais. Os três documentos foram reescritos por causa disso — não é
              ajuste de vírgula.
            </p>
          </div>

          <Banner tone="info" icon="info">
            <span className="font-semibold">O que mudou de verdade:</span> a política de privacidade
            listava dados que o sistema não guarda mais (data de nascimento, gênero, interesses,
            preferências) — todos apagados do banco. Entrou o que passou a existir: telefone, áreas
            de atuação, anúncios e propostas. E a regra de que o seu contato só aparece depois de
            uma proposta aceita.
          </Banner>

          <p className="text-sm text-muted">
            {antiga && antiga !== POLICY_VERSION
              ? <>Você aceitou a versão <span className="font-semibold text-ink">{antiga}</span>. A vigente é a <span className="font-semibold text-ink">{POLICY_VERSION}</span>.</>
              : <>A versão vigente é a <span className="font-semibold text-ink">{POLICY_VERSION}</span>.</>}
          </p>

          <div className="rounded-2xl bg-bg p-4">
            {pendentes.map((doc) => (
              <Checkbox
                key={doc}
                checked={!!marcados[doc]}
                onChange={(v) => setMarcados((m) => ({ ...m, [doc]: v }))}
              >
                Li e aceito{' '}
                <a
                  href={LINK[doc]} target="_blank" rel="noopener noreferrer"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  {NOME_DO_DOCUMENTO[doc]}
                </a>{' '}
                na versão {POLICY_VERSION}.
              </Checkbox>
            ))}
          </div>

          <Button full icon="check" onClick={() => void aceitar()} loading={gravando} disabled={faltaAlgum}>
            Aceitar e continuar
          </Button>

          {/* A saída. Sem ela isto seria consentimento sob coação, e a LGPD
              exige que o consentimento seja livre. */}
          <div className="border-t border-line pt-4">
            <p className="text-xs leading-relaxed text-muted">
              Não quer aceitar? Tudo bem — mas sem isso não dá para continuar usando, porque
              seria usar o serviço sob regras que você não aceitou. Você pode sair agora e
              decidir depois, ou levar seus dados e encerrar a conta.
            </p>
            {/* As ações ficam AQUI, não em Configurações: esta tela esconde o
                resto do aplicativo, então um botão que levasse para lá seria
                uma saída que não abre. */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon="logout" onClick={() => void logout()}>
                Sair da conta
              </Button>
              <Button
                size="sm" variant="ghost" icon="download"
                onClick={() => {
                  const dados = exportUserData(state, me.id);
                  if (dados) {
                    downloadJson(`conexao-meus-dados-${me.id}.json`, dados);
                    toast('Arquivo gerado. Verifique seus downloads.', 'ok');
                  }
                }}
              >
                Baixar meus dados
              </Button>
              <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirmarExclusao(true)}>
                Excluir minha conta
              </Button>
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-muted">
          <Icon name="lock" size={12} /> Nada foi feito com os seus dados enquanto isso. Eles
          continuam exatamente como estavam.
        </p>
      </div>

      <Modal
        open={confirmarExclusao} onClose={() => setConfirmarExclusao(false)}
        title="Excluir minha conta"
      >
        <p className="text-sm leading-relaxed text-muted">
          Suas mensagens, conversas e notificações são apagadas, e o seu perfil é anonimizado.
          Não dá para desfazer. Se ainda não baixou seus dados, feche isto e baixe antes.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="danger" icon="trash" onClick={() => void deleteAccount()}>
            Excluir definitivamente
          </Button>
          <Button variant="ghost" onClick={() => setConfirmarExclusao(false)}>Cancelar</Button>
        </div>
      </Modal>
    </div>
  );
}
