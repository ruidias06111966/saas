# Migrações

Até 03/09/2026 o banco era alterado à mão, e `docs/SUPABASE.sql` era um arquivo
único recriado a cada mudança. Isso tinha um custo concreto: **não havia como
saber qual versão estava em produção sem ler o catálogo do PostgreSQL** — foi
exatamente o que a auditoria daquele dia teve de fazer.

A partir daqui, toda alteração estrutural entra como um arquivo numerado nesta
pasta.

## A linha de base

`docs/SUPABASE.sql` continua sendo a **linha de base**: o schema completo já
aplicado em produção antes desta pasta existir. Ele não é uma migração e não
deve ser reexecutado num banco que já esteja no ar — recriaria tudo.

Para um projeto novo: rode `docs/SUPABASE.sql` uma vez, depois as migrações
desta pasta em ordem.

Para o projeto que já está em produção: só as migrações desta pasta.

## Convenção

```
NNN_descricao_curta.sql
```

Numeração sequencial, sem lacunas. Cada arquivo abre com um cabeçalho dizendo
**o que muda, por quê, e o que quebra se for aplicado fora de ordem** — porque
a informação que falta na hora do incidente é sempre essa.

Uma migração é aplicada uma vez e nunca editada depois. Corrigir uma migração
já aplicada é escrever a próxima.

## Estado

| Arquivo | Aplicado | Observação |
|---|---|---|
| `001_perfis_descobriveis.sql` | ✅ | A view saiu na 013 — o relacionamento acabou. |
| `002_restringir_leitura_users.sql` | ✅ | Fechou a leitura de `public.users`. |
| `003_search_path_das_funcoes_puras.sql` | ✅ | |
| `004_push_subscriptions.sql` | ✅ | |
| `005_promocao_de_lancamento.sql` | ✅ | Dá 60 dias de Premium a quem entrar até 09/12/2026. **Atenção ao testar cota:** toda conta nova nasce Premium por causa dela. |
| `006_termometro_mais_rapido.sql` | ✅ | |
| `007_avisar_de_solicitacao.sql` | ✅ | |
| `008_mercado_anuncios_e_propostas.sql` | ✅ | O pivô: anúncios e propostas. |
| `009_perfis_do_mercado.sql` | ✅ | A view do crachá, para o nome do autor aparecer. |
| `010_o_cracha_e_so_de_leitura.sql` | ✅ | Corrige a 009: a view tinha nascido gravável. |
| `011_a_politica_que_se_mordia.sql` | ✅ | Corrige a 009: recursão infinita no RLS. |
| `012_perfil_profissional.sql` | ✅ | Telefone, especialidades, `contato_do_negocio`. |
| `013_a_limpeza_do_relacionamento.sql` | ✅ | Apagou 6 tabelas e 4 colunas do app de namoro. Irreversível. |
| `014_o_cracha_estava_sem_o_resumo.sql` | ✅ | Corrige a 012: a view perdeu `bio`, `extra_photos` e `plan`, e o app parou de abrir. |
| `015_as_colunas_orfas_bloqueavam_o_salvamento.sql` | ✅ | Corrige a 012: `not null` em coluna órfã impedia salvar perfil e criar conta. |
| `016_a_cota_de_propostas.sql` | ✅ | 3 propostas/mês no plano gratuito. |
| `017_o_nome_certo_da_cota_diaria.sql` | ✅ | `daily_usage.contatos` nasce ao lado de `interests`, espelhadas por gatilho. |
| `018_a_coluna_do_nome_antigo_sai.sql` | ❌ **não** | **Só depois** de o cliente que usa `contatos` estar no ar, com folga para as abas antigas. |
| `019_a_foto_deixa_de_ser_recompensa.sql` | ✅ | A foto de perfil seguia o Véu do app de namoro e chegava BORRADA a todo mundo. Passa a seguir a mesma regra do crachá. |

### O que a lista ensina

Cinco das dezenove são correção de outra da mesma lista — 010, 011, 014/015 e
019. Em todas, o SQL foi conferido e passou; o que não foi conferido é se a
CONSULTA QUE O CLIENTE FAZ continuava de pé. Duas derrubaram produção.

A 019 é a variante mais traiçoeira: não derrubou nada. O cliente foi pivotado,
a política do Storage não, e a foto de todo profissional chegava borrada aos
outros — sem erro em lugar nenhum, porque o cliente descia de nível até algo
passar. Passou meses assim, e só apareceu quando um teste usou DUAS contas.
Enquanto houver uma conta só no sistema, nada que envolva duas pessoas está
sendo testado por ninguém.

Daí a regra que vale mais que qualquer cabeçalho: **verificar a migração não é
verificar o app**. Antes de aplicar, simule o `select` e o `upsert` que o cliente
manda, como o cliente manda, dentro de uma transação terminada em
`raise exception` para não deixar rastro.

E daí também a regra da 017/018: quando um nome muda, ele não muda de uma vez.
A coluna nova nasce ao lado da antiga, um gatilho mantém as duas iguais, o
cliente troca, e só então a antiga sai. Assim não existe instante em que o app
publicado peça algo que o banco não tem.
