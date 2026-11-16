// Aviso fixo da demonstração publicada no site da QiDomínios. Só aparece no build
// `npm run build:demo` (modo "demo"); em produção a condição é falsa e nada é exibido.
export const MODO_DEMO = import.meta.env.MODE === 'demo';

const WHATSAPP =
  'https://wa.me/5561982750884?text=' +
  encodeURIComponent('Olá! Vi a demonstração do QiConexão e quero saber mais.');

export function FaixaDemo() {
  if (!MODO_DEMO) return null;
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-[13px] text-amber-950">
      <strong>Demonstração</strong> — pessoas, anúncios e propostas são fictícios. Nada aqui é enviado a ninguém
      e o que você fizer fica só neste navegador.{' '}
      <a href={WHATSAPP} target="_blank" rel="noopener" className="font-semibold underline">
        Falar com a QiDomínios
      </a>
    </div>
  );
}
