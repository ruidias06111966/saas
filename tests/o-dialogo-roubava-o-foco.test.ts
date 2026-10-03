import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O DIÁLOGO ROUBAVA O FOCO A CADA LETRA
//
// O RELATO: "cliquei para encerrar a conversa e aonde escrevo sai sempre que
// coloco uma letra".
//
// A CAUSA. O `Modal` punha o foco e ouvia o Escape num efeito só, com `onClose`
// na lista de dependências:
//
//   useEffect(() => { …; ref.current?.focus(); }, [open, onClose]);
//
// `onClose` é quase sempre escrito na própria chamada —
// `onClose={() => setAberto(false)}` — e isso é uma função NOVA a cada pintura.
// Com o diálogo aberto: a pessoa digita uma letra → o estado do pai muda → nova
// pintura → `onClose` tem identidade nova → o efeito corre outra vez →
// `ref.current?.focus()` arranca o foco do campo.
//
// MEDIDO NUM NAVEGADOR DE VERDADE, antes do conserto: de oito letras digitadas,
// entrou UMA. As outras sete foram para a caixa do diálogo, que não escreve
// nada. No celular, o teclado fecha a cada letra.
//
// TRÊS TELAS ESTAVAM QUEBRADAS A CADA LETRA, porque nelas o texto vive no mesmo
// componente que desenha o diálogo: a despedida da conversa, a recusa de uma
// verificação, e — a pior — a palavra "EXCLUIR" que confirma a exclusão da
// conta. Nessa última o botão só liga depois de a palavra inteira estar escrita,
// e nunca passava da primeira letra: o direito de apagar a própria conta estava
// inalcançável pela tela.
//
// A quarta, a denúncia, escapava à regra por receber o `onClose` como
// propriedade — mas bastava chegar uma mensagem nova para o Chat repintar e o
// foco ser roubado no meio da frase.
//
// Por isso o conserto é no `Modal`, e não nas chamadas: envolver cada `onClose`
// num `useCallback` consertaria o caso, e o próximo diálogo com um campo
// nasceria quebrado outra vez.
//
// O QUE ESTES TESTES SEGURAM: que o foco entre UMA vez (ao abrir), que nenhum
// efeito do diálogo dependa do `onClose`, e que o Escape continue a chamar o
// `onClose` mais recente.
// ---------------------------------------------------------------------------

const UI = readFileSync('components/ui/index.tsx', 'utf8');
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** O corpo do `Modal`, sem os comentários — que falam do defeito e enganariam. */
function corpoDoModal(): string {
  const limpo = semComentarios(UI);
  const i = limpo.indexOf('export function Modal(');
  expect(i, 'não achei o Modal').toBeGreaterThan(-1);
  const f = limpo.indexOf('\nexport ', i + 10);
  expect(f, 'não achei o fim do Modal').toBeGreaterThan(i);
  const corte = limpo.slice(i, f);
  expect(corte.length, 'recorte do Modal largo demais').toBeLessThan(3000);
  expect(corte.length, 'recorte do Modal curto demais').toBeGreaterThan(400);
  return corte;
}

/** Cada `useEffect` de um trecho, com o seu corpo e a sua lista de dependências. */
const efeitosCom = (codigo: string): { corpo: string; deps: string }[] =>
  [...codigo.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/g)]
    .map((m) => ({ corpo: m[1], deps: m[2].trim() }));

describe('o diálogo não pode roubar o foco de quem escreve', () => {
  // A REGRESSÃO EXACTA, e dita com cuidado: depender do `onClose` não é, em si,
  // o defeito. O efeito que só o copia para um ref TEM de depender dele, e é
  // inofensivo — não mexe no foco nem ata nada. O que não pode é um efeito que
  // põe o foco, ou que ata um ouvinte, correr outra vez só porque quem chamou o
  // diálogo escreveu a função na própria chamada.
  it('nenhum efeito que mexe no foco ou ata ouvintes depende do `onClose`', () => {
    const efeitos = efeitosCom(corpoDoModal());
    expect(efeitos.length, 'o Modal deixou de ter efeitos com dependências')
      .toBeGreaterThan(1);
    for (const { corpo, deps } of efeitos) {
      if (!deps.includes('onClose')) continue;
      expect(corpo, `o efeito \`[${deps}]\` voltou a pôr o foco — será roubado a cada letra`)
        .not.toContain('.focus()');
      expect(corpo, `o efeito \`[${deps}]\` voltou a atar um ouvinte — reatado a cada letra`)
        .not.toContain('addEventListener');
    }
  });

  it('o foco entra uma vez, e o efeito que o põe depende só de `open`', () => {
    const corpo = corpoDoModal();
    const marca = corpo.indexOf('ref.current?.focus()');
    expect(marca, 'o diálogo deixou de receber o foco ao abrir').toBeGreaterThan(-1);

    const abre = corpo.lastIndexOf('useEffect(() => {', marca);
    expect(abre, 'o foco saiu de dentro de um efeito').toBeGreaterThan(-1);
    // O efeito fecha com a própria lista de dependências — `});` sozinho não
    // aparece, e recortar por ele não achava fim nenhum.
    const fim = corpo.indexOf(']);', marca);
    expect(fim, 'o efeito do foco ficou sem lista de dependências').toBeGreaterThan(marca);
    const efeito = corpo.slice(abre, fim + 3);
    expect(efeito.length, 'recorte do efeito do foco largo demais').toBeLessThan(260);
    expect(efeito.length, 'recorte do efeito do foco curto demais').toBeGreaterThan(40);

    expect(efeito, 'o efeito do foco voltou a depender de outra coisa além de `open`')
      .toContain('}, [open]);');
    // E o foco não pode voltar a partilhar efeito com o ouvinte do Escape: foi
    // essa partilha que amarrou o foco à identidade do `onClose`.
    expect(efeito, 'o foco voltou a partilhar efeito com o ouvinte do teclado')
      .not.toContain('addEventListener');
  });

  it('o Escape chama o `onClose` mais recente, por um ref', () => {
    const corpo = corpoDoModal();
    expect(corpo, 'o `onClose` deixou de ser guardado num ref')
      .toContain('const fechar = useRef(onClose);');
    expect(corpo).toContain('fechar.current = onClose;');
    expect(corpo, 'o ouvinte do Escape voltou a chamar o `onClose` da pintura')
      .toContain('fechar.current()');
  });

  // A CLASSE, E NÃO SÓ O MODAL: qualquer efeito que mexa no foco e dependa de
  // uma função recebida de fora repete o mesmo defeito noutro componente desta
  // pasta — e a próxima pessoa não vai lembrar-se de olhar.
  it('nenhum efeito que mexe no foco depende de uma função recebida de fora', () => {
    const efeitos = efeitosCom(semComentarios(UI));
    expect(efeitos.length, 'não achei efeito nenhum para conferir').toBeGreaterThan(0);
    for (const { corpo, deps } of efeitos) {
      if (!corpo.includes('.focus()')) continue;
      const callbacks = deps.split(',').map((d) => d.trim()).filter((d) => /^on[A-Z]/.test(d));
      expect(callbacks, `um efeito que mexe no foco depende de \`${callbacks.join(', ')}\` — o foco será roubado a cada pintura`)
        .toEqual([]);
    }
  });
});
