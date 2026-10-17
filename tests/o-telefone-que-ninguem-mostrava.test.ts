import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O TELEFONE QUE O SISTEMA PROMETIA E NUNCA MOSTRAVA
//
// O DEFEITO, COMO FOI ENCONTRADO
//
// O sistema prometia o telefone do outro lado depois do aceite em QUATRO
// lugares: na página inicial, no cadastro, no aviso da tela Início, e na lista
// do que o plano PAGO inclui. A promessa é a peça central do produto — é o que
// impede o app de virar uma lista de telefones.
//
// A função existia no banco (`contato_do_negocio`, migração 012). A função
// existia no navegador (`contatoDoNegocio`, services/backend.ts). E nenhuma
// tela chamava nenhuma das duas.
//
// Não houve erro em lugar nenhum. A pessoa aceitava a proposta, lia "o telefone
// dos dois lados já foi liberado", e não havia lugar nenhum onde ele estivesse.
//
// Encontrado contando quantas vezes cada coisa exportada aparece no projeto:
// `contatoDoNegocio` aparecia UMA vez, na linha onde é declarada.
//
// O QUE ESTES TESTES GUARDAM
//
// Não basta o componente existir: ele tem de estar NOS DOIS LADOS do acordo, e
// só depois do aceite. Um lado sem o contato é meia promessa — e cala, como
// calou antes.
// ---------------------------------------------------------------------------

const ler = (caminho: string) => readFileSync(caminho, 'utf8');

/**
 * Quantas vezes um nome aparece num texto, FORA de comentários.
 *
 * Recebe o texto e não o caminho de propósito: assim a própria ferramenta pode
 * ser provada com um texto escrito à mão, em vez de com um ficheiro real —
 * onde a palavra procurada acabaria por aparecer também como código do teste,
 * que foi o engano da primeira versão disto.
 */
function contarEm(texto: string, nome: string): number {
  const limpo = texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return (limpo.match(new RegExp(`\\b${nome}\\b`, 'g')) ?? []).length;
}

const vezesNoCodigo = (nome: string, arquivos: string[]): number =>
  arquivos.reduce((n, f) => n + contarEm(ler(f), nome), 0);

const COMPONENTE = 'components/ContatoLiberado.tsx';
/** Quem propôs vê o telefone de quem publicou. */
const LADO_DE_QUEM_PROPOS = 'screens/MinhasPropostas.tsx';
/** Quem publicou vê o telefone de quem propôs. */
const LADO_DE_QUEM_PUBLICOU = 'screens/Anuncio.tsx';

describe('o telefone aparece depois do aceite, nos dois lados', () => {
  // PRIMEIRO A FERRAMENTA. Um contador que nunca acha nada daria verde sobre
  // tudo — foi um contador assim, na minha cabeça, que deixou o defeito passar.
  it('o contador sabe distinguir quem é usado de quem não é', () => {
    const arquivos = [COMPONENTE, LADO_DE_QUEM_PROPOS, LADO_DE_QUEM_PUBLICOU];
    expect(vezesNoCodigo('ContatoLiberado', arquivos), 'não achou o que existe')
      .toBeGreaterThan(2);
    expect(vezesNoCodigo('NomeQueNaoExisteEmLadoNenhum', arquivos), 'achou o que não existe')
      .toBe(0);
    // E não pode contar o que está escrito dentro de um comentário — que é
    // justamente onde o nome de uma função morta costuma continuar a aparecer.
    expect(contarEm('const x = 1; // chama contatoDoNegocio um dia', 'contatoDoNegocio'),
      'contou um nome que estava dentro de um comentário de linha').toBe(0);
    expect(contarEm('/* contatoDoNegocio */ const y = 2;', 'contatoDoNegocio'),
      'contou um nome que estava dentro de um comentário de bloco').toBe(0);
    expect(contarEm('await contatoDoNegocio(id);', 'contatoDoNegocio'),
      'não contou uma chamada a sério').toBe(1);
  });

  it('alguma tela chama mesmo a função que busca o telefone', () => {
    // Era isto que faltava, e é a asserção que teria evitado tudo.
    const fonte = ler(COMPONENTE);
    expect(fonte, 'o componente não busca o contato no servidor')
      .toContain('contatoDoNegocio(propostaId)');
  });

  it.each([
    ['quem propôs', LADO_DE_QUEM_PROPOS],
    ['quem publicou', LADO_DE_QUEM_PUBLICOU],
  ])('%s vê o contato', (_quem, arquivo) => {
    const fonte = ler(arquivo);
    expect(fonte, `${arquivo} não importa o componente do contato`)
      .toContain("import { ContatoLiberado } from '../components/ContatoLiberado'");
    expect(fonte, `${arquivo} importa mas não usa o componente`)
      .toMatch(/<ContatoLiberado\s+propostaId=/);
  });

  // A OUTRA METADE DA PROMESSA: antes do aceite, NADA.
  it.each([
    ['quem propôs', LADO_DE_QUEM_PROPOS],
    ['quem publicou', LADO_DE_QUEM_PUBLICOU],
  ])('e %s só o vê depois do aceite', (_quem, arquivo) => {
    const fonte = ler(arquivo);
    const uso = fonte.indexOf('<ContatoLiberado');
    const trecho = fonte.slice(Math.max(0, uso - 420), uso);
    expect(trecho, `em ${arquivo} o contato aparece fora de um ramo de proposta aceita`)
      .toMatch(/status === 'aceita'/);
  });

  it('e o componente cala quando o banco não devolve nada', () => {
    // Pedir numa proposta não aceita devolve vazio. Isso tem de virar silêncio,
    // e não um aviso de erro para quem não fez nada de errado.
    const fonte = ler(COMPONENTE);
    expect(fonte, 'deixou de calar quando não há contato a mostrar')
      .toMatch(/fase === 'nada'\s*\)\s*return null/);
  });

  it('o telefone que não existe é DITO, e não deixado em branco', () => {
    // `telefone` é opcional no cadastro: a promessa nem sempre pode ser
    // cumprida, e um espaço vazio pareceria defeito.
    const fonte = ler(COMPONENTE);
    expect(fonte, 'deixou de tratar quem não cadastrou telefone')
      .toContain('Sem telefone cadastrado');
  });

  it('o número é clicável — no celular, é o que o torna útil', () => {
    expect(ler(COMPONENTE), 'o telefone deixou de virar link de chamada')
      .toContain('href={`tel:${soDigitos(telefone)}`}');
  });

  // A PROMESSA ESCRITA. Se algum destes textos sair, o conserto perde o
  // sentido; se ficar e o componente sair, volta a mentira.
  it('os textos que prometem o telefone continuam de pé', () => {
    expect(ler('screens/Premium.tsx'), 'o plano pago deixou de vender o contato')
      .toContain('Ver o telefone do outro lado quando uma proposta é aceita');
    expect(ler('screens/Home.tsx'), 'o aviso do Início deixou de falar do telefone')
      .toContain('O telefone dos dois lados já foi liberado');
  });
});
