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
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
    },
    server: { port: 5173, host: true },
    build: { outDir: 'dist', sourcemap: false },
  };
});
