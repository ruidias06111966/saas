import type { AppState } from '../state/appState';
import type { User } from '../types';

// ---------------------------------------------------------------------------
// LGPD — direitos do titular implementados desde o MVP (Lei 13.709/2018).
// Art. 18: acesso, portabilidade, correção, eliminação e revogação de consento.
// ---------------------------------------------------------------------------

/** Art. 18, II e V — acesso e portabilidade dos dados em formato legível. */
export function exportUserData(state: AppState, userId: string) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return null;
  const conns = state.connections.filter((c) => c.userA === userId || c.userB === userId);
  const connIds = new Set(conns.map((c) => c.id));
  return {
    exportadoEm: new Date().toISOString(),
    baseLegal: 'Art. 18, incisos II e V da Lei 13.709/2018 (LGPD)',
    perfil: { ...user, passwordHash: '[não exportado por segurança]' },
    consentimentos: user.consents,
    conexoes: conns,
    mensagens: state.messages.filter((m) => connIds.has(m.connectionId)),
    denunciasFeitas: state.reports.filter((r) => r.reporterId === userId),
    notificacoes: state.notifications.filter((n) => n.userId === userId),
    bloqueios: state.blocks.filter((b) => b.blockerId === userId),
  };
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Art. 18, VI — eliminação. Apagamos o titular e o conteúdo que ele produziu.
 * O que não pode sumir (denúncias feitas CONTRA ele) é anonimizado, porque a
 * base legal ali é o legítimo interesse de proteger outras pessoas.
 */
export function anonymizeUser(user: User): User {
  return {
    ...user,
    name: 'Conta removida',
    email: `removido+${user.id}@conexao.local`,
    passwordHash: '',
    photo: undefined,
    extraPhotos: [],
    bio: '',
    profession: '',
    interests: [],
    answers: [],
    city: '—',
    state: '—',
    approxLat: 0,
    approxLng: 0,
    status: 'banido',
  };
}

export const RETENTION_NOTE =
  'Mensagens são mantidas enquanto a conexão existir. Ao excluir a conta, seu perfil e suas mensagens são removidos em até 30 dias; registros de denúncias feitas contra você são mantidos de forma anonimizada para proteção de outras pessoas.';
