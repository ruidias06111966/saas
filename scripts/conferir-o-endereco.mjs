#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CONFERIR O ENDEREÇO DO SITE, DE FORA
//
// POR QUE ISTO EXISTE
//
// As três coisas que este programa mede falham todas em SILÊNCIO. O site
// continua a abrir, bonito e normal, e mesmo assim:
//
//   · quem tem o endereço antigo guardado vê uma página de erro;
//   · os cabeçalhos de segurança podem ter deixado de ser enviados.
//
// Nenhuma das duas aparece em erro nenhum, em painel nenhum. A única maneira
// de saber é pedir a página de fora e olhar para a resposta — que é o que isto
// faz. Não é teste: fala com a internet, e por isso não corre no `npm run
// build`, que tem de funcionar sem rede.
//
//   node scripts/conferir-o-endereco.mjs
//
// A LIÇÃO QUE O PÔS AQUI
//
// Eu disse ao dono, duas vezes, coisas sobre este assunto que estavam erradas
// porque as deduzi em vez de as medir: uma vez omiti o passo do painel do
// GitHub, outra atribuí a falta dos cabeçalhos a uma regra «presa ao nome
// antigo», quando a causa é outra (o endereço novo não passa pela Cloudflare).
// Um programa que mede não tem opinião — e é mais barato de correr do que eu
// de corrigir.
// ---------------------------------------------------------------------------

const ANTIGO = 'conexao.qidominios.com.br';
const NOVO = 'qiconexao.qidominios.com.br';

// Os seis que a regra da Cloudflare acrescenta. Medidos por subtracção em
// 16/10/2026: o mesmo erro 404 do GitHub, pedido pelos dois endereços, traz
// estes seis a mais quando passa pela Cloudflare — logo, vêm dela, e não do
// GitHub. O `content-security-policy` ficou FORA da lista de propósito: o
// GitHub manda um só dele, e confundi-los daria um verde falso.
const CABECALHOS = [
  'strict-transport-security',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'cross-origin-opener-policy',
  'permissions-policy',
];

const bom = (t) => `  \u001b[32m✓\u001b[0m ${t}`;
const mau = (t) => `  \u001b[31m✗\u001b[0m ${t}`;
const nota = (t) => `    ${t}`;

let falhas = 0;
const falhou = (t) => { falhas += 1; console.log(mau(t)); };

/** Pede a página sem seguir redirecionamentos — o redirecionamento é o alvo. */
async function pedir(url) {
  const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'conferir-o-endereco' } });
  return { status: r.status, destino: r.headers.get('location'), cabecalhos: r.headers };
}

console.log(`\nO endereço do site, conferido de fora — ${new Date().toISOString().slice(0, 10)}\n`);

// ---------------------------------------------------------------------------
console.log(`1. O endereço novo responde?  https://${NOVO}/`);
try {
  const r = await pedir(`https://${NOVO}/`);
  if (r.status === 200) console.log(bom(`responde 200.`));
  else falhou(`respondeu ${r.status} — o site não está a servir aqui.`);
} catch (e) {
  falhou(`não respondeu: ${e.message}`);
}

// ---------------------------------------------------------------------------
console.log(`\n2. O endereço antigo manda para o novo?  https://${ANTIGO}/`);
try {
  // Com caminho e pergunta, para apanhar o redirecionamento que atira tudo
  // para a raiz e perde o link que a pessoa tinha.
  const r = await pedir(`https://${ANTIGO}/termos.html?a=1`);
  if (r.status === 301 || r.status === 302 || r.status === 308) {
    const d = r.destino ?? '';
    if (!d.includes(NOVO)) falhou(`redireciona, mas para \`${d}\` — não é o endereço novo.`);
    else if (!d.includes('/termos.html')) falhou(`redireciona para a raiz e PERDE o caminho: \`${d}\`.`);
    else if (!d.includes('a=1')) falhou(`redireciona, mas perde a pergunta do link: \`${d}\`.`);
    else console.log(bom(`${r.status} para \`${d}\` — caminho e pergunta preservados.`));
  } else {
    falhou(`respondeu ${r.status} em vez de redirecionar.`);
    console.log(nota('Quem tem o endereço antigo guardado vê uma página de erro.'));
    console.log(nota('Falta a Redirect Rule na Cloudflare — ver docs/DOMINIO.md, passo 9.'));
  }
} catch (e) {
  falhou(`não respondeu: ${e.message}`);
}

// ---------------------------------------------------------------------------
console.log(`\n3. Os cabeçalhos de segurança estão a ser enviados?`);
try {
  const r = await pedir(`https://${NOVO}/`);
  const temCloudflare = r.cabecalhos.has('cf-ray');
  const faltam = CABECALHOS.filter((c) => !r.cabecalhos.has(c));
  if (faltam.length === 0) {
    console.log(bom(`os ${CABECALHOS.length} presentes.`));
  } else {
    falhou(`faltam ${faltam.length} de ${CABECALHOS.length}: ${faltam.join(', ')}.`);
    if (!temCloudflare) {
      console.log(nota('O endereço novo NÃO passa pela Cloudflare (não há `cf-ray` na'));
      console.log(nota('resposta), e é a Cloudflare que acrescenta estes cabeçalhos.'));
      console.log(nota('Nenhuma regra dela alcança este endereço — ver docs/DOMINIO.md,'));
      console.log(nota('passo 10, que explica a escolha que isto obriga a fazer.'));
    }
  }
} catch (e) {
  falhou(`não respondeu: ${e.message}`);
}

// ---------------------------------------------------------------------------
console.log(
  falhas === 0
    ? '\nEstá tudo no lugar.\n'
    : `\n${falhas} ${falhas === 1 ? 'coisa' : 'coisas'} por resolver. Nenhuma delas dá erro a quem usa o site.\n`,
);
process.exit(falhas === 0 ? 0 : 1);
