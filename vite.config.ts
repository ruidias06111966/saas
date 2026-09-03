import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// A chave do Gemini e lida de GEMINI_API_KEY (padrao Google AI Studio) ou API_KEY.
// O app funciona 100% sem chave: os servicos de IA caem em heuristicas locais.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // No GitHub Pages o site fica em /saas/, não na raiz do domínio.
  // Localmente continua em / — por isso a base é condicional.
  const base = env.GITHUB_PAGES === 'true' ? '/saas/' : '/';

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
