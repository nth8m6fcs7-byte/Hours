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

`tests/auth.cjs` usa Playwright com respostas Supabase simuladas, sem escrever em
produção. Verifica mostrar/ocultar, criação de conta, recuperação, erros, passkeys,
login/logout, adicionar/editar/apagar, turnos noturnos e os dois totais semanais
num viewport móvel. Requer Playwright e Chromium instalados; executar
`node --test tests/auth.cjs tests/history.cjs tests/days.cjs`. Opcionalmente, definir `BROWSER_CHANNEL=msedge`
para usar Microsoft Edge e `PLAYWRIGHT_PATH` para apontar a uma instalação existente.

O envio real do email, um link real de recuperação e a cerimónia biométrica precisam
de uma conta de teste e de validação no dispositivo; os testes simulados não os comprovam.

## Interface

Design grafite com cartões translúcidos, texto claro e ações em azul discreto, com totais em destaque, etiquetas visíveis nos campos e registos
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

O ícone do ecrã principal é um relógio orbital azul em fundo grafite, definido por `apple-touch-icon` com
PNG opaco de 180×180 e caminho absoluto com ficheiro versionado. `site.webmanifest`
também declara ícones de 180, 192 e 512 px, com `display: standalone` para permitir notificações no iPhone.
O browser também utiliza o mesmo relógio como favicon.
Para atualizar um atalho que ainda mostra “M”, abrir a página no Safari e usar
**Partilhar → Adicionar ao ecrã principal**; remover o atalho antigo se necessário.
Se o Safari ainda apresentar uma versão anterior, usar o endereço
`https://nth8m6fcs7-byte.github.io/Hours/?icone=3` e confirmar o relógio na
pré-visualização antes de adicionar. Não é necessário apagar os dados do Safari.
É um ícone estático: não altera o funcionamento nem os dados da app.

## Entrada e saída em dois momentos

- Os campos de data e horas têm 44 px de altura. No telemóvel, a data fica
  numa caixa curta à direita da etiqueta; entrada e saída ficam lado a lado.
  O formulário tem espaços reduzidos e ações Folga/Férias com contorno discreto.
- Preencher a entrada e escolher “Iniciar turno” guarda o dia com saída nula.
  A entrada e a data ficam bloqueadas; “Corrigir entrada” permite corrigir e voltar
  a guardar a entrada. A correção não conclui o turno.
- Ao entrar novamente na conta, o formulário recupera o turno em curso mais recente,
  incluindo um turno iniciado no dia anterior. No histórico aparece “Em curso”.
- “Parar” usa a hora atual como saída e conclui o mesmo registo. Turnos noturnos
  mantêm a data da entrada. Só depois de concluídos somam horas aos totais.
- Continua a ser possível preencher entrada e saída de uma vez para registar
  um dia completo e editar turnos anteriores. Um total explícito continua disponível
  para registos de horas ajustadas.
- Usa os campos existentes, sem migrações nem alterações de RLS. Os novos testes em
  `tests/days.cjs` simulam gravação, reabertura, correção, falhas e conclusão noturna.

O visual grafite mantém os campos compactos, reduz a altura dos cartões semanais
e aplica a mesma paleta ao login, recuperação, edição e mensagens de estado.

## Turno ativo, contador e limite de oito horas

O painel de turno ativo mostra o tempo efetivamente trabalhado desde a entrada confirmada (descontando
as pausas registadas) e permite retomar a saída mesmo quando o formulário está noutro dia.
O contador recalcula a duração pela data/hora guardada; fechar a página não o
reinicia. A partir de oito horas, o painel fica vermelho e apresenta um aviso.
Ao regressar à página, a sessão e os registos são novamente consultados.

Uma entrada apenas preenchida, sem carregar em “Iniciar turno”, é um rascunho:
é preservada neste navegador por utilizador e aparece como “por confirmar”.
Só a confirmação grava no Supabase, bloqueia a entrada e inicia o contador.
Rascunhos locais não sincronizam entre dispositivos. Falhas de armazenamento local
não impedem a gravação normal na conta.

“Lembrete das 8h no Calendário” descarrega um evento ICS com alarme para a hora
de entrada mais oito horas e as pausas já concluídas. Durante uma pausa o botão
fica indisponível, pois ainda não se sabe quando o trabalho será retomado. É necessário adicionar/confirmar o evento no calendário;
a entrega depende das definições desse calendário. Corrigir ou concluir um turno
não altera um lembrete já importado: deve ser atualizado/removido no calendário.
As notificações push são opcionais e precisam de ativação neste dispositivo.
No iPhone isso exige uma web app instalada, permissão e infraestrutura Web Push.

