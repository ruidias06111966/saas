// O backend da demonstração pública — build `npm run build:demo`. Tudo vem do original
// (services/backend.ts); só o contato liberado muda, porque no app de verdade ele vem do banco.
import { DEMO_USER_ID, SEED_USERS } from '../data/seed';
import { partesDaPropostaAceita } from './mercado-demo';

export * from '../services/backend';

/**
 * O telefone do outro lado de uma proposta aceita. Nenhum perfil fictício tem telefone, e
 * inventar um número poderia ser o de alguém de verdade: o DDD 00 não existe.
 */
export async function contatoDoNegocio(
  propostaId: string,
): Promise<{ pessoaId: string; nome: string; telefone?: string } | null> {
  const partes = partesDaPropostaAceita(propostaId);
  if (!partes) return null;
  const outro = partes.autorId === DEMO_USER_ID ? partes.profissionalId : partes.autorId;
  const pessoa = SEED_USERS.find((u) => u.id === outro);
  return pessoa ? { pessoaId: pessoa.id, nome: pessoa.name, telefone: '(00) 00000-0000' } : null;
}
