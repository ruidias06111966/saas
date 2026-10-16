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
    // DUAS excepções, e as duas pela MESMA razão: nomear o endereço antigo é
    // o trabalho delas, não um esquecimento.
    //
    //   `docs/DOMINIO.md`                 — o procedimento da troca. Sem
    //                                       nomear o que se abandona, não
    //                                       explica nada.
    //   `scripts/conferir-o-endereco.mjs` — pede a página NO endereço antigo
    //                                       para ver se ela redireciona. Tirar
    //                                       o nome de lá era tirar o teste.
    //
    // A lista é nomeada, e não um filtro mais largo, de propósito: cada
    // excepção nova tem de ser escrita à mão e justificada aqui.
    const PODEM_NOMEAR_O_ANTIGO = ['docs/DOMINIO.md', 'scripts/conferir-o-endereco.mjs'];
    expect(sobrou.filter((f) => !PODEM_NOMEAR_O_ANTIGO.includes(f)),
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

  // O BURACO QUE CUSTOU UM 404 EM PRODUÇÃO.
  //
  // Na primeira versão deste procedimento eu omiti o painel do GitHub Pages:
  // dei por suposto que o ficheiro `CNAME`, escrito pela publicação, bastava
  // para o GitHub servir no nome novo. Não basta. Tudo o mais estava certo e o
  // endereço novo respondia 404 — e o `CNAME` estava publicado e servido, o
  // que torna a suposição difícil de desconfiar sozinha.
  //
  // Um documento é o melhor esconderijo para esta classe de erro: ninguém o
  // corre. Então o teste corre-o.
  //
  // E A AFIRMAÇÃO TEM DE BATER NO PASSO, NÃO NO DOCUMENTO INTEIRO.
  //
  // A primeira versão deste teste procurava `Settings → Pages` em qualquer
  // lugar do ficheiro. Apaguei o caminho de dentro do passo e o teste passou:
  // encontrou-o na tabela-resumo lá em cima. Mesma classe de erro que esta
  // base já apanhou uma dúzia de vezes — a procura acerta no sítio errado. A
  // saída é recortar o passo e procurar SÓ lá dentro.
  it('o procedimento manda reivindicar o nome no painel do GitHub Pages', () => {
    const doc = ler('docs/DOMINIO.md');
    const passo = doc.slice(
      doc.indexOf('## Passo 7'),
      doc.indexOf('## Passo 8'),
    );
    expect(passo.length, 'recorte do passo 7 largo demais').toBeLessThan(2600);
    expect(passo.length, 'o passo 7 desapareceu do documento').toBeGreaterThan(400);

    expect(passo, 'o passo 7 voltou a não nomear o campo do painel')
      .toContain('Custom domain');
    expect(passo, 'o passo 7 não diz em que painel se preenche o domínio próprio')
      .toMatch(/Settings\*{0,2} → \*{0,2}Pages/);
    // E tem de continuar a dizer POR QUE o ficheiro não bastou — sem isso, o
    // passo parece burocracia e o próximo a ler salta-o.
    expect(passo, 'deixou de explicar por que o ficheiro CNAME não é suficiente')
      .toContain('não é suficiente');
  });

  // OS SEIS CABEÇALHOS, E O SÉTIMO QUE NÃO ENTRA NA CONTA.
  //
  // Medidos por subtracção: o mesmo erro 404 do GitHub, pedido pelos dois
  // endereços, traz seis cabeçalhos a mais quando passa pela Cloudflare. O
  // `content-security-policy` aparece nos DOIS — é do GitHub — e metê-lo na
  // lista daria um verde falso justamente no dia em que a regra caísse.
  const SEIS = [
    'strict-transport-security', 'x-frame-options', 'x-content-type-options',
    'referrer-policy', 'cross-origin-opener-policy', 'permissions-policy',
  ];

  it('o programa que confere de fora olha para os seis, e não confunde o sétimo', () => {
    const programa = ler('scripts/conferir-o-endereco.mjs');
    const lista = programa.slice(
      programa.indexOf('const CABECALHOS = ['),
      programa.indexOf('];', programa.indexOf('const CABECALHOS = [')),
    );
    expect(lista.length, 'recorte da lista de cabeçalhos largo demais').toBeLessThan(400);
    for (const c of SEIS) {
      expect(lista, `o programa deixou de conferir ${c}`).toContain(c);
    }
    expect(lista, 'o `content-security-policy` entrou na lista — o GitHub manda um só dele, e isso dá verde falso')
      .not.toContain('content-security-policy');
  });

  // MESMA ARMADILHA, SEGUNDA VEZ: procurar os seis no documento inteiro dava
  // verde depois de eu apagar uma linha da tabela, porque `permissions-policy`
  // também aparece no texto em volta. A medição é a TABELA — é ela que se
  // recorta.
  it('e o documento guarda a medição dos seis, para não encolher em silêncio', () => {
    const doc = ler('docs/DOMINIO.md');
    const inicio = doc.indexOf('| Cabeçalho |');
    const tabela = doc.slice(inicio, doc.indexOf('\n\n', inicio));
    expect(inicio, 'a tabela da medição desapareceu do documento').toBeGreaterThan(-1);
    expect(tabela.length, 'recorte da tabela largo demais').toBeLessThan(900);

    for (const c of SEIS) {
      expect(tabela, `a tabela da medição perdeu a linha de ${c}`).toContain(c);
    }
    // O sétimo tem de continuar na tabela, e marcado como sendo do GitHub: é a
    // linha que impede alguém de o contar como um dos seis.
    expect(tabela, 'a tabela deixou de distinguir o cabeçalho que é do GitHub')
      .toContain('content-security-policy');

    expect(doc, 'deixou de dizer que o endereço novo não passa pela Cloudflare — que é a causa')
      .toMatch(/não passa pela Cloudflare/);
  });
});
