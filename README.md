# MOVI Motorista

Aplicativo mobile do motorista parceiro, conectado ao MOVI Backend V3. O fluxo principal cobre acesso e renovação de sessão, cadastro de motorista e veículo, envio privado de documentos, disponibilidade, ofertas em tempo real, embarque com código, localização da corrida, finalização financeira, extrato e conta.

## Requisitos

- Node.js 22.13 ou superior, na linha 22.x ou 24.x.
- Android Studio para build local Android; Xcode em macOS para iOS.
- Expo development build. O Mapbox usa código nativo e não funciona no Expo Go.
- Backend MOVI V3, PostgreSQL, Redis, worker de despacho, storage privado e Mapbox configurados.

## Configuração local

1. Copie `.env.example` para `.env`.
2. Configure `EXPO_PUBLIC_API_URL` com a API local. Para Android Emulator, use `http://10.0.2.2:3000`; para simulador iOS, use `http://localhost:3000`.
3. Para mapas, configure um token público `pk...` em `EXPO_PUBLIC_MAPBOX_TOKEN`. O token de download nativo `MAPBOX_DOWNLOAD_TOKEN` é privado e deve ficar no ambiente de build ou nos secrets da EAS, nunca em uma variável `EXPO_PUBLIC_*`.
4. Instale dependências com `npm ci`.
5. Inicie com `npm start` e abra a development build. Para gerar projeto nativo local, use `npm run prebuild`; depois `npm run android` ou `npm run ios`.

Este app já está associado ao projeto EAS em `app.config.js`. Para push Android, configure as credenciais FCM V1 e coloque o `google-services.json` do Firebase correspondente ao pacote `br.com.movi.motorista` na raiz. Defina `GOOGLE_SERVICES_JSON=./google-services.json` antes do prebuild.

Builds de produção aceitam somente API em HTTPS. HTTP fica restrito a builds de desenvolvimento.

## Fluxos conectados

- O login mantém o access token apenas em memória. O refresh token rotativo fica no SecureStore; respostas 401 tentam renovar a sessão uma vez.
- O cadastro envia dados pessoais, UF/cidade, categoria, CNH declarada e identificação do veículo. A conta começa em análise; a tela online fica bloqueada até aprovação pelo backend.
- RG, CNH, foto de perfil e documento do veículo são enviados ao storage privado do V3. A tela abre documentos apenas por URLs assinadas e temporárias.
- O motorista escolhe quando fica online. A localização não é solicitada offline. Para ficar online o app pede localização em primeiro plano e permissão de segundo plano/“Sempre”; durante disponibilidade ou corrida ativa envia coordenadas ao endpoint autenticado, inclusive com a tela bloqueada. O servidor valida aprovação, status e vínculo com a corrida.
- Push de ofertas e mudanças de corrida usa Expo Notifications. O token é registrado no Backend V3 por conta/aparelho e removido no logout ou quando desativado nas configurações.
- As ofertas usam `nova_oferta_corrida` e os campos que o backend V3 emite. O aceite e a recusa usam endpoints com `Idempotency-Key`.
- Para começar uma corrida, o passageiro apresenta o código de embarque exibido no app dele. O servidor valida o código, conta tentativas incorretas e aplica bloqueio temporário após cinco erros.
- A finalização informa apenas o valor recebido em dinheiro. Pagamento digital só é concluído se o backend já o tiver confirmado pelo provedor.
- O extrato e os ganhos vêm da API; o app não calcula tarifa, comissão, saldo ou quitação.

## Segurança e privacidade

- Nunca coloque chaves do backend, JWT, credenciais Supabase ou o token privado de download Mapbox no app.
- O backend decide conta aprovada, disponibilidade, oferta válida, propriedade da corrida, transições e valores financeiros.
- A tela não permite iniciar uma corrida sem validar o código no servidor.
- O app não registra tokens, coordenadas ou dados de documentos em logs.
- Localização em segundo plano usa tarefa nativa Expo Task Manager e serviço em primeiro plano Android; precisa de development build e permissão do sistema. O sistema operacional pode interromper tarefas se o usuário forçar o encerramento ou restringir bateria; o app sincroniza novamente ao reabrir. Push exige credenciais de projeto EAS/FCM/APNs e aparelho físico. O token é armazenado com SecureStore e enviado autenticado ao Backend V3.

## Contratos backend

- `POST /api/motoristas` e `POST /api/motoristas/login`
- `GET /api/motoristas/perfil`
- `POST /api/motoristas/documentos`
- `POST /api/motoristas/localizacao` (atualizações autenticadas de localização em segundo plano)
- `POST /api/notificacoes/dispositivo` e `DELETE /api/notificacoes/dispositivo`
- `GET /api/corridas/ofertas`
- `POST /api/corridas/:id/aceitar` e `/recusar`
- `POST /api/corridas/:id/iniciar` com `codigo_embarque`
- `POST /api/corridas/:id/finalizar` com estado de pagamento recebido
- `GET /api/corridas/:id` e `GET /api/extrato`
- Socket.IO: `nova_oferta_corrida`, `definir_disponibilidade`, `atualizar_localizacao` e `heartbeat`

## Próxima validação

Push remoto, compartilhamento seguro e envio de localização em segundo plano estão implementados no código dos apps e do Backend V3. Precisam agora de instalação limpa das dependências, migration `008`, credenciais push e validação em development builds Android/iOS com API acessível. Push pode ser testado em aparelho físico ou emulador compatível com Google Play Services. O app motorista exige permissão de localização “Sempre” para ficar online; teste também revogação de permissão, perda de rede, logout, encerramento pelo sistema e recuperação ao reabrir. Pagamentos/saques ficam para depois da integração do provedor. Antes da operação em Caruaru, defina canal de resposta a incidentes e valide requisitos locais, seguro, monitoramento, backups e recuperação.
