import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O QUE ESTES TESTES GUARDAM
//
// Até aqui um anúncio só podia ser publicado ou encerrado. Um erro de digitação
// no título, um orçamento mal escrito, um prazo que mudou — a única saída era
// cancelar e publicar outro, perdendo as propostas já recebidas.
//
// DUAS REGRAS QUE NÃO SÃO ÓBVIAS, E QUE ESTES TESTES SEGURAM
//
//   1. SÓ ENQUANTO ABERTO. Reescrever um anúncio concluído ou cancelado mudaria,
//      depois do facto, o que foi combinado — e as propostas que ele recebeu
//      passariam a responder a um texto que já não é o que estava lá.
//
//   2. O LADO NÃO MUDA. Virar uma procura em oferta depois de alguém já ter
//      proposto viraria o negócio do avesso.
//
// E a lição que `encerrarAnuncio` já tinha aprendido: quando a RLS recusa um
// UPDATE ela NÃO levanta erro — devolve zero linhas, em silêncio. Sem conferir,
// a tela diria "alterações salvas" para quem não salvou nada.
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const MERCADO = semComentarios(ler('services/mercado.ts'));
const PUBLICAR = semComentarios(ler('screens/PublicarAnuncio.tsx'));
const MEUS = semComentarios(ler('screens/MeusAnuncios.tsx'));
const ANUNCIO = semComentarios(ler('screens/Anuncio.tsx'));

/** Recorte com teto e chão — ver o comentário em o-olho-para-conferir-a-senha. */
function trecho(fonte: string, abre: string, fecha: string, min = 80, max = 3000): string {
  const i = fonte.indexOf(abre);
  expect(i, `não achei "${abre}"`).toBeGreaterThan(-1);
  const f = fonte.indexOf(fecha, i + abre.length);
  expect(f, `não achei o fim "${fecha}"`).toBeGreaterThan(i);
  const corte = fonte.slice(i, f);
  expect(corte.length, `recorte de "${abre}" largo demais`).toBeLessThan(max);
  expect(corte.length, `recorte de "${abre}" curto demais`).toBeGreaterThan(min);
  return corte;
}

const corpoDoUpdate = () =>
  trecho(MERCADO, 'export async function atualizarAnuncio', '\nexport ');

describe('alterar um anúncio já publicado', () => {
  it('a função existe e é um UPDATE na tabela', () => {
    const corpo = corpoDoUpdate();
    expect(corpo).toContain(".from('anuncios')");
    expect(corpo).toContain('.update({');
    expect(corpo).toContain(".eq('id', id)");
  });

  // A LIÇÃO DE `encerrarAnuncio`, QUE ESTA FUNÇÃO TINHA DE HERDAR.
  it('confere que alguma linha mudou — a RLS nega em silêncio', () => {
    const corpo = corpoDoUpdate();
    expect(corpo, "sem o .select('id') não há como saber se salvou")
      .toContain(".select('id')");
    expect(corpo).toContain('data.length === 0');
    expect(corpo).toContain('não é seu ou já foi encerrado');
  });

  // A REGRESSÃO QUE VIRARIA O NEGÓCIO DO AVESSO.
  it('NÃO altera o lado do mercado, nem o dono, nem a situação', () => {
    const corpo = corpoDoUpdate();
    for (const proibido of ['tipo_anuncio:', 'autor_id:', 'status:', 'expires_at:']) {
      expect(corpo, `a edição passou a mexer em ${proibido}`).not.toContain(proibido);
    }
  });

  // Mesmas regras de `publicarAnuncio`: as duas escrevem na mesma tabela, e
  // divergir nelas faria o anúncio editado violar restrições que o novo respeita.
  it('mantém as regras de lugar e de prazo que valem ao publicar', () => {
    const corpo = corpoDoUpdate();
    expect(corpo).toContain("r.modalidade === 'remoto' ? null");
    expect(corpo).toContain("r.tipo === 'oferecendo' ? null");
    expect(corpo).toContain("r.orcamentoTipo === 'a_combinar' ? null");
  });
});

