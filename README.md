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
- “Ativar Face ID”, depois de entrar numa conta confirmada, chama `registerPasskey()`.
- “Entrar com Face ID” chama `signInWithPasskey()`, sem exigir email. O dispositivo
  escolhe Face ID, Touch ID, PIN ou outro autenticador disponível.

## Configuração no Supabase

Em **Authentication → URL Configuration**, confirmar:

- Site URL: `https://nth8m6fcs7-byte.github.io/Hours/`
- Redirect URLs: incluir exatamente `https://nth8m6fcs7-byte.github.io/Hours/`

Em **Authentication → Passkeys**, ativar Passkey authentication e configurar:

- Relying Party Display Name: `As Minhas Horas`
- Relying Party ID: `nth8m6fcs7-byte.github.io`
- Relying Party Origins: `https://nth8m6fcs7-byte.github.io`

O origin não inclui `/Hours/`. Manter o RP ID depois de registar passkeys.
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
`node --test tests/auth.cjs`. Opcionalmente, definir `BROWSER_CHANNEL=msedge`
para usar Microsoft Edge e `PLAYWRIGHT_PATH` para apontar a uma instalação existente.

O envio real do email, um link real de recuperação e a cerimónia biométrica precisam
de uma conta de teste e de validação no dispositivo; os testes simulados não os comprovam.
