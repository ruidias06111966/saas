# E-mail do CONEXÃO

Roteiro para tirar a autenticação do e-mail interno do Supabase e colocá-la num
SMTP próprio. Escrito para ser seguido de cima para baixo, sem pular.

---

## O que ficou valendo neste projeto

O roteiro abaixo é genérico de propósito — os outros sistemas vão repeti-lo com
outro subdomínio. Estes são os valores que o CONEXÃO usa hoje:

| coisa | valor |
|---|---|
| Domínio registrado | `qidominios.com.br` (DNS na Cloudflare) |
| Domínio de envio, verificado no Resend | `mail.conexao.qidominios.com.br` (região São Paulo) |
| Remetente | `nao-responda@mail.conexao.qidominios.com.br` |
| DMARC | `_dmarc.qidominios.com.br` = `v=DMARC1; p=reject; rua=mailto:qidominio@gmail.com` |

**O padrão para os próximos sistemas:** cada um envia por
`mail.<sistema>.qidominios.com.br`, verificado separadamente no Resend. A raiz
`qidominios.com.br` nunca envia — ela tem `v=spf1 -all` e `MX 0 .`, que é o modo
de dizer "daqui não sai e-mail nenhum". Assim a reputação de um sistema não
contamina a dos outros, e o DMARC da raiz vale para todos sem precisar repetir.

---

## Por que trocar

O serviço de e-mail embutido do Supabase **não serve para gente de verdade**, e
isso não é opinião: durante os testes deste projeto ele devolveu `429` (limite
excedido) com poucos envios seguidos. Duas limitações, ambas documentadas pelo
próprio Supabase:

- **Poucos envios por hora.** O suficiente para você testar, não para um
  cadastro público.
- **Em projeto novo, só entrega para o e-mail dono do projeto.** Qualquer outra
  pessoa que se cadastre simplesmente não recebe nada — e o app não tem como
  saber disso. O cadastro fica preso esperando uma confirmação que nunca chega.

O segundo é o grave: falha silenciosa, do lado de fora, sem erro em lugar nenhum.

## A decisão do remetente, e por que ela vem antes de tudo

Todo serviço de SMTP exige provar que você pode enviar por aquele remetente. Há
dois jeitos:

| forma | o que exige | entrega bem? |
|---|---|---|
| **Verificar um domínio** | mexer no DNS do domínio | sim |
| Verificar um endereço só | clicar num link de confirmação | não, e piora com o tempo |

O segundo caminho parece mais fácil e é uma armadilha. Enviar "de" um
`@gmail.com` através de outro serviço faz o próprio Gmail e o Outlook
desconfiarem — o endereço diz que é do Gmail, mas o servidor que entregou não é
do Gmail. Desde 2024 os dois apertaram essa checagem para quem envia em volume,
e o resultado é parte do cadastro caindo em spam sem ninguém perceber.

**Este projeto usa domínio próprio.** O resto do documento assume isso.

---

## 1. Registrar o domínio

