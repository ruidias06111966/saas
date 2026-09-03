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

| Arquivo | Aplicado em produção | Observação |
|---|---|---|
| `001_perfis_descobriveis.sql` | ✅ | Aditivo. Não altera nada existente. |
| `002_restringir_leitura_users.sql` | ❌ **não** | **Só depois** de o código novo estar publicado. Ver o cabeçalho do arquivo. |

O `002` é o único do repositório que **quebra a versão publicada se for aplicado
antes dela ser atualizada**. Ele está escrito, revisado e esperando o deploy.
