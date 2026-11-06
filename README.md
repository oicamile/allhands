# All Hands · Votação das histórias

Plataforma de votação das histórias do All Hands da Coders, feita a partir da spec "Notas do All Hands". Visual baseado no CSS do coders.com.br.

```bash
npm install
npm run dev   # http://localhost:5174
```

Sem variáveis de ambiente roda em **modo local** (localStorage, só entre abas do mesmo navegador). Com as variáveis do Supabase roda em **modo compartilhado**.

## Rotas
- `#/admin` login, sessões, montagem, controle ao vivo, ranking, equipe, CSV
- `#/v/CODIGO` votante, sem login nem nome

## Votação
👍/👎 de um toque, mais notas piada opcionais. Resultado = % de aprovação (👍 sobre 👍+👎). Quem conta a história pesa 0,5 (ajustável por sessão); notas piada ficam fora da %. Votos escondidos até Revelar.

## Ligar o banco compartilhado (Supabase)
1. Crie um projeto em supabase.com.
2. SQL Editor: cole e rode `supabase/schema.sql` (tabelas, RLS, funções e a limpeza automática de 12h via pg_cron).
3. Authentication > URL Configuration: coloque a URL do site (ex.: `http://localhost:5174` e a da Vercel) em *Site URL* e *Redirect URLs*.
4. Copie `.env.example` para `.env.local` e preencha URL e anon key.
5. `npm run dev`. Entre com um e-mail da tabela `team` (já vem `camile@oicamile.cc` como admin); chega um link de acesso por e-mail.
6. Deploy na Vercel: cadastre as mesmas duas variáveis em Project Settings > Environment Variables.

## Como aguenta ~100 votantes
- Votante só usa duas funções (`voter_state`, `cast_vote`); não lê tabela nenhuma, então não vê voto antes da revelação.
- Quando o admin muda o estado, manda um broadcast; cada celular refaz a leitura com atraso aleatório de até 1,2s (evita 100 requisições no mesmo instante). Há também leitura a cada 5s como reserva.
- Plano gratuito do Supabase permite 200 conexões realtime simultâneas, folga para 100 votantes + equipe.

## Dados
Tudo de sessão some 12h depois do encerramento (ou 12h depois da última atividade, se ninguém encerrar). Ficam só `team` e `joke_library`.
