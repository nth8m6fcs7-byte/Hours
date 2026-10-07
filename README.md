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
a verificação. Não foram alterados RLS nem privilégios.

Documentação: [Passkeys](https://supabase.com/docs/guides/auth/passkeys),
[Recuperação de password](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

## Testes

## Gorjetas da equipa

Secção separada em Valores → Equipa → Pagar. Usa `personal_tip_ledgers`, com leitura
protegida por RLS e escrita apenas através de `personal_tip_command`. Os registos de
horas e as tabelas de gorjetas da outra aplicação Bacalhau permanecem independentes.

- Euros são convertidos em cêntimos inteiros; horas, em minutos inteiros.
- O total contado substitui o total dos sete emails, exigindo nota para diferenças.
- Distribuição proporcional às horas, com os cêntimos restantes atribuídos às maiores
  frações; empate resolvido pelo identificador estável da pessoa.
- Sugestão habitual: 95% da quota, arredondados ao euro mais próximo, limitada ao
  dinheiro disponível dessa pessoa. O valor entregue pode ser ajustado; a diferença
  real fica no saldo. Extras sem retenção recebem a quota completa e qualquer saldo.
- A semana pertence ao mês da segunda-feira. A última segunda-feira do mês inicia
  a semana de liquidação: 100% da quota mais o saldo anterior. Saídas também liquidam tudo.
- Confirmar grava uma operação indivisível, recalcula no servidor e fecha a semana.
  Uma revisão bloqueia concorrência entre dispositivos; só a semana seguinte pode
  ser confirmada. Semanas sem movimento podem ser fechadas a zero.
- Histórico confirmado é imutável nesta versão. Não apagar nem recriar pessoas para
  corrigir pagamentos antigos. Uma correção posterior exige lançamento compensatório
  explícito; não há edição silenciosa dos saldos.
- Para começar a meio do mês, adicionar cada pessoa com o saldo **real** já retido e
  uma nota de origem. Depois começar na próxima semana ainda não distribuída. Não
  importar simultaneamente o saldo e as semanas que o geraram.
- Há rascunho sincronizado e CSV com pagamentos, saldos, horas e notas. Emails continuam
  a ser lidos manualmente. A opção “Esta pessoa sou eu” permite importar as horas da app.

SQL instalado: `sql/tips-ledger.sql`. O cálculo privilegiado fica em `hours_private`,
fora da API, usa `auth.uid()` e `search_path` fixo; a função pública é invoker e não
é executável por anon. Clientes não podem atualizar o documento do histórico diretamente.

Validação adicional: `node tests/tips-core.test.mjs` (inclui 1.000 distribuições),
`node tests/tips-browser.cjs` (interface real com transporte simulado) e
`tests/tips-server.sql` (transação com rollback no Supabase). Não gravar os testes de
servidor fora da transação; não é necessário criar uma conta de teste nem enviar emails.
`node tests/tips-live.cjs` verifica o carregamento da app publicada e dos módulos sem
criar pagamentos; aceita as mesmas variáveis `PLAYWRIGHT_PATH` e `BROWSER_CHANNEL`.

## Testes de autenticação e horas

`tests/auth.cjs` usa Playwright com respostas Supabase simuladas, sem escrever em
produção. Verifica mostrar/ocultar, criação de conta, recuperação, erros, passkeys,
login/logout, adicionar/editar/apagar, turnos noturnos e os dois totais semanais
num viewport móvel. Requer Playwright e Chromium instalados; executar
`node --test tests/auth.cjs tests/history.cjs tests/days.cjs`. Opcionalmente, definir `BROWSER_CHANNEL=msedge`
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
- Tocar em qualquer cartão (ou usar Enter/Espaço) abre apenas os turnos desse intervalo:
  Gorjetas de segunda a domingo, Minha semana de quinta a segunda. O histórico mostra
  a semana, as datas, a quantidade e o subtotal, com ano explícito na mudança de ano.
- “Ver por mês” repõe o mês anteriormente consultado, incluindo “Todos os meses”.
  Os controlos mensais ficam recolhidos durante a consulta semanal. Navegar entre
  mês e semana mantém os campos por guardar, tanto novos turnos como uma edição.
- O carregamento utiliza páginas ordenadas de até 500 registos e contagem exata,
  respeitando RLS. Em caso de erro, mantém o último histórico completo e apresenta
  uma mensagem, sem substituir a lista por uma resposta parcial.

`tests/history.cjs` verifica mudança de ano, meses vazios, edição geral, totais,
mais de 1000 registos, limite reduzido do servidor, falha durante a paginação e
saída da conta durante o carregamento.

## Pausas e notas

O detalhe opcional “Pausas e notas”, recolhido por defeito no formulário, permite
indicar o total realmente trabalhado e guardar uma observação. Deixar o total vazio
mantém o cálculo entre entrada e saída, incluindo turnos que passam a meia-noite.
Um total explícito aceita `HH:MM` (também `H:MM`), de `00:00` a `24:00`; `0` equivale
a zero horas. As notas aparecem como texto nos turnos, com quebras de linha e HTML
escapado. As notas não alteram as horas. Editar um turno repõe esses campos;
cancelar ou guardar limpa-os.

Antes de publicar esta versão, a tabela `personal_work_hours` precisa de duas colunas
nullable: `duration_minutes integer` e `notes text`. Um total válido de 0 a 1440
minutos substitui o cálculo automático nos totais semanal, mensal e individual.
Registos anteriores com `duration_minutes` nulo continuam a usar entrada e saída.
Guardar o campo vazio envia `duration_minutes: null`; notas em branco enviam
`notes: null`, permitindo remover um ajuste ou observação ao editar. O frontend
mantém a publishable key, a tabela, o conflito `user_id,work_date` e as políticas RLS;
esta documentação não executa alterações na base de dados. A alteração aditiva está
em [`sql/optional-shift-details.sql`](sql/optional-shift-details.sql), com um limite
de 0 a 1440 minutos, sem substituir dados ou políticas existentes.

## Folga e Férias

- “Folga” usa a data selecionada no formulário. “Férias” abre as datas de início e
  fim e guarda um registo por dia, incluindo ambos os extremos do intervalo.
- Antes de substituir horários de trabalho, a app consulta novamente o intervalo
  completo e pede confirmação, indicando quantos dias têm horários no caso de férias.
  Cancelar ou falhar a consulta não grava alterações. O intervalo é guardado num
  único upsert, mantendo `UNIQUE(user_id,work_date)` e as políticas RLS.
- Folgas e férias guardam `start_time`, `end_time` e `duration_minutes` como `null`.
  Notas já existentes são preservadas. O histórico mostra “Folga” ou “Férias”, com
  zero horas, sem ação individual Editar; podem ser apagadas no modo de edição do histórico.
- Os totais individuais, mensais e semanais ignoram horas de registos desses tipos,
  mesmo que contenham valores antigos. Guardar ou editar um horário define `day_type='work'`.
- Schema confirmado no projeto Bacalhau: `day_type text NOT NULL DEFAULT 'work'`,
  constraint `work/day_off/vacation`, campos de horas nullable, unicidade e RLS ativos.
  Não é necessária outra tabela nem alteração manual da base de dados.
- `tests/days.cjs` cobre confirmações e cancelamentos, limites inclusivos, mudança
  de mês, dia bissexto, falhas, totais, edição normal e eliminação, com Supabase simulado.

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
