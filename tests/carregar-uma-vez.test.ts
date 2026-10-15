import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { criarCarregadorUnico } from '../services/carregarUmaVez';

// ---------------------------------------------------------------------------
// O CARREGAMENTO EM TRIPLICADO
//
// Medido no servidor, no cadastro do dono em 13/10/2026:
//
//   23:09:20   carregamento completo  ×3   (ao confirmar o e-mail)
//   23:13:04   carregamento completo
//   23:13:06   carregamento completo       (ao entrar)
//
// Doze pedidos cada um. Trinta e seis num segundo onde doze bastavam. Para quem
// usava, a tela a piscar e a recarregar sozinha.
//
// (A primeira versão deste comentário culpava as rajadas por processos mortos
// no PostgREST. Não era verdade — eles aparecem com o sistema parado, às três
// da manhã, sem ninguém a usar. O porquê está escrito em
// services/carregarUmaVez.ts, com as contagens.)
//
// ESTES TESTES CORREM O CARREGADOR DE VERDADE — contam chamadas, não procuram
// palavras no código. É a diferença entre provar que não repete e acreditar.
// ---------------------------------------------------------------------------

/** Um carregamento falso que conta quantas vezes foi chamado e quando acaba. */
function espiao() {
  const chamadas: string[] = [];
  let soltar: Array<() => void> = [];
  const carga = (userId: string) => {
    chamadas.push(userId);
    return new Promise<void>((ok) => { soltar.push(ok); });
  };
  return {
    carga,
    get vezes() { return chamadas.length; },
    get quem() { return chamadas; },
    /** Deixa terminar tudo o que está a caminho. */
    async terminar() {
      const agora = soltar; soltar = [];
      agora.forEach((ok) => ok());
      await Promise.resolve(); await Promise.resolve();
    },
  };
}

describe('carregar uma vez só', () => {
  // O CASO EXACTO DO DEFEITO: três eventos no mesmo instante.
  it('três pedidos no mesmo instante carregam UMA vez', async () => {
    const e = espiao();
    const c = criarCarregadorUnico(e.carga);

    const a = c.carregar('rui');
    const b = c.carregar('rui');
    const d = c.carregar('rui');

    expect(e.vezes, 'carregou mais do que uma vez no mesmo instante').toBe(1);
    await e.terminar();
    await Promise.all([a, b, d]);
    expect(e.vezes).toBe(1);
  });

  it('e quem esperou por qualquer um deles espera pelo mesmo', async () => {
    const e = espiao();
    const c = criarCarregadorUnico(e.carga);
    const a = c.carregar('rui');
    const b = c.carregar('rui');
    expect(b, 'devolveu outra promessa — quem esperou por `b` esperaria por nada').toBe(a);
    await e.terminar();
    await Promise.all([a, b]);
  });

  // O SEGUNDO E O TERCEIRO CARREGAMENTO MEDIDOS ESTAVAM A DOIS SEGUNDOS DE
  // DISTÂNCIA. Um guarda que só olhasse "está a caminho?" não os apanharia.
  it('um pedido DEPOIS de terminar também não recarrega', async () => {
    const e = espiao();
    const c = criarCarregadorUnico(e.carga);
    // Começa, deixa terminar, e SÓ ENTÃO espera. Esperar antes de soltar
    // prenderia o teste para sempre — foi o que aconteceu na primeira versão.
    const primeiro = c.carregar('rui');
    await e.terminar();
    await primeiro;
    expect(e.vezes).toBe(1);

    await c.carregar('rui');
    expect(e.vezes, 'recarregou depois de já ter carregado').toBe(1);
  });

  // A REGRESSÃO QUE DEIXARIA O APLICATIVO VAZIO PARA SEMPRE.
  it('se falhar, o pedido seguinte TENTA outra vez', async () => {
    let tentativas = 0;
    const c = criarCarregadorUnico(async () => {
      tentativas += 1;
      if (tentativas === 1) throw new Error('rede caiu');
    });

    await expect(c.carregar('rui')).rejects.toThrow('rede caiu');
    expect(c.quemEstaCarregado(), 'marcou como carregado uma carga que falhou').toBeNull();

    await c.carregar('rui');
    expect(tentativas, 'desistiu depois de uma falha').toBe(2);
    expect(c.quemEstaCarregado()).toBe('rui');
  });

  // A REGRESSÃO DA TELA VAZIA AO TROCAR DE CONTA NO MESMO SEPARADOR.
  it('outra pessoa carrega, mesmo que a anterior já estivesse carregada', async () => {
    const e = espiao();
    const c = criarCarregadorUnico(e.carga);
    const a = c.carregar('rui'); await e.terminar(); await a;

    const b = c.carregar('joseleida'); await e.terminar(); await b;
    expect(e.quem, 'tratou outra pessoa como se já estivesse carregada')
      .toEqual(['rui', 'joseleida']);
  });

  it('sair esquece — senão quem entrar a seguir vê a tela vazia', async () => {
    const e = espiao();
    const c = criarCarregadorUnico(e.carga);
    const a = c.carregar('rui'); await e.terminar(); await a;
    expect(c.quemEstaCarregado()).toBe('rui');

    c.esquecer();
    expect(c.quemEstaCarregado()).toBeNull();

    const b = c.carregar('rui'); await e.terminar(); await b;
    expect(e.vezes, 'depois de sair e voltar a entrar, não recarregou').toBe(2);
  });

  // O BURACO QUE UMA REGRESSÃO FORÇADA DESTAPOU NESTES PRÓPRIOS TESTES.
  //
  // Troquei `if (emCurso?.promessa === promessa) emCurso = null` por um
  // `emCurso = null` seco, à espera de ver um teste cair. Nenhum caiu — e o
  // defeito era real:
  //
  //   1. A entra, a carga de A começa e fica a caminho
  //   2. B entra antes de A acabar; a carga de B começa
  //   3. a carga de A termina e, sem o guarda, apaga o registo da de B
  //   4. chega outro evento de B — e, como já não há registo, carrega OUTRA VEZ
  //
  // É a carga em duplicado, no caso de trocar de conta. Faltava este teste.
  it('a carga de quem saiu não apaga o registo de quem entrou', async () => {
    const chamadas: string[] = [];
    const soltar = new Map<string, () => void>();
    const c = criarCarregadorUnico((userId) => {
      chamadas.push(userId);
      return new Promise<void>((ok) => { soltar.set(userId, ok); });
    });

    const pA = c.carregar('rui');          // 1. começa a de A
    const pB = c.carregar('joseleida');    // 2. B entra antes de A acabar
    expect(chamadas).toEqual(['rui', 'joseleida']);

    soltar.get('rui')!();                   // 3. a de A termina
    await pA;

    const outra = c.carregar('joseleida');  // 4. outro evento de B
    expect(
      chamadas,
      'a carga de quem saiu apagou o registo de quem entrou, e B carregou duas vezes',
    ).toEqual(['rui', 'joseleida']);
    expect(outra, 'devolveu promessa nova em vez da que já estava a caminho').toBe(pB);

    soltar.get('joseleida')!();
    await Promise.all([pB, outra]);
  });

  // `recarregar` é a porta de propósito: terminar o cadastro muda o servidor, e
  // aí TEM de buscar de novo.
  it('recarregar passa por cima do guarda, de propósito', async () => {
    const e = espiao();
    const c = criarCarregadorUnico(e.carga);
    const a = c.carregar('rui'); await e.terminar(); await a;

    const b = c.recarregar('rui'); await e.terminar(); await b;
    expect(e.vezes, '`recarregar` tem de carregar sempre').toBe(2);
  });
});

