-- ===========================================================================
-- 030 — A CONVERSA SÓ ACEITAVA IMAGEM
--
-- O PEDIDO, E O QUE ELE REVELOU
--
-- "na conversa não consegui anexar ficheiros". Não era defeito: nunca existiu.
-- A conversa aceitava imagem e mais nada, e havia TRÊS barreiras a dizer isso —
-- o `accept="image/*"` da tela, a lista de tipos do depósito (só JPEG, PNG,
-- WebP, GIF) e a policy de envio, que exige nome terminado em `.jpg`.
--
-- Num mercado de serviços isso é uma falta real: orçamento, contrato, planta e
-- nota fiscal viajam em PDF, não em foto.
--
-- A DECISÃO FOI DO DONO, E ELA TEM UM CUSTO
--
-- Três caminhos estavam em cima da mesa: só PDF, PDF e documentos, ou qualquer
-- ficheiro. O dono escolheu o do meio.
--
-- "Qualquer ficheiro" foi recusado com motivo: a plataforma passaria a carregar
-- um programa de uma pessoa para outra, e quem o entregou seria o QICONEXÃO.
-- Daí a lista aqui ser FECHADA — o que não estiver nela é recusado, e recusado
-- pelo SERVIDOR, não pela tela. Tela se contorna com uma ferramenta de
-- navegador; policy não.
--
-- POR QUE A EXTENSÃO E O TIPO, OS DOIS
--
-- A policy olha a EXTENSÃO do nome; o depósito olha o TIPO declarado. Nenhum
-- dos dois sozinho basta: a extensão pode mentir sobre o conteúdo, e o tipo é
-- declarado por quem envia. Os dois juntos obrigam o engano a ser deliberado
-- nas duas pontas, e nenhum executável passa por nenhuma delas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- O QUE A MENSAGEM PRECISA DE GUARDAR.
--
-- `arquivo_nome` é o nome ORIGINAL, o que a pessoa vê. O nome gravado no
-- depósito é um carimbo de tempo, de propósito: nome de ficheiro vindo de fora
-- é texto de terceiro, e deixá-lo decidir o caminho é como se escreve fora da
-- própria pasta.
--
-- O teto de 120 caracteres não é estética. Nome gigante numa tela de celular
-- empurra o resto da conversa para fora, e é o tipo de coisa que alguém faz de
-- propósito uma vez.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists arquivo_path  text,
  add column if not exists arquivo_nome  text,
  add column if not exists arquivo_bytes integer;

-- ---------------------------------------------------------------------------
-- MENSAGEM DE ARQUIVO SEM ARQUIVO NÃO EXISTE.
--
-- Sem esta restrição, um cliente com defeito grava `kind = 'arquivo'` com os
-- campos vazios, e a conversa fica com uma bolha que não abre nada. O banco
-- recusa antes.
--
-- E o inverso também: quem NÃO é arquivo não carrega caminho de arquivo. É o
-- que impede uma mensagem de texto de passar a transportar um ficheiro sem
-- ninguém ver.
-- ---------------------------------------------------------------------------
alter table public.messages drop constraint if exists arquivo_tem_arquivo;
alter table public.messages add constraint arquivo_tem_arquivo check (
  case
    when kind = 'arquivo' then
      arquivo_path is not null
      and arquivo_nome is not null
      and length(btrim(arquivo_nome)) between 1 and 120
      and arquivo_bytes is not null
      and arquivo_bytes between 1 and 8388608
    else
      arquivo_path is null and arquivo_nome is null and arquivo_bytes is null
  end
);

-- ---------------------------------------------------------------------------
-- O DEPÓSITO PASSA A ACEITAR OS TIPOS ESCOLHIDOS.
--
-- Esta é a primeira das duas grades. O teto de 8 MB não sobe: é o mesmo das
-- imagens, está escrito no manual, e um número só é mais fácil de explicar do
-- que dois.
-- ---------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ]
 where id = 'midia';

-- ---------------------------------------------------------------------------
-- E A SEGUNDA GRADE: AS POLICIES.
--
-- ACRESCENTADAS, E NÃO SUBSTITUÍDAS — e a escolha é deliberada.
--
-- A primeira versão desta migração reescrevia as policies existentes para
-- caberem as duas pastas. Funcionava, mas tinha dois custos: tocava numa regra
-- que já estava certa (a da imagem, em produção, usada), e qualquer engano meu
-- ao recopiá-la quebraria o que funcionava.
--
-- Policies permissivas somam-se: basta UMA deixar passar. Então uma regra nova,
-- que fala só da pasta `arquivo/`, dá o mesmo resultado sem pôr a mão na outra.
-- Quem ler daqui a um ano vê duas regras curtas em vez de uma longa com um `or`
-- no meio — e a da imagem continua exatamente como foi escrita e provada.
--
-- `~*` e não `~`: o celular manda `.PDF` com a mesma naturalidade com que manda
-- `.pdf`, e recusar por causa da caixa das letras seria um defeito que ninguém
-- entenderia.
-- ---------------------------------------------------------------------------
create policy "dono envia arquivo de conversa"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'midia'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'arquivo'
  and name ~* '\.(pdf|doc|docx|xls|xlsx)$'
);

create policy "dono atualiza o próprio arquivo de conversa"
on storage.objects for update to authenticated
using (
  bucket_id = 'midia'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'arquivo'
  and name ~* '\.(pdf|doc|docx|xls|xlsx)$'
);

-- ---------------------------------------------------------------------------
-- QUEM LÊ O FICHEIRO: EXATAMENTE QUEM JÁ LIA A IMAGEM.
--
-- A regra não é nova — o dono, ou alguém com conexão ABERTA com ele. É copiada
-- da policy da imagem de propósito, palavra por palavra, trocando só a pasta:
-- se as duas forem a mesma coisa, têm de dizer a mesma coisa.
--
-- Note o que isto significa: um ficheiro de conversa não é alcançável por quem
-- não está do outro lado dela, nem por quem bloqueou ou foi bloqueado. O
-- endereço é assinado e expira; adivinhar o caminho não serve de nada.
-- ---------------------------------------------------------------------------
create policy "arquivo de conversa entre conectados"
on storage.objects for select to authenticated
using (
  bucket_id = 'midia'
  and (storage.foldername(name))[2] = 'arquivo'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.connections c
       where c.status = 'conectada'
         and (
              (c.user_a = (select auth.uid()) and c.user_b::text = (storage.foldername(name))[1])
           or (c.user_b = (select auth.uid()) and c.user_a::text = (storage.foldername(name))[1])
         )
    )
  )
);

-- ---------------------------------------------------------------------------
-- APAGAR já estava coberto: "dono apaga a própria pasta" vale para o bucket
-- inteiro, sem olhar a subpasta. Não há nada a acrescentar, e acrescentar uma
-- regra redundante seria dar a entender que faltava.
-- ---------------------------------------------------------------------------
