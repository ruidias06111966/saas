import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { QUOTAS } from '../constants';

// ---------------------------------------------------------------------------
// O portão está no banco, e a tela só avisa.
//
// Substitui `cota-de-propostas.test.ts`, que guardava um número — três
// propostas por mês — que a migração 022 apagou. Não é o mesmo teste com
// valores novos: a REGRA mudou de forma.
//
//   ANTES  quantas propostas sobram este mês?
//   AGORA  tem plano ativo? (e, para conversar, a pessoa já veio até mim?)
//
// A REGRA, NAS PALAVRAS DE QUEM A DEFINIU
//
//   "quem publica não paga, para responder ao que publica também não precisa
//    pagar (...) só paga para responder a anúncios que não foi ele que
//    publicou"
//
// Em uma linha: PAGA QUEM BATE NA PORTA DOS OUTROS.
//
// O QUE ESTES TESTES GUARDAM
//
//   1. O PORTÃO NO LUGAR CERTO. Em `propostas` e `connections`, sim. Em
//      `messages` e no ACEITE, não — cobrar ali quebraria a regra inteira e
//      deixaria conversas mudas no meio.
//
//   2. UMA FONTE DA VERDADE. A tela pergunta pela MESMA função que a policy
//      chama. Uma segunda implementação divergiria, como divergiram a 014, a
//      015 e a 019.
//
//   3. A TELA NÃO DECIDE. `expressInterest` grava na memória antes de falar
//      com o servidor. Sem perguntar antes, quem não tem plano veria "Pedido
//      enviado" enquanto o banco recusa em silêncio.
//
// O QUE NÃO PROVAM
//
// Não enviam proposta nenhuma. A prova de que o portão fecha foi feita contra
// a produção, numa transação abortada, entrando como usuário `authenticated`
// de verdade. Verificar o código não é verificar o app.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