describe('a tela: uma só, com duas faces', () => {
  it('a rota leva um id opcional — sem id é publicar, com id é editar', () => {
    expect(ler('types.ts')).toContain("| { name: 'publicar'; tipo: TipoAnuncio; id?: string }");
    expect(semComentarios(ler('App.tsx'))).toContain('<PublicarAnuncio tipo={route.tipo} id={route.id} />');
  });

  it('editando, traz o que está publicado para dentro do formulário', () => {
    expect(PUBLICAR).toContain('lerAnuncio(id)');
    expect(PUBLICAR).toContain('setPropostasRecebidas');
  });

  // A REGRESSÃO SILENCIOSA: o palpite de cidade serve para anúncio NOVO. Num já
  // publicado ele atropelaria o lugar escolhido, porque o formulário começa
  // vazio e só é preenchido depois pela leitura.
  //
  // ESTE TESTE JÁ FOI FRACO E A REGRESSÃO FORÇADA MOSTROU-O: a primeira versão
  // conferia a LISTA DE DEPENDÊNCIAS do efeito. Tirar o `if (id) return` não
  // mexe na lista, então o defeito passava verde. O que vale é o guarda, e é o
  // guarda que se cobra — dentro do corpo do efeito, recortado de verdade.
  it('o palpite de cidade não atropela o que está publicado', () => {
    const marca = PUBLICAR.indexOf('cidade: atual.cidade || me?.city');
    expect(marca, 'não achei o palpite de cidade').toBeGreaterThan(-1);
    const abre = PUBLICAR.lastIndexOf('useEffect(() => {', marca);
    expect(abre, 'o palpite saiu de dentro de um efeito').toBeGreaterThan(-1);
    const fecha = PUBLICAR.indexOf('}, [', marca);
    const efeito = PUBLICAR.slice(abre, fecha);
    expect(efeito.length, 'recorte do efeito largo demais').toBeLessThan(500);

    expect(efeito, 'editando, o palpite voltaria a atropelar a cidade publicada')
      .toContain('if (id) return;');
  });

  // Mesma história para o lado do mercado: sem o guarda, abrir a edição a
  // partir de uma aba troca o lado do anúncio.
  it('o lado do mercado não é reescrito pela rota ao editar', () => {
    const marca = PUBLICAR.indexOf('atual.tipo === tipo ? atual');
    expect(marca, 'não achei a troca de lado').toBeGreaterThan(-1);
    const abre = PUBLICAR.lastIndexOf('useEffect(() => {', marca);
    const efeito = PUBLICAR.slice(abre, PUBLICAR.indexOf('}, [', marca));
    expect(efeito.length).toBeLessThan(400);
    expect(efeito).toContain('if (id) return;');
  });

  it('o campo de prazo segue o anúncio carregado, não a rota', () => {
    expect(PUBLICAR, 'seguindo a rota, um anúncio aberto pela lista errada perderia o prazo')
      .toContain("const temPrazo = d.tipo === 'procurando';");
  });

  it('salvar chama a função certa de cada caso', () => {
    const corpo = trecho(PUBLICAR, 'const publicar = async', 'if (!me) return null;', 200, 1600);
    expect(corpo).toContain('await atualizarAnuncio(id, rascunho)');
    expect(corpo).toContain('await publicarAnuncio(me.id, rascunho)');
  });

  it('o botão diz o que vai fazer', () => {
    expect(PUBLICAR).toContain("'Salvar alterações'");
    expect(PUBLICAR).toContain("editando ? 'Editar anúncio'");
  });

  // Quem já propôs orçou com base no texto ANTIGO. Não impedimos — o anúncio é
  // seu —, mas dizer é o mínimo.
  it('avisa quando o anúncio já recebeu propostas', () => {
    expect(PUBLICAR).toContain('Este anúncio já recebeu propostas');
    expect(PUBLICAR).toContain('propostasRecebidas > 0');
  });

  it('não pisca o formulário vazio enquanto o anúncio não chega', () => {
    expect(PUBLICAR).toContain('if (carregando)');
  });
});

describe('o botão, e só onde faz sentido', () => {
  it('existe na lista dos meus anúncios', () => {
    expect(MEUS).toContain('onEditar');
    expect(MEUS).toContain("navigate({ name: 'publicar', tipo: a.tipo, id: a.id })");
  });

  it('e também ao ler o próprio anúncio', () => {
    expect(ANUNCIO).toContain("navigate({ name: 'publicar', tipo: anuncio.tipo, id: anuncio.id })");
  });

  // A REGRESSÃO QUE DEIXARIA REESCREVER O PASSADO.
  it('NÃO aparece em anúncio encerrado', () => {
    expect(ANUNCIO, 'o botão passou a aparecer em anúncio encerrado')
      .toContain('{meu && aberto && (');
    // Na lista, editar vive dentro do mesmo bloco que "Encerrar anúncio", que
    // só existe quando aberto.
    const bloco = trecho(MEUS, '{aberto && (', '</Card>', 100, 900);
    expect(bloco).toContain('onEditar');
    expect(bloco).toContain('onEncerrar');
  });

  // O lado vem do ANÚNCIO, não da aba que está sendo olhada: é ele que decide
  // se o campo de prazo aparece.
  it('leva o lado do próprio anúncio, não o da aba', () => {
    expect(MEUS, 'o lado passou a vir da aba').not.toContain("name: 'publicar', tipo: lado, id:");
  });
});