describe('a tela usa o carregador, e usa-o certo', () => {
  const contexto = readFileSync('state/AppContext.tsx', 'utf8');
  const semComentarios = contexto
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('os DOIS caminhos automáticos passam pelo guarda', () => {
    // Era isto que faltava: um dos caminhos chamava o carregamento direto.
    expect(semComentarios).toContain("await carregador.carregar(session.user.id");
    expect(semComentarios).toContain("carregador.carregar(userId, s2?.user?.email");
  });

  it('nenhum caminho automático chama o carregamento cru', () => {
    // `hydrate` continua a existir — é o que o carregador chama por dentro —
    // mas quem responde a eventos nunca o pode chamar diretamente.
    const ouvinte = semComentarios.slice(
      semComentarios.indexOf('const unsubscribe = onAuthChange'),
      semComentarios.indexOf('return () => { vivo = false;'),
    );
    expect(ouvinte.length, 'recorte do ouvinte largo demais').toBeLessThan(1600);
    expect(ouvinte.length, 'recorte do ouvinte curto demais').toBeGreaterThan(200);
    expect(ouvinte, 'o ouvinte voltou a carregar sem passar pelo guarda')
      .not.toMatch(/\bhydrate\(/);
  });

  it('o carregador é o mesmo durante toda a vida da tela', () => {
    // Um carregador novo a cada pintura teria memória nova — e memória nova não
    // lembra que já carregou, que é a única coisa que ele faz.
    expect(semComentarios).toContain('useMemo(() => criarCarregadorUnico(hydrate), [hydrate])');
  });

  it('sair esquece quem estava carregado', () => {
    expect(semComentarios).toContain('carregador.esquecer();');
  });

  it('e recarregar de propósito continua a existir', () => {
    expect(semComentarios).toContain('carregador.recarregar(session.user.id');
  });
});
