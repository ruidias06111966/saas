// Depois do build da demonstração: confere que nenhum endereço ou chave do banco real entrou
// no pacote e impede que buscadores indexem a demonstração.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = 'dist-demo';
writeFileSync(join(raiz, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// Os padrões genéricos ("sb_publishable_", "*.supabase.co") existem dentro da própria biblioteca do
// Supabase; o que não pode aparecer é um endereço de projeto ou uma chave de verdade.
const proibidos = [/nnacatollqstrziwlmlt/, /sb_publishable_[A-Za-z0-9_-]{10,}/, /https:\/\/[a-z0-9]{20}\.supabase\.co/, /eyJhbGciOi[A-Za-z0-9_-]{20,}/];
const achados = [];
const varrer = (dir) => {
  for (const f of readdirSync(dir)) {
    const c = join(dir, f);
    if (statSync(c).isDirectory()) varrer(c);
    else if (/\.(js|html|css|json|txt|webmanifest)$/.test(f)) {
      const t = readFileSync(c, 'utf8');
      for (const p of proibidos) if (p.test(t)) achados.push(`${c}: ${p}`);
    }
  }
};
varrer(raiz);
if (achados.length) {
  console.error('A demonstração contém dados do sistema real:\n' + achados.join('\n'));
  process.exit(1);
}
console.log('Demonstração pronta em dist-demo/ (sem dados do sistema real).');
