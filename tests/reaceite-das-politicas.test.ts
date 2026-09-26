import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { POLICY_VERSION } from '../constants';
import type { Consent, User } from '../types';
import { SEED_USERS } from '../data/seed';
import {
  DOCUMENTOS, consentimentosAGravar, documentosPendentes, precisaReaceitar, versaoAceita,
} from '../services/politicas';

// ---------------------------------------------------------------------------
// Quem precisa reaceitar, e — mais importante — quem NÃO pode ser travado.
//
// Esta tela esconde o aplicativo inteiro. Um erro para o lado errado tranca a
// pessoa fora da própria conta por causa de um dado que não chegou, e ela não
// tem como nem reclamar, porque a tela de contato está atrás do bloqueio.
//
// Por isso metade destes testes é sobre não bloquear.
// ---------------------------------------------------------------------------

const em = (kind: string, version: string, acceptedAt = '2026-09-11T10:00:00.000Z'): Consent =>
  ({ kind, version, acceptedAt } as Consent);

const TODOS_NA_VIGENTE = DOCUMENTOS.map((d) => em(d, POLICY_VERSION));
const TODOS_NA_ANTIGA = DOCUMENTOS.map((d) => em(d, '2026.1'));

describe('quem precisa reaceitar', () => {
  it('quem aceitou a versão antiga precisa dos três', () => {
    expect(documentosPendentes(TODOS_NA_ANTIGA)).toEqual([...DOCUMENTOS]);
  });

  it('quem já está na versão vigente não precisa de nada', () => {
    expect(documentosPendentes(TODOS_NA_VIGENTE)).toEqual([]);
  });

  it('aceite parcial pede só o que falta', () => {
    const meio = [em('termos', POLICY_VERSION), em('privacidade', '2026.1'), em('diretrizes', '2026.1')];
    expect(documentosPendentes(meio)).toEqual(['privacidade', 'diretrizes']);
  });

  it('conta sem consentimento nenhum precisa dos três', () => {
    expect(documentosPendentes([])).toEqual([...DOCUMENTOS]);
  });

  it('a declaração de maioridade não entra na conta', () => {
    // É declaração de um FATO, não concordância com um texto. Repeti-la a cada
    // versão transformaria uma exigência séria em clique automático.
    expect(DOCUMENTOS).not.toContain('maioridade');
    const so_maioridade = [...TODOS_NA_VIGENTE, em('maioridade', '2026.1')];
    expect(documentosPendentes(so_maioridade)).toEqual([]);
  });
});

describe('quem NÃO pode ser travado', () => {
  it('consentimento que não chegou não bloqueia ninguém', () => {
    // `undefined` é "não sei", não é "não aceitou". Travar a conta de alguém
    // por um dado que falhou em carregar seria o pior resultado desta tela.
    expect(documentosPendentes(undefined)).toEqual([]);
    expect(precisaReaceitar({ consents: undefined } as unknown as User)).toBe(false);
  });

  it('ninguém deslogado é bloqueado', () => {
    expect(precisaReaceitar(null)).toBe(false);
  });

  it('versão mais NOVA que a vigente não bloqueia', () => {
    // Acontece se alguém voltar o código sem voltar o banco. Pedir para
    // reaceitar uma versão que a pessoa já passou seria pedir para trás.
    const futuro = DOCUMENTOS.map((d) => em(d, '2027.9'));
    expect(documentosPendentes(futuro, '2027.9')).toEqual([]);
  });
});

describe('o que é gravado ao aceitar', () => {
  it('grava só o que estava pendente', () => {
    const meio = [em('termos', POLICY_VERSION), em('privacidade', '2026.1'), em('diretrizes', '2026.1')];
    const novos = consentimentosAGravar(meio, '2026-09-26T12:00:00.000Z');
    expect(novos.map((c) => c.kind)).toEqual(['privacidade', 'diretrizes']);
  });

  it('não regrava o que já estava em dia', () => {
    // Regravar mudaria a DATA de um consentimento que não foi dado agora — e a
    // data é metade do valor do registro.
    expect(consentimentosAGravar(TODOS_NA_VIGENTE)).toEqual([]);
  });

  it('grava na versão vigente, com a data de agora', () => {
    const agora = '2026-09-26T12:00:00.000Z';
    for (const c of consentimentosAGravar(TODOS_NA_ANTIGA, agora)) {
      expect(c.version).toBe(POLICY_VERSION);
      expect(c.acceptedAt).toBe(agora);
    }
  });

  it('aceitar resolve o bloqueio', () => {
    // O ciclo fechado: quem estava pendente, grava, e deixa de estar.
    const depois = [...TODOS_NA_ANTIGA, ...consentimentosAGravar(TODOS_NA_ANTIGA)];
    expect(documentosPendentes(depois)).toEqual([]);
  });
});

describe('a tela consegue dizer o que a pessoa aceitou', () => {
  it('devolve a versão do aceite mais recente', () => {
    expect(versaoAceita(TODOS_NA_ANTIGA)).toBe('2026.1');
  });

  it('sem consentimento, não inventa versão', () => {
    expect(versaoAceita([])).toBeUndefined();
    expect(versaoAceita(undefined)).toBeUndefined();
  });

  it('ignora a maioridade ao dizer a versão', () => {
    expect(versaoAceita([em('maioridade', '2019.0')])).toBeUndefined();
  });
});