No [registro.br](https://registro.br), para um `.com.br`. Precisa de CPF ou
CNPJ, e custa por volta de R$ 40 por ano.

Guarde o acesso: você vai precisar voltar nele no passo 3, para mexer no DNS.

Um domínio próprio também serve para o site sair de
`ruidias06111966.github.io/saas` e passar a ser o seu endereço — mas isso é
outro assunto, e não precisa ser feito agora.

## 2. Criar a conta no serviço de envio

**[Resend](https://resend.com)**, plano gratuito: 3.000 e-mails por mês, até 100
por dia. Sobra para o começo — 100 cadastros num único dia já seria um bom
problema para ter.

> Se um dia 100 por dia apertar, o [Brevo](https://brevo.com) dá 300 por dia no
> plano gratuito e o resto do roteiro é igual, trocando só o endereço do
> servidor e o usuário.

Dentro do Resend: **Domains → Add Domain**.

Informe **um subdomínio de envio**, não o domínio raiz: `mail.conexao.<seu
domínio>`. A raiz fica de fora de propósito — se um dia um sistema queimar a
reputação, ela queima só a do próprio subdomínio.

Escolha a região mais próxima de quem recebe (**São Paulo**, para o Brasil).
Ela entra no registro MX e não dá para trocar depois sem refazer o domínio.

Ele vai mostrar uma lista de registros DNS. Deixe essa tela aberta.

> O Resend oferece configurar o DNS sozinho, se você conectar a conta do
> provedor. **Recuse.** Isso dá a ele permissão de escrita na sua zona inteira,
> para economizar três cópias e colas.

## 3. Provar que o domínio é seu

Vá ao provedor de DNS do domínio — neste projeto, a **Cloudflare** (o domínio é
do registro.br, mas os servidores de nome apontam para a Cloudflare, que é onde
a zona é editada). Em **DNS → Records**, copie para lá, um por um, os registros
que o Resend mostrou.

Na Cloudflare, deixe o **Proxy status** em `DNS only` (nuvem cinza) para todos
eles. Registro de e-mail não passa por proxy.

São três tipos, e vale entender o que cada um faz, porque é o que separa "chega
na caixa de entrada" de "chega no spam":

| registro | o que diz |
|---|---|
| **SPF** | quais servidores têm permissão de enviar em nome do seu domínio |
| **DKIM** | assina cada e-mail com uma chave, provando que não foi adulterado no caminho |
| **DMARC** | o que fazer quando um e-mail falha nos dois de cima |

Copie exatamente como o Resend mostra, incluindo pontos finais quando houver.
Um caractere errado e a verificação não passa.

O DNS demora a se espalhar: pode levar de alguns minutos a algumas horas. No
Resend, o domínio fica `Pending` e vira `Verified` sozinho. **Não siga em frente
antes de ver `Verified`.**

### O DMARC, que o Resend deixa opcional

Vale acrescentar mesmo assim: um registro `TXT` com nome `_dmarc`, **na raiz do
domínio**. A política é herdada por todos os subdomínios, então este é o único
lugar onde ela precisa existir — não crie um `_dmarc` para cada sistema.

```
v=DMARC1; p=reject; rua=mailto:seu-email@exemplo.com
```

Duas escolhas dentro dessa linha, e nenhuma é óbvia:

- **`p=reject`** manda o servidor de destino recusar o que falhar. É o mais
  duro, e aqui é seguro porque o DKIM do Resend assina exatamente o domínio que
  aparece no remetente — o alinhamento é perfeito, e nada legítimo falha. Se a
  Cloudflare já tiver criado esse registro sozinha ao abrir a zona (ela faz
  isso), mantenha o `p=reject` que veio.
- **`rua=`** é o endereço que recebe os relatórios. Sem ele, `p=reject` rejeita
  **em silêncio**: se um dia algo sair desalinhado, as mensagens somem e ninguém
  descobre. Esse endereço é o que transforma a política em algo observável.

Os relatórios começam a chegar em 1 a 3 dias, um por dia, como XML zipado. São
ilegíveis a olho nu e não precisam ser lidos — existem para o dia em que o
e-mail parar de chegar e você precisar saber por quê.

**Confira que só existe um `_dmarc`.** Dois valores no mesmo nome invalidam os
dois: o DNS não escolhe, ele desiste.

## 4. Pegar a chave de envio

No Resend: **API Keys → Create API Key**, permissão de envio.

Ela aparece **uma única vez**. Copie e guarde num lugar seguro.

> **Não mande essa chave por chat, nem para mim.** Ela vai direto do Resend para
> o painel do Supabase. Chave que passa por uma conversa é chave que precisa ser
> trocada depois.

## 5. Ligar no Supabase

No painel do projeto: **Authentication → Emails → SMTP Settings**, e ligue
*Enable Custom SMTP*.

| campo | valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a chave do passo 4 |
| Sender email | `nao-responda@mail.conexao.qidominios.com.br` |
| Sender name | `CONEXÃO` |

O **Username é literalmente a palavra `resend`**, igual para todo mundo — não é
o seu e-mail nem o nome da chave. É o tropeço mais comum deste passo.

O remetente **precisa ser do domínio que você verificou** — com o `mail.` na
frente. Um remetente `@qidominios.com.br` seria recusado pelo Resend: a raiz não
está verificada, e não deve estar.

`nao-responda@` não precisa existir como caixa de entrada — ninguém vai
responder para ele. Se preferir um endereço que receba respostas, use um que
exista de verdade.

## 6. Levantar o limite de envios

Este passo é fácil de esquecer e desfaz tudo o que veio antes.

Em **Authentication → Rate Limits**, o limite de e-mails por hora continua no
valor baixo do serviço embutido mesmo depois de ligar o SMTP próprio. Suba para
algo compatível com o seu plano — com o gratuito do Resend, 100 por hora é um
teto coerente com os 100 por dia.

## 7. Autorizar os endereços de volta

**Este é o passo que quebra tudo, e ele não parece perigoso.** Foi o que
aconteceu aqui em 04/09/2026: SMTP perfeito, e-mail na caixa de entrada,
remetente alinhado — e o link levava a pessoa para `localhost:3000`.

Em **Authentication → URL Configuration**:

- **Site URL**: `https://ruidias06111966.github.io/saas/`
- **Redirect URLs**, uma por linha:
  - `https://ruidias06111966.github.io/saas/`
  - `https://ruidias06111966.github.io/saas/**`
  - `https://conexao.qidominios.com.br/**` (para o dia da troca de endereço)

### Por que o app mandar o destino não basta

O app manda o destino explicitamente a cada envio (`emailRedirectTo`, em
`services/auth.ts`). Seria razoável supor que isso resolve. Não resolve, e o
motivo é o detalhe que custa caro:

**Um destino fora da lista não é recusado — é substituído.** O Supabase ignora
o que o app pediu e usa o `Site URL`, cujo padrão de fábrica é
`http://localhost:3000`. Não há erro, log ou alerta em lugar nenhum. A pessoa
recebe o e-mail, clica, e aterrissa num endereço que só existe na máquina de
quem programa.

Por isso a lista precisa conter o endereço **exato** que o app envia, e não só
algo parecido.

### O falso alarme que vem junto

Ao cair em `localhost`, a URL costuma trazer também
`error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`.

**Ignore esse erro — ele quase sempre é consequência, não causa.** O link de
confirmação vale **uma única vez**; ao recarregar a página quebrada, o mesmo
token é apresentado de novo e o Supabase recusa, corretamente. Confira em
`auth.users`: se `email_confirmed_at` estiver preenchido, o primeiro clique
funcionou e o único problema é o endereço.

```sql
select email, confirmation_sent_at, email_confirmed_at
from auth.users where email = 'ENDERECO_DE_TESTE';
```

### O limite da lista é de segurança, não de burocracia

Não use curinga largo (`https://**`). Essa lista é o que impede alguém de
forjar um link de recuperação que entrega a **sessão da pessoa** num site de
terceiros. Ela precisa ser estreita: os endereços que você realmente controla,
e mais nenhum.

---

## Os textos dos e-mails

Os modelos do Supabase vêm **em inglês**. Um app brasileiro mandando
"Confirm your signup" para quem acabou de se cadastrar é ruído logo no primeiro
contato.

Em **Authentication → Emails → Templates**, troque o conteúdo. Abaixo, prontos
para colar.

A lista de modelos é longa, mas **o app só dispara dois deles hoje**:

| modelo no painel | quem dispara | traduzir? |
|---|---|---|
| **Confirm sign up** | `signUp()`, em `services/auth.ts` | **sim** |
| **Reset password** | `pedirRedefinicao()`, em `services/auth.ts` | **sim** |
| Invite user | ninguém — o app não convida | não |
| Magic link or OTP | ninguém — o login é só por senha | não |
| Change email address | ninguém ainda; o app não deixa trocar e-mail | quando deixar |
| Reauthentication | ninguém | não |
| Os da seção *Security* | avisos de segurança do próprio Supabase, se ligados | opcional |

Os da seção **Security** (senha alterada, e-mail alterado, método de login
adicionado) são avisos que o Supabase manda sozinho quando a conta muda. Não
dependem de código nenhum e são bons de ter — mas continuam em inglês até
alguém traduzi-los, e nenhum cadastro depende disso.

### Confirm sign up

Assunto:

```
Confirme seu cadastro no CONEXÃO
```

Corpo:

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
        <tr>
          <td>
            <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a7f74">CONEXÃO</p>
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#2b2520">Falta um clique</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a423b">
              Confirme que este endereço é seu e seu perfil fica pronto. É o mesmo
              cuidado que a gente pede de todo mundo aqui — por isso do outro lado
              também tem gente de verdade.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:8px;background:#b4573c">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">
                    Confirmar meu e-mail
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a7f74">
              Se o botão não funcionar, copie e cole este endereço no navegador:<br>
              <span style="color:#4a423b;word-break:break-all">{{ .ConfirmationURL }}</span>
            </p>
            <p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #eee7df;font-size:13px;line-height:1.6;color:#8a7f74">
              Não foi você que se cadastrou? Ignore este e-mail. Sem o clique,
              nada é criado.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

### Reset Password

**Este modelo está em uso.** A tela de "esqueci minha senha" existe desde
03/09/2026, e é o único caminho de volta para quem perde a senha — sem SMTP
funcionando, a pessoa perde a conta e as conversas dentro dela.

Vale saber por que o link é curto de validade: ele **cria uma sessão de
verdade** ao ser aberto. Quem tiver o link tem a conta pelo tempo que ele durar.

Assunto:

```
Redefinir sua senha do CONEXÃO
```

Corpo:

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
        <tr>
          <td>
            <p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a7f74">CONEXÃO</p>
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#2b2520">Vamos trocar sua senha</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a423b">
              Você pediu para redefinir a senha. O link abaixo vale por uma hora.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-radius:8px;background:#b4573c">
                  <a href="{{ .ConfirmationURL }}"
                     style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">
                    Criar uma senha nova
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a7f74">
              Se o botão não funcionar, copie e cole este endereço no navegador:<br>
              <span style="color:#4a423b;word-break:break-all">{{ .ConfirmationURL }}</span>
            </p>
            <p style="margin:20px 0 0;padding-top:20px;border-top:1px solid #eee7df;font-size:13px;line-height:1.6;color:#8a7f74">
              Não foi você que pediu? Ignore este e-mail — sua senha atual
              continua valendo, e ninguém consegue trocá-la sem este link.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

Os outros modelos podem ficar como estão — ver a tabela no começo desta seção.

---

## Onde cada credencial mora

Nenhuma delas entra no repositório, no `.env` do app ou em variável do GitHub.
Tudo que está nesses lugares acaba dentro do JavaScript que o navegador baixa.

| Coisa | Onde vive | Quem enxerga |
|---|---|---|
| Senha SMTP (a API Key do provedor) | **Painel do Supabase** → Authentication → Emails → SMTP Settings | só o servidor de autenticação |
| Remetente e nome de exibição | mesmo lugar | — |
| Limite de envios por hora | Authentication → Rate Limits | — |
| `Site URL` e `Redirect URLs` | Authentication → URL Configuration | — |

**Configuração externa, que depende do provedor escolhido e não pode ser
inventada aqui:** o host SMTP, a porta, o usuário, a chave, e os valores exatos
dos registros SPF, DKIM e DMARC. Todos vêm da tela do provedor no momento em que
você adiciona o domínio — copie de lá, não daqui.

O único valor deste documento que é do projeto, e não do provedor, é o endereço
de retorno: `https://ruidias06111966.github.io/saas/` enquanto o site estiver no
GitHub Pages.

---

## Conferir que funcionou

Não confie no "salvou sem erro". Teste com um endereço **que não seja o dono do
projeto** — é justamente esse caso que o serviço embutido não atendia.

1. Abra o app e cadastre-se com um endereço que não seja o do dono. Não precisa
   de uma segunda caixa: no Gmail, `voce+teste@gmail.com` chega na sua caixa
   normal, mas para o Supabase é um endereço **diferente** — que é exatamente a
   condição que se quer testar.
2. O e-mail deve chegar em segundos, **em português**, com o remetente do seu
   domínio.
3. Clique no botão. Você tem que cair no app, logado — não em `localhost`, não
   numa página de erro.
4. No Resend, em **Logs**, o envio aparece com status `Delivered`.

Se cair no spam mesmo com tudo verificado, espere: domínio novo tem reputação
zero e ela se constrói com o tempo. Se cair em `localhost`, o problema é o
passo 7.

---

## O que continua faltando depois disto

### Mudar o site de endereço

O código já está preparado: preencher a variável de repositório
`DOMINIO_DO_SITE` (Settings → Secrets and variables → Actions → Variables) com,
por exemplo, `conexao.qidominios.com.br` faz o build sair na raiz do domínio e
o workflow escrever o `CNAME` que o GitHub Pages exige. Vazia, nada muda.

**Mas a variável sozinha não basta.** Outros três lugares apontam para o
endereço do site, e se um ficar para trás o login ou o pagamento quebra sem
erro visível:

| # | Onde |
|---|---|
| 1 | Supabase → Authentication → URL Configuration → **Site URL** |
| 2 | Supabase → Authentication → URL Configuration → **Redirect URLs** |
| 3 | Supabase → Edge Functions → Secrets → **`URLS_DO_APP`** |

O log da publicação repete essa lista sempre que a variável estiver preenchida,
e o passo "Conferir o pacote publicado" **aborta** se a base do pacote não
bater com o destino — a falha aqui seria página em branco, com 404 em cada
arquivo e nenhuma explicação.

Do lado do DNS, um registro na Cloudflare:
`CNAME  conexao → ruidias06111966.github.io`, com o proxy **desligado**
("DNS only"). Com a nuvem laranja ligada o GitHub não emite o certificado e o
site fica com aviso de não seguro.

**O site continua no endereço do GitHub.** Com o domínio registrado, dá para
apontá-lo para o GitHub Pages. Aí o `Site URL`, o `Redirect URLs` e o
`URLS_DO_APP` do Stripe precisam ser atualizados juntos — os três apontam para
o mesmo lugar e não podem divergir.
