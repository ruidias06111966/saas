import { useState } from 'react';
import { useApp } from '../state/AppContext';
import { blockedIdsFor, findUser } from '../state/appState';
import { downloadJson, exportUserData, RETENTION_NOTE } from '../services/lgpd';
import { clearState } from '../services/storage';
import { aiEnabled } from '../services/geminiService';
import { POLICY_VERSION } from '../constants';
import { Page } from '../components/layout/AppShell';
import { Banner, Button, Card, Chip, Icon, Input, Modal, SectionTitle, Toggle } from '../components/ui';
import { firstName } from '../services/utils';

export function Settings() {
  const { me, state, dispatch, back, toast, navigate } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [dark, setDark] = useState(state.theme === 'dark');

  if (!me) return null;
  const blocked = Array.from(blockedIdsFor(state, me.id))
    .map((id) => findUser(state, id))
    .filter((u): u is NonNullable<typeof u> => !!u && state.blocks.some((b) => b.blockerId === me.id && b.blockedId === u.id));

  return (
    <Page title="Configurações e privacidade" back={back}>
      <div className="space-y-6">
        <Card className="p-5">
          <SectionTitle>Aparência</SectionTitle>
          <Toggle
            checked={dark} label="Modo escuro"
            description="A interface segue sua escolha em qualquer dispositivo deste navegador."
            onChange={(v) => { setDark(v); dispatch({ type: 'SET_THEME', theme: v ? 'dark' : 'light' }); }}
          />
        </Card>

        <Card className="p-5">
          <SectionTitle hint="O que outras pessoas conseguem ver sobre você.">Privacidade</SectionTitle>
          <div className="space-y-2 text-[13px] leading-relaxed">
            {[
              ['Seu e-mail', 'Nunca é exibido. Serve só para login e avisos.'],
              ['Sua localização', `Guardamos apenas a cidade (${me.city}) e uma coordenada arredondada em cerca de 5 km. Outras pessoas veem só uma faixa de distância, tipo "até 30 km".`],
              ['Sua foto', 'Entra velada na descoberta e se revela conforme suas conversas evoluem, ou quando os dois concordam em revelar antes.'],
              ['Suas mensagens', 'Só você e a outra pessoa leem. Mensagens sinalizadas pela moderação podem ser lidas por um moderador humano durante a análise.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl bg-bg p-3.5">
                <p className="font-semibold">{t}</p>
                <p className="mt-0.5 text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle hint="Lei 13.709/2018 — Lei Geral de Proteção de Dados.">Seus direitos (LGPD)</SectionTitle>
          <div className="space-y-2">
            <Button
              variant="outline" icon="download" full
              onClick={() => {
                const data = exportUserData(state, me.id);
                if (data) { downloadJson(`conexao-meus-dados-${me.id}.json`, data); toast('Arquivo gerado. Verifique seus downloads.', 'ok'); }
              }}
            >
              Exportar todos os meus dados (JSON)
            </Button>
            <Button variant="outline" icon="edit" full onClick={() => navigate({ name: 'profileEdit' })}>
              Corrigir meus dados
            </Button>
            <Button variant="danger" icon="trash" full onClick={() => setConfirmDelete(true)}>
              Excluir minha conta
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{RETENTION_NOTE}</p>

          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Consentimentos registrados</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {me.consents.map((c) => (
                <Chip key={c.kind} size="sm" tone="sage">
                  {c.kind} v{c.version} · {new Date(c.acceptedAt).toLocaleDateString('pt-BR')}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">Versão vigente das políticas: {POLICY_VERSION}</p>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle hint={`${blocked.length} pessoa(s)`}>Bloqueios</SectionTitle>
          {blocked.length === 0 ? (
            <p className="text-[13px] text-muted">Você não bloqueou ninguém.</p>
          ) : (
            <div className="space-y-2">
              {blocked.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-2xl bg-bg p-3">
                  <span className="text-sm font-medium">{firstName(u.name)}</span>
                  <Button size="sm" variant="ghost" onClick={() => { dispatch({ type: 'UNBLOCK', blockerId: me.id, blockedId: u.id }); toast('Bloqueio removido.', 'info'); }}>
                    Desbloquear
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Copiloto de conversa</SectionTitle>
          <Banner tone={aiEnabled ? 'ok' : 'info'} icon="sparkle" title={aiEnabled ? 'Gemini conectado' : 'Modo local'}>
            {aiEnabled
              ? 'As sugestões são geradas pelo Gemini. Nenhum dado sensível (e-mail, senha, coordenada) é enviado — só o que já é público no perfil.'
              : 'Sem GEMINI_API_KEY configurada, as sugestões vêm de um banco curado local. O app funciona igual.'}
          </Banner>
          <ul className="mt-3 space-y-1.5 text-[13px] text-muted">
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-sage" />A IA nunca envia mensagem no seu lugar.</li>
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-sage" />A IA nunca se passa por você.</li>
            <li className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-sage" />Nenhuma suspensão é decidida por algoritmo sem revisão humana.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle hint="Ferramentas desta demonstração.">Demonstração</SectionTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline" size="sm" icon="refresh"
              onClick={() => { clearState(); dispatch({ type: 'RESET_DEMO' }); toast('Dados de demonstração restaurados.', 'ok'); }}
            >
              Restaurar dados fictícios
            </Button>
            <Button variant="ghost" size="sm" icon="logout" onClick={() => dispatch({ type: 'LOGOUT' })}>Sair da conta</Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Este MVP guarda tudo no localStorage do seu navegador. Nada é enviado para servidor algum,
            exceto as chamadas ao Gemini quando você pede uma sugestão e há chave configurada.
          </p>
        </Card>
      </div>

      <Modal
        open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Excluir minha conta"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button
              variant="danger" disabled={confirmText.trim().toUpperCase() !== 'EXCLUIR'}
              onClick={() => { dispatch({ type: 'DELETE_ACCOUNT', userId: me.id }); toast('Conta excluída. Seus dados foram removidos.', 'ok'); }}
            >
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <Banner tone="danger" icon="info" title="Esta ação não pode ser desfeita">
          Seu perfil, suas conexões e suas mensagens são apagados. Denúncias feitas contra você
          permanecem de forma anonimizada, para proteção de outras pessoas — é o que a LGPD permite
          e o que a segurança da plataforma exige.
        </Banner>
        <label className="mt-4 block text-[13px] font-semibold">Digite EXCLUIR para confirmar</label>
        <Input className="mt-1.5" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="EXCLUIR" />
      </Modal>
    </Page>
  );
}
