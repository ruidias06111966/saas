# E-mail do CONEXÃO

Roteiro para tirar a autenticação do e-mail interno do Supabase e colocá-la num
SMTP próprio. Escrito para ser seguido de cima para baixo, sem pular.

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

Dentro do Resend: **Domains → Add Domain**, e informe o domínio que você
registrou.

Ele vai mostrar uma lista de registros DNS. Deixe essa tela aberta.

## 3. Provar que o domínio é seu

Volte ao registro.br, entre no domínio e procure a área de **DNS / Editar
Zona**. Copie para lá, um por um, os registros que o Resend mostrou.

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

Vale acrescentar mesmo assim. No registro.br, um registro `TXT` com nome
`_dmarc` e valor:

```
v=DMARC1; p=none; rua=mailto:seu-email@seudominio.com.br
```

`p=none` significa "só me avise, não bloqueie nada" — é o modo seguro para
começar. Depois de algumas semanas recebendo os relatórios e vendo que está tudo
certo, dá para endurecer para `p=quarantine`.

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
| Sender email | `nao-responda@seudominio.com.br` |
| Sender name | `CONEXÃO` |

O remetente **precisa ser do domínio que você verificou**. Se for de outro, o
Resend recusa o envio.

`nao-responda@` não precisa existir como caixa de entrada — ninguém vai
responder para ele. Se preferir um endereço que receba respostas, use um que
exista de verdade.

## 6. Levantar o limite de envios

Este passo é fácil de esquecer e desfaz tudo o que veio antes.

Em **Authentication → Rate Limits**, o limite de e-mails por hora continua no
valor baixo do serviço embutido mesmo depois de ligar o SMTP próprio. Suba para
algo compatível com o seu plano — com o gratuito do Resend, 100 por hora é um
teto coerente com os 100 por dia.

## 7. Conferir os endereços de volta

Em **Authentication → URL Configuration**:

- **Site URL**: `https://ruidias06111966.github.io/saas/`
- **Redirect URLs**: o mesmo endereço acima.

O app manda o destino explicitamente a cada cadastro (`emailRedirectTo`, em
`services/auth.ts`), justamente para não depender só desta tela. Mas o Supabase
só aceita destinos que estejam nesta lista — então os dois precisam bater.

---

## Os textos dos e-mails

Os modelos do Supabase vêm **em inglês**. Um app brasileiro mandando
"Confirm your signup" para quem acabou de se cadastrar é ruído logo no primeiro
contato.

Em **Authentication → Emails → Templates**, troque o conteúdo. Abaixo, prontos
para colar.

### Confirm signup

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

Ainda não há tela de "esqueci minha senha" no app — quando houver, este é o
texto. Deixar pronto custa nada e evita o modelo em inglês vazar para alguém.

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

Os outros modelos (Invite, Magic Link, Change Email, Reauthentication) podem
ficar como estão: o app não usa nenhum deles hoje.

---

## Conferir que funcionou

Não confie no "salvou sem erro". Teste com um endereço **que não seja o dono do
projeto** — é justamente esse caso que o serviço embutido não atendia.

1. Abra o app e cadastre-se com um e-mail de outro provedor (um Gmail seu, o de
   alguém de confiança).
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

**Não existe "esqueci minha senha" no app.** Quem esquecer a senha hoje perde a
conta. O SMTP próprio é o que torna essa tela possível — antes dele, não fazia
sentido construí-la, porque o e-mail não chegaria.

**O site continua no endereço do GitHub.** Com o domínio registrado, dá para
apontá-lo para o GitHub Pages. Aí o `Site URL`, o `Redirect URLs` e o
`URLS_DO_APP` do Stripe precisam ser atualizados juntos — os três apontam para
o mesmo lugar e não podem divergir.
