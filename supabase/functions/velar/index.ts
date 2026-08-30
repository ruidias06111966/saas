// ---------------------------------------------------------------------------
// CONEXÃO — geração do Véu no servidor.
//
// O QUE ESTA FUNÇÃO FECHA
// O Véu é uma pirâmide de resoluções: 12, 24, 48 e 96 pixels de largura, mais o
// original. O Storage decide qual nível cada pessoa pode baixar, a partir do
// estágio real da conversa (private.nivel_permitido).
//
// Até aqui os níveis velados eram gerados no NAVEGADOR de quem sobe a foto. O
// portão de leitura sempre foi do servidor — ninguém nunca conseguiu ver a foto
// alheia antes da hora —, mas quem subia escolhia o conteúdo dos próprios
// níveis borrados e podia mandar um "nível 0" nítido, revelando-se cedo demais
// para todo mundo. Agora o cliente entrega só o original e quem gera os níveis
// é esta função, com service_role. A política do Storage foi ajustada junto:
// o cliente só consegue escrever `-orig.jpg`.
//
// FALHA FECHADA, POR CONSTRUÇÃO
// Se a geração falhar, os níveis velados simplesmente não existem. Quem não tem
// direito ao original pede `-2.jpg`, recebe 404 e cai no retrato generativo —
// nunca no original. Nenhum caminho de erro revela mais do que devia.
// ---------------------------------------------------------------------------

import {
  ImageMagick, initializeImageMagick, MagickFormat,
} from 'npm:@imagemagick/magick-wasm@0.0.30';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Carregado uma vez por isolate, na avaliação inicial do script.
const wasmBytes = await Deno.readFile(
  new URL('magick.wasm', import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.30')),
);
await initializeImageMagick(wasmBytes);

const BUCKET = 'midia';
/** Larguras dos níveis velados. O índice é o nível. */
const LARGURAS = [12, 24, 48, 96];
const QUALIDADE = 70;
/** O original é gravado pelo cliente já reduzido; acima disto é abuso. */
const MAX_BYTES = 2 * 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** `<uuid>/perfil/<carimbo>` e nada mais: sem `..`, sem subpasta, sem extensão. */
const BASE_VALIDA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/perfil\/\d{10,20}$/;

function velar(original: Uint8Array, largura: number): Uint8Array {
  return ImageMagick.read(original, (img) => {
    const escala = Math.min(1, largura / img.width);
    img.resize(Math.max(1, Math.round(img.width * escala)),
               Math.max(1, Math.round(img.height * escala)));
    // A miniatura é a proteção: 12 pixels de largura não têm rosto a recuperar.
    // O metadado do original também não acompanha o arquivo reduzido.
    img.strip();
    img.quality = QUALIDADE;
    return img.write(MagickFormat.Jpeg, (dados) => new Uint8Array(dados));
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ erro: 'Use POST.' }, 405);

  const autorizacao = req.headers.get('Authorization');
  if (!autorizacao) return responder({ erro: 'É preciso estar autenticado.' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
  if (!url || !anon || !servico) {
    console.error('[velar] ambiente incompleto');
    return responder({ erro: 'Serviço indisponível.' }, 503);
  }

  // Quem é quem: validado contra o GoTrue, não por leitura do token.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: sessao, error: erroAuth } = await comoUsuario.auth.getUser();
  const uid = sessao?.user?.id;
  if (erroAuth || !uid) return responder({ erro: 'Sessão inválida.' }, 401);

  let body: { base?: string };
  try {
    body = await req.json();
  } catch {
    return responder({ erro: 'Corpo inválido.' }, 400);
  }

  const base = String(body.base ?? '');
  if (!BASE_VALIDA.test(base)) return responder({ erro: 'Caminho inválido.' }, 400);
  // Só a própria pasta. Sem isto a função viraria um serviço de processamento
  // de imagem sobre arquivos alheios.
  if (!base.startsWith(`${uid}/perfil/`)) return responder({ erro: 'Caminho de outra pessoa.' }, 403);

  // service_role para ler o original e gravar os níveis velados — justamente os
  // caminhos que a política do Storage proíbe ao cliente.
  const db = createClient(url, servico, { auth: { persistSession: false } });

  const { data: arquivo, error: erroDown } = await db.storage
    .from(BUCKET).download(`${base}-orig.jpg`);
  if (erroDown || !arquivo) {
    return responder({ erro: 'Original não encontrado.' }, 404);
  }
  if (arquivo.size > MAX_BYTES) {
    return responder({ erro: 'Imagem grande demais.' }, 413);
  }

  const original = new Uint8Array(await arquivo.arrayBuffer());

  try {
    for (let nivel = 0; nivel < LARGURAS.length; nivel++) {
      const reduzida = velar(original, LARGURAS[nivel]);
      const { error } = await db.storage.from(BUCKET).upload(
        `${base}-${nivel}.jpg`, reduzida,
        { contentType: 'image/jpeg', upsert: true },
      );
      if (error) throw error;
    }
  } catch (err) {
    console.error('[velar] falha ao gerar a pirâmide', err);
    // Deixa o que já subiu: são níveis MAIS velados, nunca menos. O cliente
    // trata a falha apagando o original, e nada fica visível pela metade.
    return responder({ erro: 'Falha ao preparar a imagem.' }, 500);
  }

  return responder({ ok: true, niveis: LARGURAS.length });
});
