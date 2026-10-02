import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O QUE ESTES TESTES GUARDAM
//
// Senha digitada às cegas, num teclado de celular, com correção automática a
// atrapalhar. Quem erra uma letra não descobre — descobre quando o sistema
// recusa, e nem aí sabe se errou a senha ou se esqueceu qual era. No cadastro é
// pior: a pessoa repete o engano no campo de confirmação e fica sem entender por
// que "as senhas não conferem".
//
// A ARMADILHA QUE DÁ NOME À METADE DESTE ARQUIVO
//
// O botão do olho fica DENTRO de um `<form>`. Em HTML, um `<button>` sem
// `type` é SUBMIT. Sem `type="button"`, tocar no olho ENVIA o formulário — com
// a senha meio escrita, antes de a pessoa terminar. É o defeito clássico deste
// componente, não dá erro em lado nenhum, e só aparece quando um usuário real
// reclama que "o cadastro enviou sozinho".
// ---------------------------------------------------------------------------

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');
const semComentarios = (codigo: string): string =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const UI = semComentarios(ler('components/ui/index.tsx'));

/**
 * Recorte delimitado — e com teto E chão, pelas duas razões já vividas aqui.
 *
 * TETO: um fecho que não existe no trecho faz o recorte seguir até a próxima
 * ocorrência lá adiante e engolir outras funções. Aconteceu nos testes de
 * sessão, e um `return;` de outra função fez um teste passar por acidente.
 *
 * CHÃO: um fecho que casa CEDO DEMAIS devolve um pedaço vazio, e aí TODAS as
 * asserções falham de uma vez — o que parece defeito do código e é defeito do
 * teste. Aconteceu nesta mesma função: o fecho era `\n}`, e a chave do tipo das
 * propriedades (`}) {`) está na coluna zero, três linhas abaixo do começo.
 *
 * Daí o fecho ser agora a declaração seguinte, que é um limite de verdade.
 */
function corpoDoComponente(): string {
  const abre = UI.indexOf('export function CampoDeSenha');
  expect(abre, 'não achei CampoDeSenha').toBeGreaterThan(-1);
  const fecha = UI.indexOf('const fieldBase', abre);
  expect(fecha, 'não achei o fim do componente').toBeGreaterThan(abre);
  const corte = UI.slice(abre, fecha);
  expect(corte.length, 'o recorte ficou largo demais').toBeLessThan(2500);
  expect(corte.length, 'o recorte ficou curto demais — o fecho casou cedo').toBeGreaterThan(600);
  return corte;
}

describe('o olho para conferir a senha', () => {
  // A REGRESSÃO MAIS IMPORTANTE: tocar no olho envia o formulário.
  it('o botão do olho NÃO envia o formulário', () => {
    expect(corpoDoComponente(), 'sem type="button" o olho vira SUBMIT')
      .toContain('type="button"');
  });

  it('começa escondida — revelar é decisão de quem digita', () => {
    expect(corpoDoComponente()).toContain('useState(false)');
  });

  it('alterna entre esconder e mostrar', () => {
    const corpo = corpoDoComponente();
    expect(corpo).toContain("type={visivel ? 'text' : 'password'}");
    expect(corpo).toContain('setVisivel((v) => !v)');
  });

  // Rótulo fixo deixa quem usa leitor de tela sem saber o que o botão faz.
  it('diz, em palavras, o que o botão vai fazer', () => {
    const corpo = corpoDoComponente();
    expect(corpo).toContain("visivel ? 'Ocultar senha' : 'Mostrar senha'");
    expect(corpo).toContain('aria-label={rotulo}');
    expect(corpo).toContain('aria-pressed={visivel}');
  });

  // Quem navega por Tab quer ir da senha para o botão de entrar, e não parar
  // num atalho visual pelo caminho.
  it('o olho fica fora da ordem do teclado', () => {
    expect(corpoDoComponente()).toContain('tabIndex={-1}');
  });

  // Sem repassar o autoComplete, o gerenciador de senhas do navegador deixa de
  // reconhecer o campo — e a pessoa perde o preenchimento automático.
  it('repassa o autoComplete ao campo de verdade', () => {
    expect(corpoDoComponente()).toContain('autoComplete={autoComplete}');
  });
});

describe('nenhuma tela ficou com campo de senha sem o olho', () => {
  // A REGRESSÃO DE AMANHÃ: alguém acrescenta uma tela com senha e escreve
  // `<Input type="password">` à mão, porque é o que já viu no resto do código.
  it('nenhuma tela usa input de senha cru', () => {
    const culpados: string[] = [];
    for (const pasta of ['screens', 'components']) {
      for (const arquivo of readdirSync(pasta, { recursive: true }) as string[]) {
        if (!String(arquivo).endsWith('.tsx')) continue;
        // O componente do olho é o único lugar onde o input cru pode existir.
        if (String(arquivo).startsWith('ui/')) continue;
        const fonte = semComentarios(ler(`${pasta}/${arquivo}`));
        if (/type="password"/.test(fonte)) culpados.push(`${pasta}/${arquivo}`);
      }
    }
    expect(culpados, `campo de senha sem o olho em:\n${culpados.join('\n')}`).toEqual([]);
  });

  it('as quatro telas que pedem senha usam o componente', () => {
    for (const tela of [
      'screens/Login.tsx', 'screens/Signup.tsx',
      'screens/RedefinirSenha.tsx', 'screens/Settings.tsx',
    ]) {
      expect(semComentarios(ler(tela)), `${tela} não usa CampoDeSenha`)
        .toContain('<CampoDeSenha');
    }
  });

  it('o ícone de esconder existe — senão o botão fica vazio', () => {
    expect(ler('components/ui/Icon.tsx')).toContain('eyeOff:');
  });
});