## Pausas persistentes

A migração `hours_shift_pauses` (SQL em `sql/shift-pauses.sql`) acrescenta
`break_seconds` e `paused_at` na tabela existente, mantendo dados, grants e RLS.
Aplicada no projeto Bacalhau, exclusivamente na tabela `personal_work_hours`.

“Iniciar pausa” grava a hora em UTC. “Retomar trabalho” acumula a duração exata
em segundos. Reabrir a app recupera esse estado da conta. O painel mostra o
trabalho líquido e o total das pausas; fica vermelho às oito horas trabalhadas.
Concluir enquanto está em pausa fecha essa pausa à hora de saída indicada.
O histórico e os totais descontam as pausas; um total manual continua a prevalecer.
O lembrete de calendário precisa de atualização manual depois de novas pausas.
Os testes de interface usam respostas simuladas. O schema e o desconto de pausas
foram verificados no Supabase com uma tabela temporária, sem alterar registos
de utilizadores. O envio push é executado em segundo plano pelo serviço descrito abaixo.

## Notificações push de oito horas

No iPhone (iOS 16.4 ou posterior), abrir no Safari, Partilhar → Adicionar ao ecrã
principal e abrir pelo ícone. Durante um turno, tocar em “Ativar notificações” e
aceitar a permissão. A instalação usa `display: standalone`. Não é necessário
manter a HOURS aberta. Dispositivos sem suporte continuam com o aviso visual e
com a alternativa de Calendário.

A Edge Function `hours-push` e o job `hours-eight-hour-push` verificam os turnos
uma vez por minuto. O prazo é entrada + oito horas + pausas concluídas, calculado
no fuso horário do dispositivo. Durante uma pausa e depois de terminar o turno
não são enviados avisos. Um aviso entregue fica marcado por turno/dispositivo;
falhas temporárias têm até cinco tentativas. Cada lote tem no máximo cinco envios.
Turnos iniciados há mais de 48 horas são ignorados. A entrega pode atrasar por
rede, serviço push, definições de Foco e poupança de bateria. Uma notificação já
aceite pelo fornecedor pode chegar depois de uma saída/pausa registada em simultâneo.

As subscrições ficam em `hours_push_subscriptions` com RLS por utilizador.
`hours_push_config` guarda chaves VAPID e o segredo do agendador: só o servidor
pode consultar. O endpoint GET devolve apenas a chave pública; o POST valida o
segredo do agendador. A função de reserva de envios só permite `service_role`.
Não registar valores de chaves, endpoints ou tokens em logs.

Sair da conta ou escolher “Desativar” remove a subscrição deste dispositivo.
“Confirmar notificações neste dispositivo” volta a associar a subscrição à conta.
O fuso segue o dispositivo na ativação; confirmar novamente após mudar de fuso.

Fontes: `sql/hours-push.sql`, `sql/hours-push-schedule.sql`,
`supabase/functions/hours-push/` e `push-sw.js`. Versões das dependências fixadas.
`tests/push.cjs` verifica permissão, gravação, desativação e clique no aviso com
respostas simuladas. `tests/push-scheduler.sql` é um teste opcional para ambiente
isolado/local; não executar em produção. A receção real exige validar no iPhone
após a subscrição; os testes simulados não comprovam a entrega da Apple.

## Definições e cronómetro

O cartão do turno mostra apenas o estado, cronómetro e ação de pausa.
A roda dentada no canto superior abre Definições: resumo das pausas, acesso
à entrada/saída, notificações e a alternativa de Calendário recolhida.
O painel fecha com o botão Fechar, Escape ou toque fora, e devolve o foco
à roda dentada. As definições estão disponíveis mesmo sem turno ativo.

Ícone orbital v3: ficheiros PNG opacos de 180, 192 e 512 px, favicon de 32 px
e caminhos versionados. No iPhone, atalhos já instalados podem manter a imagem
anterior; adicionar novamente pelo Safari para obter o ícone novo.

## Organização da página

Topo reduzido a HOURS, ícone orbital e definições. Três secções: O meu tempo
(totais semanais), Turno em curso (cronómetro, pausa e saída no mesmo cartão)
e Turnos registados (histórico). A entrada confirmada é um resumo discreto;
Corrigir entrada volta a mostrar os campos bloqueados.

As três secções podem ser abertas/recolhidas pelo respetivo título, com indicação
de estado e suporte de teclado. Recolher preserva os campos e o cronómetro.
Consultar uma semana abre Turnos; editar ou retomar uma entrada abre o formulário.

