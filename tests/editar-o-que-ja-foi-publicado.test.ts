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
//   2. O LADO MUDA — E ANTES NÃO MUDAVA. A primeira versão recusava trocar
//      procura por oferta, com o argumento de que as propostas recebidas
//      deixariam de fazer sentido. O argumento não era mau; a execução era.
//      A tela não mostrava a troca NEM dizia que ela não existia: o dono do
//      site editou "Pedreiro" esperando virá-lo para oferta, a tela ficou
//      calada, e o anúncio passou dias do lado errado — invisível para quem o
//      procurava. Negar em silêncio é o defeito que esta base passou a semana
//      a corrigir, e foi reintroduzido aqui. Agora a troca existe, e quem diz
//      o preço dela é a tela.
//
//      E A PARTE CONTRAINTUITIVA, que foi o que de facto enganou: quem OFERECE
//      é encontrado na área "Procurar serviço". Os testes abaixo seguram essa
//      inversão letra por letra, porque trocá-la devolve o defeito original.
//
// E a lição que `encerrarAnuncio` já tinha aprendido: quando a RLS recusa um
// UPDATE ela NÃO levanta erro — devolve zero linhas, em silêncio. Sem conferir,
// a tela diria "alterações salvas" para quem não salvou nada.
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const MERCADO = semComentarios(ler('services/mercado.ts'));
const ANUNCIOS = semComentarios(ler('screens/Anuncios.tsx'));
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

  // A REGRESSÃO QUE DEIXOU UM ANÚNCIO DIAS DO LADO ERRADO: esta linha não
  // existia, e a tela não dizia que não existia.
  it('ALTERA o lado do mercado — era o que faltava', () => {
    const corpo = corpoDoUpdate();
    expect(corpo, 'voltou a recusar a troca de lado, e em silêncio')
      .toContain('tipo_anuncio: r.tipo');
  });

  // O que continua fora, e por quê: o dono não se transfere, a situação muda
  // por `encerrarAnuncio` (que também mexe em `status`), e o prazo dos 30 dias
  // conta desde a publicação — editar não o reinicia.
  it('NÃO altera o dono, a situação nem o prazo de validade', () => {
    const corpo = corpoDoUpdate();
    for (const proibido of ['autor_id:', 'status:', 'expires_at:']) {
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

// ---------------------------------------------------------------------------
// VIRAR O LADO DO MERCADO
//
// O defeito que trouxe este bloco: o dono publicou "Pedreiro" como PROCURA,
// percebeu o erro, abriu a edição — e não havia como virar. A tela não o
// dizia; simplesmente ignorava. O anúncio ficou dias invisível para quem
// procurava um pedreiro.
// ---------------------------------------------------------------------------

/** O mapa `LADO` da tela de publicar, recortado. */
const MAPA_LADO = () => trecho(PUBLICAR, 'const LADO: Record<TipoAnuncio', '\n};', 250, 1000);
const entradaLado = (l: string) => trecho(MAPA_LADO(), `${l}: {`, '},', 60, 400);

describe('virar o lado, dizendo o preço', () => {
  it('a edição mostra um seletor de lado', () => {
    const marca = PUBLICAR.indexOf("set('tipo', l)");
    expect(marca, 'o seletor de lado desapareceu da tela').toBeGreaterThan(-1);

    // SÓ AO EDITAR: publicando, o lado veio do botão que trouxe a pessoa até
    // aqui. Sem o `editando &&`, a tela de publicar passaria a perguntar de
    // novo — e a deixar contradizer o botão que foi clicado.
    const abre = PUBLICAR.lastIndexOf('{editando && (', marca);
    expect(abre, 'o seletor de lado saiu de dentro do `editando &&`').toBeGreaterThan(-1);
    const bloco = PUBLICAR.slice(abre, marca);
    expect(bloco.length, 'recorte do seletor largo demais').toBeLessThan(900);
    expect(bloco.length, 'recorte do seletor curto demais').toBeGreaterThan(60);
    expect(bloco, 'o seletor deixou de ser um par de opções').toContain('<Chip');
  });

  // A INVERSÃO É O CORAÇÃO DO DEFEITO: quem OFERECE é encontrado na área
  // "Procurar serviço", porque é lá que está quem precisa. Dizer só
  // "procurando/oferecendo" não bastou — foi o nome da aba que enganou.
  it('o seletor diz em que área o anúncio aparece — a área OPOSTA', () => {
    expect(entradaLado('procurando')).toContain("ondeAparece: 'Oferecer serviço'");
    expect(entradaLado('oferecendo')).toContain("ondeAparece: 'Procurar serviço'");
  });

  // E A MESMA COISA DERIVADA, não repetida: a área onde se PUBLICA uma procura
  // é a que LISTA as ofertas. Assim os dois ficheiros não podem divergir sem o
  // teste cair — se alguém renomear as abas em Anuncios.tsx, este teste exige
  // que o aviso da edição acompanhe.
  it('a área que o aviso nomeia é a mesma que Anuncios.tsx lista', () => {
    const moldura = trecho(ANUNCIOS, 'const MOLDURA: Record<TipoAnuncio', '\n};', 300, 2000);
    const areaDe = (l: string) => {
      const achado = trecho(moldura, `${l}: {`, '},', 60, 900).match(/titulo: '([^']+)'/);
      expect(achado, `não achei o título da área ${l}`).not.toBeNull();
      return achado![1];
    };
    expect(entradaLado('oferecendo')).toContain(`ondeAparece: '${areaDe('procurando')}'`);
    expect(entradaLado('procurando')).toContain(`ondeAparece: '${areaDe('oferecendo')}'`);
  });

  it('a moldura da tela segue o lado escolhido, não a rota', () => {
    expect(PUBLICAR, 'seguindo a rota, virar o lado trocaria o campo de prazo mas não os textos')
      .toContain('const lado = editando ? d.tipo : tipo;');
    expect(PUBLICAR).toContain('const t = TEXTOS[lado];');
  });

  it('guarda o lado com que o anúncio chegou, para saber se foi virado', () => {
    expect(PUBLICAR).toContain('setLadoOriginal(a.tipo);');
    expect(PUBLICAR).toContain('ladoOriginal !== d.tipo');
  });

  it('avisa, por extenso, quando o lado foi virado', () => {
    const marca = PUBLICAR.indexOf('Você está trocando o lado deste anúncio');
    expect(marca, 'o aviso da troca desapareceu').toBeGreaterThan(-1);
    const abre = PUBLICAR.lastIndexOf('{ladoAnterior && (', marca);
    expect(abre, 'o aviso deixou de depender de a troca ter acontecido').toBeGreaterThan(-1);

    const aviso = trecho(PUBLICAR, '{ladoAnterior && (', '</Banner>', 300, 2200);
    expect(aviso, 'o aviso deixou de dizer de onde e para onde').toContain('LADO[ladoAnterior].ondeAparece');
    expect(aviso).toContain('LADO[d.tipo].ondeAparece');
    expect(aviso, 'o aviso calou-se sobre as propostas já recebidas').toContain('propostasRecebidas > 0');
    expect(aviso, 'o aviso calou-se sobre o prazo que vai ser apagado').toContain("d.tipo === 'oferecendo' && prazo !== ''");
  });

  // POR QUE O PRAZO TEM DE ZERAR: ensaiado contra a base real — virar para
  // oferta mantendo `prazo_dias` é RECUSADO pela restrição `prazo_so_em_procura`
  // com um erro do Postgres na cara de quem só queria mudar de lado.
  it('virar para oferta zera o prazo — o banco recusa prazo numa oferta', () => {
    expect(corpoDoUpdate()).toContain("prazo_dias: r.tipo === 'oferecendo' ? null");
  });
});
