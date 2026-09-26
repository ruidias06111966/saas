import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Trocar a foto: a nova entra ao salvar, a anterior sai depois.
//
// O QUE ACONTECIA
//
// Escolher o arquivo já o enviava para o Storage na hora. O perfil só passava
// a apontar para ele quando a pessoa apertava Salvar — e a anterior nunca era
// apagada. Duas consequências, as duas medidas em produção:
//
//   • SEIS fotos de pessoas reais ficaram no bucket sem nenhum perfil
//     apontando para elas (4 numa conta, 2 na outra);
//   • a tela mostrava a foto nova ANTES de qualquer gravação, então parecia
//     ter salvo. O relato foi esse: trocou, a tela mudou, e o perfil continuou
//     com a foto antiga. Duas tentativas, dez segundos de diferença, nenhuma
//     gravada.
//
// A ORDEM É A PARTE QUE IMPORTA
//
// `removeImage(anterior)` vem DEPOIS de `saveProfile`. Se viesse antes e a
// gravação falhasse, a pessoa ficaria sem foto nenhuma — o arquivo apagado e o
// perfil ainda apontando para ele. Este é o teste que eu mais quero que exista
// aqui, porque a regressão é invisível até acontecer com alguém.
//
// O QUE ESTES TESTES NÃO PROVAM
//
// Não trocam foto nenhuma. Não há navegador aqui, e o caminho real criaria
// dados na produção. Isto guarda a ESTRUTURA e a ORDEM. Verificar o código não
// é verificar o app.
// ---------------------------------------------------------------------------

const RAIZ = new URL('..', import.meta.url).pathname;
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8');

const tela = ler('screens/ProfileEdit.tsx');

/** Recorta um bloco delimitado, com o fim asseverado — não por contagem. */
function bloco(de: string, ate: string, onde: string): string {
  const abre = tela.indexOf(de);
  expect(abre, `não achei \`${de}\` em ${onde}`).toBeGreaterThan(-1);
  const fecha = tela.indexOf(ate, abre);
  expect(fecha, `não achei o fim de \`${de}\` em ${onde}`).toBeGreaterThan(abre);
  return tela.slice(abre, fecha + ate.length);
}

const save = bloco('const save = async () => {', '\n  };', 'ProfileEdit');
const escolha = bloco('<input', '/>', 'ProfileEdit');

describe('escolher a foto não envia nada', () => {
  it('o input não sobe a foto', () => {
    // Era aqui que o envio acontecia. Enviar ao escolher é o que produzia
    // arquivo órfão para quem desistisse antes de salvar.
    expect(escolha).not.toContain('uploadProfilePhoto');
  });

  it('o input monta uma prévia local', () => {
    expect(escolha).toContain('readImageAsDataUrl');
  });

  it('o input limpa o value, senão a mesma foto não pode ser reescolhida', () => {
    expect(escolha).toContain("e.target.value = ''");
  });
});

describe('salvar envia a nova e depois apaga a anterior', () => {
  it('o envio acontece dentro do save', () => {
    expect(save).toContain('uploadProfilePhoto');
  });

  it('a anterior é a que está no SERVIDOR, não a do rascunho', () => {
    // `d.photo` pode já ter sido esvaziado pelo botão Remover nesta tela. Usar
    // `d.photo` aqui apagaria a coisa errada, ou nada.
    expect(save).toMatch(/const anterior = me\.photo/);
  });

  it('APAGA A ANTERIOR DEPOIS DE GRAVAR, nunca antes', () => {
    const gravou = save.indexOf('await saveProfile(');
    const apagou = save.indexOf('await removeImage(');
    expect(gravou, 'não achei a gravação do perfil').toBeGreaterThan(-1);
    expect(apagou, 'não achei a remoção da foto anterior').toBeGreaterThan(-1);
    // Invertido, uma gravação que falha deixa a pessoa sem foto nenhuma.
    expect(apagou).toBeGreaterThan(gravou);
  });

  it('não apaga quando a foto não mudou', () => {
    expect(save).toMatch(/if \(anterior && anterior !== foto\)/);
  });

  it('o perfil é gravado com a foto que acabou de subir', () => {
    expect(save).toMatch(/saveProfile\(\{ \.\.\.d, photo: foto,/);
  });
});

describe('a remoção da foto anterior não pode ser silenciosa', () => {
  const media = ler('services/media.ts');
  const corpo = media.slice(
    media.indexOf('export async function removeImage'),
    media.indexOf('\n}', media.indexOf('export async function removeImage')) + 2,
  );

  it('removeImage olha o erro do Storage', () => {
    // Ela ignorava o resultado do `remove()`. Era assim que as seis fotos
    // órfãs se acumulavam sem ninguém saber.
    expect(corpo).toMatch(/const \{ error \} = await/);
    expect(corpo).toContain('reportarErro');
  });

  it('removeImage não lança', () => {
    // Quem chama já gravou o perfil. Lançar aqui desfaria, na tela, um
    // sucesso que de facto aconteceu no banco.
    expect(corpo).not.toContain('throw');
  });
});