As três secções usam cabeçalhos idênticos, sem caixa exterior. A tua conta
e Editar turnos ficam nas definições. Editar abre automaticamente Turnos e
fecha o painel de definições. O estado de sincronização fica nas definições.

Durante um turno ativo, Parar guarda a hora atual como saída e o tempo líquido
trabalhado, sem exigir preencher a saída. O botão é compacto e fica ao lado
da pausa. Tocar no resumo da entrada abre a correção. O formulário manual mantém-se
para novos registos completos e edição de turnos anteriores. O filtro mensal
aparece sem caixa exterior.

Iniciar turno num formulário vazio guarda automaticamente a data e hora locais
atuais e bloqueia a entrada. Não é necessário preencher uma hora antes de iniciar.
A hora guardada continua clicável para correção; registos históricos com horários
preenchidos manualmente mantêm os valores escolhidos.

## Ajustar tempo pelo cronómetro

Tocar no cronómetro transforma os próprios números em campos de horas, minutos
e segundos, sem abrir uma caixa. ✓ guarda o total corrigido; ✕ ou Escape cancela. O contador continua a partir do valor corrigido.
As correções da pausa ficam em Pausas e Regresso, separadas da edição do cronómetro. O ajuste do total não altera a entrada.
A correção é guardada em `work_adjustment_seconds`, separada das pausas. Ao parar,
o total líquido inclui a correção. Calendário e prazo do push também a incluem;
um push já entregue não é repetido e lembretes já importados exigem atualização.

A migração `hours_worked_time_adjustments` foi aplicada no projeto Bacalhau
(SQL em `sql/worked-time-adjustments.sql`). Acrescenta o campo e atualiza a função de elegibilidade do push, sem
alterar registos ou RLS. O campo, a fórmula das oito horas e as permissões do agendador foram verificados
no Supabase sem alterar registos dos utilizadores.

As pausas aparecem por baixo do cronómetro. Ao tocar, os intervalos «das … às …» podem ser corrigidos no próprio ecrã; preencher o fim de uma pausa em curso retoma o trabalho. São guardados vários intervalos, incluindo pausas que passam da meia-noite. Os totais antigos sem intervalos são preservados e podem ser corrigidos no campo «Pausas anteriores · total» (HH:MM), sem inventar horas de início/fim. Requer `sql/pause-intervals.sql`.

Fluxo diário: Começar turno usa a hora atual; tocar em Entrada permite corrigi-la com ✓/✕. Fazer pausa congela o cronómetro; Retomar assume o regresso atual e a ligação Regresso permite corrigir a hora depois (por exemplo, retomar às 14:00 mas indicar que o regresso real foi às 13:00). Parar assume a saída atual e guarda o turno. O cronómetro continua editável diretamente; os turnos guardados continuam editáveis nas definições.

## Finanças pessoais — primeira versão

A secção **Finanças**, fechada por defeito, regista valores líquidos por mês de
referência. Inclui vencimento, alimentação, prémios, prémio Coverflex, gorjetas
pessoais e outros pagamentos. Cada parcela tem valor esperado, recebido e destino
(conta, dinheiro, cartão de alimentação ou Coverflex). É possível adicionar outras
parcelas da mesma categoria para repartir um pagamento por destinos diferentes.
Cada montante deve ser registado uma só vez. Vazio significa desconhecido; zero
significa nenhum valor. Não há distribuição de gorjetas nem ligação à TIPS.

Os resumos distinguem dinheiro de benefícios, comparam esperado/recebido quando
as parcelas preenchidas têm ambos os valores e calculam médias sobre as horas dos
turnos concluídos do mesmo mês. Turnos abertos não entram na comparação. O valor
por hora é uma média dos registos, não uma validação do contrato ou do recibo.
A importação de recibos e comprovativos está descrita na secção seguinte; despesas ficam para uma fase posterior.

Os dados usam `hours_finance_months`, uma linha por utilizador e mês, com valores
em cêntimos inteiros. A gravação do mês é atómica. RLS restringe leitura e escrita
ao próprio utilizador, incluindo a verificação do proprietário em atualizações.
As finanças não são guardadas em localStorage. Alterações por guardar pedem
confirmação antes de mudar de mês; falhas de rede preservam os campos editados.

Antes de publicar a interface, aplicar `sql/personal-finances.sql` **no projeto
Bacalhau (`ecxbujytmufnkevddohv`)**, verificar políticas e permissões e confirmar
a existência da tabela. A migração só cria recursos com prefixo `hours_`.