const migracoes = readdirSync(join(RAIZ, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql')).sort()
  .map((f) => ({ nome: f, sql: readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8') }));
const todoSql = migracoes.map((m) => m.sql).join('\n');
const sql022 = migracoes.find((m) => m.nome.startsWith('022'))!.sql;

describe('a regra mora no banco, num lugar só', () => {
  it('existe a função que diz se alguém tem plano', () => {
    expect(sql022).toMatch(/create or replace function private\.tem_plano_ativo\(quem uuid\)/);
  });

  it('ela olha a ASSINATURA, não o espelho em users.plan', () => {
    // `users.plan` é mantido pelo webhook, e espelho atrasa. O que vale é a
    // assinatura, com a data.
    const corpo = sql022.slice(sql022.indexOf('function private.tem_plano_ativo'));
    const ate = corpo.slice(0, corpo.indexOf('$f$;', corpo.indexOf('$f$') + 3));
    expect(ate).toContain('public.subscriptions');
    expect(ate).toMatch(/status\s*=\s*'ativa'/);
    expect(ate).toMatch(/expires_at is null or s\.expires_at > now\(\)/);
    expect(ate).not.toContain('users');
  });

  it('a exceção existe: quem já veio até mim não me custa nada', () => {
    expect(sql022).toMatch(/create or replace function private\.veio_ate_mim/);
    const corpo = sql022.slice(sql022.indexOf('function private.veio_ate_mim'));
    const ate = corpo.slice(0, corpo.indexOf('$f$;', corpo.indexOf('$f$') + 3));
    expect(ate).toContain('public.propostas');
    expect(ate).toMatch(/a\.autor_id = eu/);
    expect(ate).toMatch(/p\.profissional_id = outro/);
  });

  it('a regra de conversar é plano OU já-veio-até-mim', () => {
    const corpo = sql022.slice(sql022.indexOf('function private.pode_iniciar_conversa'));
    const ate = corpo.slice(0, corpo.indexOf('$f$;', corpo.indexOf('$f$') + 3));
    expect(ate).toMatch(/tem_plano_ativo\(eu\)\s+or\s+private\.veio_ate_mim\(eu, outro\)/);
  });
});

describe('o portão fica onde deve, e só lá', () => {
  /**
   * Recorta UMA policy, do `create policy` ao `);` que a fecha.
   *
   * A primeira versão deste teste usava `/create policy "..."[\s\S]*?X/` — e
   * PASSOU com o portão removido, porque o `[\s\S]*?` varre o arquivo inteiro
   * e encontrou `X` mais adiante, no gatilho. É a quinta vez nesta base que
   * uma busca acha fora do lugar o que devia achar dentro.
   */
  const policy = (nome: string): string => {
    const abre = sql022.indexOf(`create policy "${nome}"`);
    expect(abre, `não achei a policy "${nome}"`).toBeGreaterThan(-1);
    const fecha = sql022.indexOf(');', abre);
    expect(fecha, `não achei o fim da policy "${nome}"`).toBeGreaterThan(abre);
    return sql022.slice(abre, fecha + 2);
  };

  it('responder a anúncio alheio exige plano — DENTRO da própria policy', () => {
    expect(policy('responder a anúncio alheio exige plano ativo')).toContain('tem_plano_ativo');
  });

  it('a condição antiga não foi trocada, foi somada', () => {
    // Ela é que garante que ninguém propõe no próprio anúncio, que o anúncio
    // está aberto e que não venceu. Perdê-la abriria três buracos de uma vez.
    const ate = policy('responder a anúncio alheio exige plano ativo');
    expect(ate).toContain("a.status = 'aberto'");
    expect(ate).toContain('a.expires_at > now()');
    expect(ate).toMatch(/a\.autor_id <> \(select auth\.uid\(\)\)/);
  });

  it('bater na porta exige plano, com a exceção — DENTRO da própria policy', () => {
    expect(policy('quem bate na porta paga; quem já foi procurado não'))
      .toContain('pode_iniciar_conversa');
  });

  it('MENSAGEM EM CONVERSA ABERTA NÃO PAGA', () => {
    // Cobrar aqui deixaria conversas mudas no meio — inclusive as de quem
    // pagou e cujo plano venceu depois. E impediria quem publicou de
    // responder, que é o coração da regra.
    expect(sql022).not.toMatch(/policy[^;]*on public\.messages/);
    expect(sql022).toMatch(/if n <> 0 then raise exception 'mensagens/);
  });

  it('ACEITAR UMA PROPOSTA NÃO PAGA', () => {
    // É o anúncio do dono. Cobrar aqui quebraria a regra inteira.
    expect(sql022).not.toMatch(/create policy[^;]*on public\.propostas for update/);
    expect(sql022).toMatch(/if n <> 0 then raise exception 'aceitar uma proposta/);
  });

  it('a migração se verifica em vez de supor', () => {
    expect(sql022).toContain('raise exception');
    expect(sql022).toMatch(/pg_policies/);
  });
});

describe('a tela pergunta o MESMO que o portão responde', () => {
  const mercado = ler('services/mercado.ts');

  it('a pergunta sobre plano vai ao RPC, não a uma conta local', () => {
    expect(mercado).toMatch(/rpc\('meu_plano_esta_ativo'\)/);
  });

  it('a pergunta sobre conversar vai ao RPC que inclui a exceção', () => {
    // Perguntar só "tem plano?" erraria com quem já veio até mim.
    expect(mercado).toMatch(/rpc\('posso_conversar_com'/);
  });

  it('os dois RPC devolvem a função do portão, sem reimplementar nada', () => {
    const sql = todoSql;
    expect(sql).toMatch(/function public\.meu_plano_esta_ativo[\s\S]*?private\.tem_plano_ativo/);
    expect(sql).toMatch(/function public\.posso_conversar_com[\s\S]*?private\.pode_iniciar_conversa/);
  });

  it('em caso de falha de rede a tela NÃO inventa um bloqueio', () => {
    // Um erro de rede não pode fabricar um "não" que o banco não daria.
    for (const fn of ['temPlanoAtivo', 'possoConversarCom']) {
      const corpo = mercado.slice(
        mercado.indexOf(`export async function ${fn}`),
        mercado.indexOf('\n}', mercado.indexOf(`export async function ${fn}`)),
      );
      expect(corpo, `${fn} devia devolver true em caso de erro`).toMatch(/if \(error[^)]*\) return true;/);
    }
  });

  it('a cota antiga não é mais CHAMADA em lugar nenhum', () => {
    // O comentário pode citar o nome velho — ele explica o que substituiu.
    // O que não pode é a função existir, ou o RPC ser chamado.
    expect(mercado).not.toMatch(/export async function propostasRestantes/);
    expect(mercado).not.toMatch(/rpc\('propostas_restantes'\)/);
    for (const arq of ['screens/Anuncio.tsx', 'screens/Premium.tsx', 'screens/Settings.tsx']) {
      expect(ler(arq), `${arq} ainda usa a cota antiga`).not.toContain('propostasRestantes');
      expect(ler(arq), `${arq} ainda usa a cota antiga`).not.toContain('propostasPorMes');
    }
  });
});

describe('a tela não decide sozinha o que só o servidor decide', () => {
  it('pedir conversa PERGUNTA antes de gravar na memória', () => {
    // `expressInterest` grava local primeiro. Sem a pergunta, quem não tem
    // plano veria "Pedido enviado" e o banco recusaria em silêncio.
    const tela = ler('screens/PersonProfile.tsx');
    const corpo = tela.slice(tela.indexOf('const pedirConversa'));
    const ate = corpo.slice(0, corpo.indexOf('\n  };'));
    const pergunta = ate.indexOf('possoConversarCom');
    const grava = ate.indexOf('expressInterest');
    expect(pergunta, 'não achei a pergunta ao servidor').toBeGreaterThan(-1);
    expect(grava, 'não achei a gravação local').toBeGreaterThan(-1);
    expect(pergunta, 'a pergunta tem de vir ANTES da gravação').toBeLessThan(grava);
  });

  it('o formulário da proposta só bloqueia depois de SABER', () => {
    // `null` = ainda não perguntamos. Bloquear antes de saber assustaria quem
    // tem plano — e este aviso existe para poupar trabalho, não para criar susto.
    const tela = ler('screens/Anuncio.tsx');
    expect(tela).toMatch(/if \(temPlano === false\)/);
  });
});

describe('os planos do código dizem a regra nova', () => {
  it('sem plano não responde; com plano responde', () => {
    expect(QUOTAS.free.podeResponder).toBe(false);
    expect(QUOTAS.premium.podeResponder).toBe(true);
  });

  it('a cota mensal não existe mais como ideia', () => {
    expect(Object.keys(QUOTAS.free)).not.toContain('propostasPorMes');
    expect(Object.keys(QUOTAS.premium)).not.toContain('propostasPorMes');
  });

  it('publicar não tem cota nenhuma, em plano nenhum', () => {
    // Cobra-se do lado abundante. Se alguém acrescentar uma cota de anúncios,
    // este teste obriga a pensar duas vezes.
    expect(Object.keys(QUOTAS.free)).not.toContain('anunciosPorMes');
    // O portão é sobre RESPONDER. Se um dia aparecer uma policy que exija
    // plano para PUBLICAR, este teste cai.
    expect(sql022).not.toMatch(/policy[\s\S]{0,200}on public\.anuncios/);
    expect(sql022).toMatch(/on public\.propostas for insert/);
  });

  it('o gatilho velho da cota foi removido, não só desligado', () => {
    expect(sql022).toContain('drop trigger if exists cota_de_propostas on public.propostas');
    expect(sql022).toContain('drop function if exists private.cota_de_propostas()');
  });
});
