// ---------------------------------------------------------------------------
// CARREGAR UMA VEZ SÓ
//
// O DEFEITO QUE ISTO CONSERTA, MEDIDO E NÃO SUPOSTO
//
// No aplicativo, DUAS coisas mandam carregar os dados da pessoa, e nenhuma
// sabia da outra: o efeito que pergunta "existe sessão?" ao abrir a página, e
// o ouvinte de eventos de autenticação. O Supabase dispara VÁRIOS eventos em
// sequência no mesmo instante — `INITIAL_SESSION`, `SIGNED_IN`,
// `USER_UPDATED`, `TOKEN_REFRESHED` — e o ouvinte tratava todos como iguais.
//
// Registo do servidor, no cadastro do dono em 13/10/2026:
//
//   23:09:20   carregamento completo  ×3   (ao confirmar o e-mail)
//   23:13:04   carregamento completo
//   23:13:06   carregamento completo       (ao entrar)
//
// Cada "carregamento completo" são DOZE pedidos. Três ao mesmo tempo são 36
// pedidos num segundo onde 12 bastavam.
//
// Para quem usa, foi a tela a piscar e a recarregar sozinha — foi assim que o
// dono o descreveu, e foi o que levou a procurar nos registos. Num telefone
// com dados móveis, é o triplo do gasto à toa.
//
// UMA CAUSA QUE EU AFIRMEI E DEPOIS DESMENTI, E QUE FICA ESCRITA PARA NINGUÉM
// A REPETIR
//
// A primeira versão deste comentário dizia que as rajadas mataram processos do
// PostgREST, citando duas linhas de `Warp server error: Thread killed by
// timeout manager` logo a seguir a elas. Parecia encaixar. Não encaixava.
//
// Depois do conserto, com o carregamento já reduzido a UM, essas mesmas linhas
// voltaram a aparecer. Fui contá-las por hora contra os pedidos do aplicativo:
//
//   13/10 23:00   94 pedidos   20 processos mortos
//   14/10 01:00    3 pedidos    4 processos mortos
//   14/10 03:00    0 pedidos    1 processo morto     ← ninguém a usar
//   14/10 10:00   24 pedidos    0 processos mortos
//
// Às três da manhã não havia um único pedido e mesmo assim houve um. São
// ligações ociosas que o servidor recicla sozinho: ruído de fundo, não
// sintoma. A medição das três cargas estava certa; a causa que tirei dela,
// não — e eu afirmei-a sem a testar.
//
// Fica aqui porque uma correlação que se vê uma vez é barata de afirmar e cara
// de desmentir, e porque o próximo a ler estes registos vai ver as mesmas
// linhas e tirar a mesma conclusão.
//
// POR QUE NÃO BASTAVA FILTRAR OS EVENTOS
//
// Carregar só no `SIGNED_IN` resolveria HOJE, e voltaria a partir no dia em
// que o Supabase mudasse a ordem ou o nome dos eventos — coisa que não
// controlamos e que não dá erro nenhum quando muda. Este guarda não depende de
// QUAIS eventos chegam: depende de já ter carregado esta pessoa. Chegue um
// evento ou cheguem cinco, carrega uma vez.
//
// POR QUE SÃO DUAS MEMÓRIAS, E NÃO UMA
//
//   `emCurso`   — cobre os eventos do MESMO instante, enquanto o carregamento
//                 ainda está a caminho. Devolve a mesma promessa, para quem
//                 esperar esperar pelo mesmo.
//   `carregado` — cobre os que chegam DEPOIS de terminar. Foram dois segundos
//                 entre o segundo e o terceiro carregamento medidos, e um
//                 guarda que só olhasse "está a caminho?" teria deixado passar
//                 o terceiro.
//
// E SÓ MARCA COMO CARREGADO QUANDO DÁ CERTO
//
// Uma falha tem de poder ser tentada de novo pelo evento seguinte. Marcar
// antes de saber o desfecho deixaria o aplicativo vazio para sempre depois de
// um tropeção de rede — sem erro em lado nenhum que explicasse.
//
// Por que fica aqui, e não dentro da tela: isto é lógica, não desenho. Num
// componente só dava para o conferir por leitura; aqui dá para o provar, e
// `tests/carregar-uma-vez.test.ts` prova-o com carregamentos a sério.
// ---------------------------------------------------------------------------

/** O que carrega de verdade. Recebe quem, e devolve quando acabou. */
export type Carga = (userId: string, email?: string) => Promise<void>;

export interface CarregadorUnico {
  /** Carrega — a não ser que esta pessoa já esteja carregada ou a caminho. */
  carregar: (userId: string, email?: string) => Promise<void>;
  /** Carrega SEMPRE. Para quem sabe que algo mudou no servidor. */
  recarregar: (userId: string, email?: string) => Promise<void>;
  /** Sair esquece tudo: a próxima pessoa a entrar não é a anterior. */
  esquecer: () => void;
  /** Só para os testes e para diagnóstico: quem está carregado agora. */
  quemEstaCarregado: () => string | null;
}

export function criarCarregadorUnico(carga: Carga): CarregadorUnico {
  let emCurso: { userId: string; promessa: Promise<void> } | null = null;
  let carregado: string | null = null;

  const comecar = (userId: string, email?: string): Promise<void> => {
    const promessa = carga(userId, email)
      .then(() => { carregado = userId; })
      .finally(() => {
        // Só limpa se ainda for ESTE carregamento: entre o início e o fim pode
        // ter entrado outra pessoa, e limpar o dela deixaria duas cargas a
        // correr para a mesma conta — justamente o que isto evita.
        if (emCurso?.promessa === promessa) emCurso = null;
      });
    emCurso = { userId, promessa };
    return promessa;
  };

  return {
    carregar(userId, email) {
      if (emCurso?.userId === userId) return emCurso.promessa;
      if (carregado === userId) return Promise.resolve();
      return comecar(userId, email);
    },
    recarregar(userId, email) {
      return comecar(userId, email);
    },
    esquecer() {
      emCurso = null;
      carregado = null;
    },
    quemEstaCarregado() {
      return carregado;
    },
  };
}