Verificação de navegador:

```sh
PLAYWRIGHT_PATH=/workspace/hours-tools/playwright-system.cjs node --test tests/finance.cjs tests/auth.cjs tests/days.cjs tests/history.cjs
```

Verificação PostgreSQL local (Docker necessário, sem dados reais nem portas
expostas; nunca executar a fixture de teste na base de produção):

```sh
bash tests/finance-db.sh
```

Este teste aplica o esquema numa base descartável, simula dois utilizadores e
verifica validação dos montantes, gravação atómica, isolamento entre contas e
recusa de acesso anónimo. A imagem usada é PostgreSQL 17 Alpine.

## Recibos e Coverflex: importar, confirmar e resumir

Finanças passa a abrir com dois botões, **Recibo** e **Coverflex**, e o resumo dos
ganhos/horas. As parcelas manuais, a distribuição por destino, comparações e
movimentos PPR ficam em detalhes fechados. Os valores já existentes são mantidos.

São aceites PDF, JPG, PNG e WebP até 10 MB. O leitor suporta PDF com texto e PDF
ou fotografia com OCR português. Limite: cinco páginas por PDF. As dependências
são carregadas apenas quando se escolhe um ficheiro: PDF.js 4.10.38, Tesseract.js
6.0.1, core 6.0.0 e dados portugueses 1.0.0, com versões fixas no jsDelivr.
O reconhecimento ocorre no navegador, sem enviar imagens para um serviço de OCR
ou IA. Precisa de ligação para carregar as bibliotecas/modelo na primeira leitura.
HEIC não é suportado: escolher uma imagem JPG/PNG ou PDF.

A leitura preenche candidatos, nunca confirma valores automaticamente. O utilizador
revê o mês, salário líquido sem alimentação/PPR, alimentação, prémio Coverflex e
resgate PPR. Bruto, descontos e líquido total ficam na revisão detalhada. Campos
não reconhecidos ficam vazios; erros de leitura permitem corrigir manualmente ou
escolher outro ficheiro. O leitor não soma Original e Duplicado e não trata um
saldo da Coverflex como novo rendimento. Um comprovativo de crédito/carregamento
é mais adequado do que uma captura só do saldo.

O prémio pertence ao mês em que foi atribuído. O resgate pelo PPR é um movimento
de dinheiro já ganho, registado no mês do resgate e opcionalmente ligado ao mês
de origem. Não entra novamente nos ganhos nem na média por hora. O recibo pode
incluir esse resgate no líquido total; o leitor propõe a separação para confirmar.
O total mensal de resgates e o mês de origem podem ser corrigidos manualmente.

Após confirmação, o original vai para o bucket **privado** `hours-receipts`, sob
`<user_id>/<sha256>.<ext>`. Metadados ficam em `hours_finance_documents`, com RLS
por proprietário. Uma política restritiva limita o novo bucket ao proprietário
mesmo que outras apps tenham políticas Storage amplas. Não são publicados URLs
permanentes. A abertura de um documento usa download autenticado.

`hours_confirm_finance_document` usa SECURITY INVOKER, exige a conta autenticada
e confirma o documento e os valores numa transação. As categorias preenchidas
substituem as do mesmo tipo no mês, preservando gorjetas e outras parcelas. Assim,
alimentação visível no recibo e na Coverflex não é somada duas vezes. O resgate
mensal também é substituído, não somado a cada importação. Ficheiros com o mesmo
SHA-256 e documentos já confirmados não são importados novamente. Rever valores
antes de confirmar continua essencial: layouts e qualidade de imagem variam.

Migração: `sql/finance-documents.sql` (aplicada em Bacalhau). Só acrescenta recursos
HOURS; não altera dados nem permissões das outras aplicações. Políticas restritivas
são condicionadas ao novo bucket. A TIPS permanece independente.

Verificações adicionais:

```sh
node --test tests/receipt-reader.test.mjs
PLAYWRIGHT_PATH=/workspace/hours-tools/playwright-system.cjs node --test tests/documents.cjs tests/finance.cjs
PLAYWRIGHT_PATH=/workspace/hours-tools/playwright-system.cjs node tests/receipt-runtime.cjs
bash tests/finance-db.sh
```

O teste de runtime gera fotografia e PDF sintéticos e executa o OCR e a leitura
PDF reais. O teste PostgreSQL descartável verifica permissões de documentos e
ficheiros entre contas (mesmo com outra política Storage ampla), importação atómica,
preservação de gorjetas e não duplicação da alimentação e do resgate. Os testes
não incluem documentos ou dados pessoais reais.
