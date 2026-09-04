import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// A chave do Gemini e lida de GEMINI_API_KEY (padrao Google AI Studio) ou API_KEY.
// O app funciona 100% sem chave: os servicos de IA caem em heuristicas locais.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // ONDE O SITE VIVE, e por que isto é uma variável e não uma constante.
  //
  //   sem domínio próprio → ruidias06111966.github.io/saas/  → base "/saas/"
  //   com domínio próprio → conexao.qidominios.com.br/       → base "/"
  //
  // Com domínio próprio o site passa a viver na RAIZ. Se a base continuasse em
  // "/saas/", o navegador procuraria cada arquivo em
  // `conexao.qidominios.com.br/saas/assets/…`, que não existe — e o resultado
  // seria PÁGINA EM BRANCO: o HTML carrega, todo o resto dá 404, e nenhum erro
  // explica o motivo em lugar nenhum.
  //
  // Por isso a troca é uma variável de repositório, e não uma edição de código:
  // `DOMINIO_DO_SITE` em Settings → Secrets and variables → Actions →
  // Variables. Vazia, nada muda. Preenchida, o site muda de endereço e o
  // workflow escreve o CNAME que o GitHub Pages exige.
  //
  // ATENÇÃO: mudar esta variável sozinha quebra o login e o pagamento. Outros
  // três lugares apontam para o mesmo endereço e precisam mudar juntos — o
  // workflow lembra quais no log da publicação.
  const dominioProprio = env.DOMINIO_DO_SITE?.trim();
  const base = dominioProprio ? '/' : (env.GITHUB_PAGES === 'true' ? '/saas/' : '/');

  return {
    base,
    plugins: [react()],
    // Havia aqui um `define` que injetava a chave do Gemini como
    // `process.env.API_KEY`. Nenhum código do cliente a lia — verificado — mas
    // era uma armadilha carregada: bastava alguém reintroduzir essa leitura
    // para a chave ir inteira dentro do pacote que qualquer visitante baixa.
    // A chave vive nos segredos do Supabase e só a Edge Function `copiloto` a
    // enxerga. Ver docs/ARQUITETURA.md.
    server: { port: 5173, host: true },
    build: { outDir: 'dist', sourcemap: false },
  };
});
