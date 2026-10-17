import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moderateText } from '../services/moderation';

// ---------------------------------------------------------------------------
// A SEGUNDA PENEIRA DA MODERAÇÃO
//
// O QUE ESTAVA ERRADO
//
// `services/moderation.ts` diz, no cabeçalho, desde sempre: "A camada 2
// (Gemini) vive em geminiService.moderateWithAI e só é chamada quando a
// heurística acende amarelo."
//
// Não era chamada por ninguém. A moderação do app era só a camada 1 — uma
// lista de padrões — e o documento prometia uma segunda linha de defesa que
// não existia. Mesma classe do telefone que ninguém mostrava, e encontrada
// pelo mesmo teste: `tests/nada-exportado-sem-quem-chame.test.ts`.
//
// POR QUE SÓ NO AMARELO
//
//   verde     a lista não viu nada. Perguntar ao modelo é gastar por nada.
//   amarelo   a lista viu algo e não sabe dizer o quê. É aqui que ela é fraca,
//             e é aqui que a segunda opinião vale.
//   vermelho  já é o pior veredito. Nada que o modelo diga muda o que acontece.
//
// O QUE ESTES TESTES GUARDAM
//
// Que a camada 2 é chamada, que o veredito dela CHEGA à mensagem gravada (sem
// isso o trabalho perdia-se na regravação pela camada 1), e que uma falha dela
// não impede ninguém de falar.
// ---------------------------------------------------------------------------

const ler = (c: string) => readFileSync(c, 'utf8');
const CHAT = ler('screens/Chat.tsx');
const CONTEXTO = ler('state/AppContext.tsx');
const MODERACAO = ler('services/moderation.ts');
const GEMINI = ler('services/geminiService.ts');

/** Sem comentários: o que importa é o que corre, não o que está escrito. */
const soCodigo = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('a camada 1 continua a ser a que corre sempre', () => {
  // A CAMADA 1 É TESTADA DE VERDADE: corre, e vê-se o veredito.
  it('texto normal de trabalho passa limpo', () => {
    expect(moderateText('Bom dia, consegue vir ver a obra na quinta?').level).toBe('ok');
  });

  it('e ela continua a saber acender', () => {
    // Não interessa QUAL frase acende — interessa que alguma acenda, senão a
    // camada 2 nunca seria consultada e este conserto não valeria nada.
    const frases = [
      'me paga tudo adiantado por fora, no pix, antes de eu começar',
      'manda o teu whatsapp e o numero do cartao que eu resolvo',
      'passa o codigo que chegou no teu sms para eu confirmar',
    ];
    const niveis = frases.map((f) => moderateText(f).level);
    expect(niveis.some((n) => n !== 'ok'), `nenhuma destas acendeu: ${niveis.join(', ')}`).toBe(true);
  });
});

describe('a segunda peneira está ligada, e no sítio certo', () => {
  it('a tela da conversa chama mesmo a camada 2', () => {
    // Era isto que faltava, e é a asserção que teria evitado tudo.
    expect(soCodigo(CHAT), 'a camada 2 voltou a não ser chamada por ninguém')
      .toContain('await moderateWithAI(text, check)');
  });

  it('e só a chama no amarelo', () => {
    const codigo = soCodigo(CHAT);
    const pedido = codigo.indexOf('await moderateWithAI');
    const antes = codigo.slice(Math.max(0, pedido - 500), pedido);
    expect(antes, 'a chamada ao modelo deixou de estar guardada pelo amarelo')
      .toMatch(/level !== 'atencao'|level === 'atencao'/);
    // O vermelho sai antes, sem consultar: é o pior veredito que já existe.
    expect(antes, 'o vermelho deixou de sair antes da chamada')
      .toMatch(/level === 'risco'/);
  });

  it('o veredito da camada 2 CHEGA à mensagem gravada', () => {
    // Sem isto o conserto era de fachada: a camada 1 regravaria por cima, e
    // uma mensagem elevada a risco não entraria na fila de revisão humana.
    expect(soCodigo(CHAT), 'a tela deixou de passar o veredito adiante')
      .toMatch(/doSend\(text, 'texto', undefined, veredito\)/);
    expect(soCodigo(CONTEXTO), 'o envio deixou de aceitar a segunda opinião')
      .toContain('segundaOpiniao ?? moderateText(trimmed)');
  });

  it('e também quando a pessoa confirma o aviso', () => {
    // O caminho do diálogo é o mais fácil de esquecer: é por ele que passam
    // justamente as mensagens que a camada 2 elevou.
    expect(soCodigo(CHAT), 'ao confirmar, o veredito da camada 2 perdia-se')
      .toContain('doSend(pendingRisk.text, \'texto\', undefined, pendingRisk.veredito)');
  });

  it('se a camada 2 falhar, a mensagem sai à mesma', () => {
    // Uma peneira que se parte não pode calar ninguém. Quem garante isto é o
    // `fallback` de `invocar`, que devolve o veredito local em qualquer erro.
    expect(soCodigo(GEMINI), 'a camada 2 deixou de ter rede de segurança')
      .toMatch(/invocar<ModerationResult>\('moderar',[\s\S]{0,80}base\)/);
    expect(soCodigo(GEMINI), '`invocar` deixou de devolver o fallback quando falha')
      .toMatch(/catch[\s\S]{0,200}return fallback/);
  });

  it('dois cliques não mandam a mesma mensagem duas vezes', () => {
    // A espera pela camada 2 abriu essa porta: antes o envio era instantâneo.
    const codigo = soCodigo(CHAT);
    expect(codigo, 'o envio deixou de fechar enquanto a camada 2 responde')
      .toMatch(/if \(!text \|\| aConferir\) return;/);
    expect(codigo, 'o botão deixou de ficar desligado durante a conferência')
      .toContain('disabled={!draft.trim() || aConferir}');
  });

  it('o que o documento promete é o que o código faz', () => {
    // A frase que esteve errada durante meses. Se ela mudar, este teste cai e
    // obriga a conferir se mudou junto com o código — ou sozinha, outra vez.
    // A frase está partida em duas linhas de comentário, por isso a procura
    // tolera a quebra e o `//` do meio. Procurá-la como uma linha só falhava —
    // e falhar aqui seria acusar o documento de mentir quando ele não mente.
    expect(MODERACAO.replace(/\n\s*\/\/\s*/g, ' '),
      'o cabeçalho da moderação deixou de descrever as duas camadas')
      .toContain('só é chamada quando a heurística acende amarelo');
    // E tem de continuar a dizer que já esteve errado uma vez.
    expect(MODERACAO, 'o registo de que a camada 2 esteve morta desapareceu')
      .toContain('FORAM MENTIRA DURANTE MESES');
  });
});
