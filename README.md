# Hours

App estática de registo pessoal de horas, publicada em https://nth8m6fcs7-byte.github.io/Hours/.
Mantém a tabela `personal_work_hours` e as políticas RLS existentes. O frontend utiliza
apenas a publishable key e o SDK Supabase JS 2.117.2, fixado no import CDN.

## Autenticação

- Email e password, com mostrar/ocultar no login e criação de conta.
- “Esqueci a password” envia o email através de `resetPasswordForEmail()` com
  `redirectTo: 'https://nth8m6fcs7-byte.github.io/Hours/'`.
- O evento `PASSWORD_RECOVERY` abre o formulário de nova password; a alteração
  é feita por `updateUser({ password })`. A recuperação usa o fluxo implicit do
  SDK para aceitar o link no dispositivo onde o email é aberto.
- “Ativar Face ID”, em “A tua conta” abaixo dos registos, depois de entrar numa
  conta confirmada, chama `registerPasskey()`.
- “Entrar com Face ID” chama `signInWithPasskey()`, sem exigir email. O dispositivo
  escolhe Face ID, Touch ID, PIN ou outro autenticador disponível.

## Configuração no Supabase

Em **Authentication → URL Configuration**, confirmar:

- Redirect URLs: acrescentar exatamente `https://nth8m6fcs7-byte.github.io/Hours/`,
  mantendo os endereços de outras apps.
- Site URL: se o projeto servir outras apps, preservar o valor existente e confirmar
  os fluxos de email de cada app antes de o alterar. A recuperação de Hours já envia
  o seu próprio `redirectTo`.

Em **Authentication → Passkeys**, os valores previstos para Hours são:

- Relying Party Display Name: `As Minhas Horas`
- Relying Party ID: `nth8m6fcs7-byte.github.io`
- Relying Party Origins: `https://nth8m6fcs7-byte.github.io`

O origin não inclui `/Hours/`. Manter o RP ID depois de registar passkeys.
Se outras apps partilharem o projeto, confirmar a compatibilidade dos domínios antes
de substituir o RP ID ou origins existentes; alterar o RP ID invalida passkeys existentes.
As passkeys exigem uma conta confirmada e um navegador compatível com WebAuthn.
Para testar Face ID no iPhone, abrir a página publicada em Safari, entrar com
email/password, ativar Face ID, sair e usar “Entrar com Face ID”.

A chave pública não permite consultar a lista de redirects nem os detalhes do RP
no painel. O endpoint público de settings indicou `passkeys_enabled: true` durante
a verificação. Não foram alterados RLS, privilégios nem dados.

Documentação: [Passkeys](https://supabase.com/docs/guides/auth/passkeys),
[Recuperação de password](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Testes

`tests/auth.cjs` usa Playwright com respostas Supabase simuladas, sem escrever em
produção. Verifica mostrar/ocultar, criação de conta, recuperação, erros, passkeys,
login/logout, adicionar/editar/apagar, turnos noturnos e os dois totais semanais
num viewport móvel. Requer Playwright e Chromium instalados; executar
`node --test tests/auth.cjs tests/history.cjs`. Opcionalmente, definir `BROWSER_CHANNEL=msedge`
para usar Microsoft Edge e `PLAYWRIGHT_PATH` para apontar a uma instalação existente.

O envio real do email, um link real de recuperação e a cerimónia biométrica precisam
de uma conta de teste e de validação no dispositivo; os testes simulados não os comprovam.

## Interface

Design sage e marfim, com totais em destaque, etiquetas visíveis nos campos e registos
com data e duração. As opções da conta ficam no fim da página. O layout foi verificado
entre 320 e 430 px em telemóvel e a 780/1280 px no desktop, incluindo estados vazios,
edição e recuperação. Não requer build nem novas dependências de produção.

## Histórico de turnos

- Um botão geral “Editar” mostra as ações de corrigir/apagar; “Concluir” volta à consulta.
- O seletor permite consultar cada mês e ano, meses vazios e “Todos os meses”.
- A consulta mostra a quantidade e as horas do mês, além do intervalo de datas guardado.
- Os cartões Gorjetas e Minha semana mantêm o cálculo semanal existente, baseado no
  registo mais recente, independentemente do mês consultado.
- O carregamento utiliza páginas ordenadas de até 500 registos e contagem exata,
  respeitando RLS. Em caso de erro, mantém o último histórico completo e apresenta
  uma mensagem, sem substituir a lista por uma resposta parcial.

`tests/history.cjs` verifica mudança de ano, meses vazios, edição geral, totais,
mais de 1000 registos, limite reduzido do servidor, falha durante a paginação e
saída da conta durante o carregamento.

## Ícone no iPhone

O ícone do ecrã principal é um relógio sage, definido por `apple-touch-icon` com
PNG opaco de 180×180 e caminho absoluto com ficheiro versionado. `site.webmanifest`
também declara ícones de 180, 192 e 512 px, mantendo `display: browser`.
O browser também utiliza o mesmo relógio como favicon.
Para atualizar um atalho que ainda mostra “M”, abrir a página no Safari e usar
**Partilhar → Adicionar ao ecrã principal**; remover o atalho antigo se necessário.
Se o Safari ainda apresentar uma versão anterior, usar o endereço
`https://nth8m6fcs7-byte.github.io/Hours/?icone=2` e confirmar o relógio na
pré-visualização antes de adicionar. Não é necessário apagar os dados do Safari.
É um ícone estático: não altera o funcionamento nem os dados da app.
