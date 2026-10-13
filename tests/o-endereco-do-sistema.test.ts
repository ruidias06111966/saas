import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// O ENDEREÇO DO SISTEMA
//
// O dono reparou que, ao contrário dos outros sistemas da linha QiDomínios,
// este não começava por "qi": estava em `conexao.qidominios.com.br`. Mudou
// para `qiconexao.qidominios.com.br`.
//
// A ARMADILHA QUE ESTE FICHEIRO EXISTE PARA NÃO CAIR
//
// Os três nomes CONTÊM-SE uns aos outros como texto:
//
//        conexao.qidominios.com.br   ← o antigo, que não pode voltar
//      qiconexao.qidominios.com.br   ← o novo       (contém o antigo!)
//   mail.conexao.qidominios.com.br   ← o e-mail     (contém o antigo!)
//
// Um teste escrito com `toContain('conexao.qidominios.com.br')` acusaria os
// três. Um `not.toContain` recusaria o endereço novo e o e-mail. Esta base já
// caiu nessa classe de erro vezes de mais — uma vez o teste do domínio batia
// na própria palavra procurada dentro do nome do serviço.
//
// A saída é olhar para o que vem ANTES: o endereço do site é o único em que
// `conexao` não é precedido de letra, dígito, ponto ou hífen.
//
// O E-MAIL FICA. Decisão do dono, e deliberada: mudar `mail.conexao…` exige
// registos de DNS novos e nova verificação no Resend. Duas mudanças
// arriscadas no mesmo dia tornam impossível saber qual delas partiu.
// ---------------------------------------------------------------------------

const NOVO = 'qiconexao.qidominios.com.br';
const EMAIL = 'mail.conexao.qidominios.com.br';

/** O endereço ANTIGO do site, e só ele — nunca o e-mail, nunca o novo. */
const SO_O_ANTIGO = /(?<![A-Za-z0-9.-])conexao\.qidominios\.com\.br/g;

const ler = (caminho: string): string => readFileSync(caminho, 'utf8');

/** Tudo o que uma pessoa lê, mais o que decide o endereço na publicação. */
const VISIVEIS = [
  'public/manual.html', 'public/termos.html', 'public/privacidade.html',
  'public/diretrizes.html', 'README.md', 'vite.config.ts',
  'scripts/gerar-og.py', '.github/workflows/pages.yml',
];

describe('o endereço do sistema começa por qi, como os outros', () => {
  // PRIMEIRO, A PRÓPRIA FERRAMENTA. Um teste cujo filtro esteja errado dá
  // verde sobre tudo e não guarda nada — e este filtro é a peça inteira.
  it('o filtro distingue os três nomes que se contêm uns aos outros', () => {
    const achar = (t: string) => (t.match(SO_O_ANTIGO) ?? []).length;
    expect(achar('https://conexao.qidominios.com.br/'), 'não apanhou o antigo').toBe(1);
    expect(achar(`https://${NOVO}/`), 'acusou o endereço NOVO').toBe(0);
    expect(achar(`nao-responda@${EMAIL}`), 'acusou o e-mail').toBe(0);
    expect(achar(`O site é ${NOVO} e o e-mail sai de ${EMAIL}.`), 'acusou os dois legítimos').toBe(0);
    expect(achar('mude de conexao.qidominios.com.br para qiconexao.qidominios.com.br'),
      'numa frase com os dois, tem de apanhar só o antigo').toBe(1);
  });

  it.each(VISIVEIS)('%s não traz o endereço antigo', (arquivo) => {
    const achados = ler(arquivo).match(SO_O_ANTIGO) ?? [];
    expect(achados, `${arquivo} ainda manda a pessoa para o endereço antigo`).toEqual([]);
  });

  it('e os documentos que a pessoa lê trazem o novo', () => {
    for (const arquivo of ['public/manual.html', 'public/termos.html', 'public/privacidade.html']) {
      expect(ler(arquivo), `${arquivo} deixou de dizer qual é o endereço`).toContain(NOVO);
    }
  });

  // A CLASSE: qualquer ficheiro do projecto, e não só a lista acima. A
  // documentação do e-mail é a única excepção, e é nomeada — porque lá o
  // endereço antigo aparece como parte do domínio de ENVIO, que não mudou.
  it('nenhum ficheiro do projecto ficou com o endereço antigo', () => {
    const pastas = ['docs', 'scripts', 'public', '.github/workflows'];
    const sobrou: string[] = [];
    for (const pasta of pastas) {
      for (const nome of readdirSync(pasta, { withFileTypes: true })) {
        if (!nome.isFile()) continue;
        const caminho = `${pasta}/${nome.name}`;
        if (/\.(png|ico|pdf|jpg|webp|woff2?)$/.test(caminho)) continue;
        if ((ler(caminho).match(SO_O_ANTIGO) ?? []).length > 0) sobrou.push(caminho);
      }
    }
    // `docs/DOMINIO.md` é o procedimento da troca: tem de nomear o endereço
    // que está a ser abandonado, senão não explica nada.
    expect(sobrou.filter((f) => f !== 'docs/DOMINIO.md'),
      'estes ficheiros ficaram para trás na troca de endereço').toEqual([]);
  });

  it('o e-mail de envio continua intacto — não era para mudar', () => {
    expect(ler('docs/EMAIL.md'), 'o domínio de envio foi mudado sem ninguém pedir')
      .toContain(EMAIL);
  });

  // O endereço não pode voltar a ser escrito no código: quem manda é a
  // variável do GitHub, e é isso que torna a próxima troca barata.
  it('o endereço continua a vir da variável, e não escrito no código', () => {
    expect(ler('vite.config.ts')).toContain('DOMINIO_DO_SITE');
    expect(ler('.github/workflows/pages.yml'), 'o CNAME deixou de sair da variável')
      .toContain('echo "$DOMINIO" > dist/CNAME');
  });

  it('a troca tem o seu procedimento escrito, com a ordem que não parte o login', () => {
    const doc = ler('docs/DOMINIO.md');
    for (const painel of [
      'Cloudflare', 'Redirect URLs', 'URLS_DO_APP', 'Allowed Domains',
      'DOMINIO_DO_SITE', 'Transform Rules',
    ]) {
      expect(doc, `o procedimento não fala de ${painel}`).toContain(painel);
    }
    expect(doc, 'falta a regra que torna a operação segura')
      .toContain('Acrescentar antes de tirar');
    expect(doc, 'falta avisar dos avisos no celular, que são por endereço')
      .toContain('A inscrição é por endereço');
  });
});