describe('o bloqueio tem saída', () => {
  it('a tela oferece sair, baixar os dados e excluir a conta — nela mesma', async () => {
    // Consentimento obtido sem saída é consentimento coagido, e a LGPD exige
    // que seja livre (art. 8º, §3º). As três ações têm de estar NESTA tela:
    // mandar para Configurações seria uma saída que não abre, porque o
    // bloqueio esconde Configurações.
    const fonte = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../screens/ReaceitarPoliticas.tsx', import.meta.url), 'utf8'));

    expect(fonte).toMatch(/onClick=\{\(\) => void logout\(\)\}/);
    expect(fonte).toContain('exportUserData');
    expect(fonte).toContain('deleteAccount');
    expect(fonte).not.toMatch(/navigate\(\{ name: 'settings' \}\)/);
  });

  it('o bloqueio vem antes do AppShell, senão dá para ignorar', async () => {
    const app = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../App.tsx', import.meta.url), 'utf8'));
    const iBloqueio = app.indexOf('precisaReaceitar(me)');
    const iShell = app.indexOf('<AppShell>');
    expect(iBloqueio, 'App.tsx não chama precisaReaceitar').toBeGreaterThan(-1);
    expect(iBloqueio).toBeLessThan(iShell);
  });
});

describe('o bloqueio não pode disparar para quem acabou de entrar', () => {
  // ESTE TESTE NASCEU DE UM SUSTO.
  //
  // O seed de demonstração gravava `termos`, `privacidade` e `maioridade` — e
  // esquecia `diretrizes`. Ninguém percebeu enquanto nada dependia disso. Com o
  // bloqueio no ar, TODO usuário de demonstração cairia nele; e como
  // `saveConsents` exige servidor, o aceite lançaria "Supabase não
  // configurado" e a tela nunca sairia do caminho. O modo demonstração ficaria
  // inteiramente inacessível.
  //
  // Não apareceu em teste nenhum. Apareceu quando o app foi aberto num
  // navegador de verdade — que é o mesmo remédio das quebras 014, 015 e 019.

  it.each(SEED_USERS.map((u) => [u.name, u] as const))(
    '%s entra direto, sem cair no reaceite',
    (_nome, user) => {
      expect(documentosPendentes(user.consents)).toEqual([]);
    },
  );

  it('o seed grava os MESMOS consentimentos que o cadastro real', () => {
    // Se o cadastro passar a registrar um documento novo e o seed não, a
    // demonstração quebra de novo — do mesmo jeito e pelo mesmo motivo.
    const signup = readFileSync(
      new URL('../screens/Signup.tsx', import.meta.url), 'utf8');
    const seed = readFileSync(
      new URL('../data/seed.ts', import.meta.url), 'utf8');

    const tipos = (fonte: string) =>
      new Set([...fonte.matchAll(/\{ kind: '(\w+)', version: POLICY_VERSION/g)].map((m) => m[1]));

    expect(tipos(seed)).toEqual(tipos(signup));
  });

  it('aceitar funciona sem servidor', () => {
    // Em modo demonstração não há backend. Se a tela chamasse `saveConsents`
    // direto, o aceite falharia e o bloqueio viraria uma porta trancada.
    const fonte = readFileSync(
      new URL('../screens/ReaceitarPoliticas.tsx', import.meta.url), 'utf8');
    expect(fonte).toContain('supabaseEnabled');
    expect(fonte).toMatch(/if \(supabaseEnabled\)/);
    expect(fonte).toContain("type: 'UPDATE_USER'");
  });

  it('em modo online, grava ANTES de tirar a tela do caminho', () => {
    // Ordem invertida deixaria a pessoa achando que aceitou sem registro
    // nenhum no banco.
    const fonte = readFileSync(
      new URL('../screens/ReaceitarPoliticas.tsx', import.meta.url), 'utf8');
    const iGrava = fonte.indexOf('await backend.saveConsents');
    const iRecarrega = fonte.indexOf('await refresh()');
    expect(iGrava).toBeGreaterThan(-1);
    expect(iGrava).toBeLessThan(iRecarrega);
  });
});

describe('gravar consentimento não pode quebrar na segunda vez', () => {
  // MEDIDO CONTRA O BANCO DE PRODUÇÃO, não deduzido:
  //
  //     versão nova (sem conflito) ...... funcionava
  //     versão já aceita (com conflito) . RECUSADA, 42501
  //
  // `consents` tem política de INSERT e não tem de UPDATE. O `upsert` era
  // `on conflict do UPDATE`, e o ramo do conflito batia no RLS.
  //
  // A tela de reaceite nunca chega lá, porque só envia o que está pendente. O
  // CADASTRO chega: `Signup` grava os quatro de uma vez, e tem dois caminhos
  // que podem rodar isso duas vezes para a mesma conta — a retomada
  // automática e o botão de concluir. Na segunda vez o cadastro morria com a
  // conta já criada e o perfil pela metade.

  const backend = readFileSync(
    new URL('../services/backend.ts', import.meta.url), 'utf8');
  const saveConsents = backend.slice(
    backend.indexOf('export async function saveConsents'),
    backend.indexOf('export async function saveConnection'));

  it('grava ignorando o que já existe, em vez de sobrescrever', () => {
    expect(saveConsents).toContain('ignoreDuplicates: true');
  });

  it('continua declarando a chave do conflito', () => {
    // Sem `onConflict` o PostgREST usa a chave primária (`id`), que é sempre
    // nova — e aí cada tentativa criaria uma linha duplicada em vez de não
    // fazer nada.
    expect(saveConsents).toContain("onConflict: 'user_id,kind,version'");
  });

  it('o cadastro grava os consentimentos por esta função', () => {
    // Se algum dia o Signup passar a gravar direto, sai de baixo desta
    // proteção sem ninguém perceber.
    const signup = readFileSync(
      new URL('../screens/Signup.tsx', import.meta.url), 'utf8');
    expect(signup).toContain('backend.saveConsents');
    expect(signup).not.toMatch(/from\('consents'\)/);
  });
});
