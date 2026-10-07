## Dependências Expo SDK 57

Este projeto está fixado na linha Expo SDK 57 / React 19.2.3 / React Native 0.86.0. As dependências de testes e do Development Client devem permanecer alinhadas a essas versões.

# MOVI Passageiro

Aplicativo mobile do passageiro construído especificamente para o **MOVI Backend V3**.

Este repositório é uma base de produção: autenticação, sessão, chamadas REST, realtime, localização, mapa, corrida, conta, documentos, legal, avaliação, denúncia e testes automatizados estão separados por domínio.

> Nenhum software é "sem falhas" por garantia. Este projeto foi estruturado para reduzir classes comuns de falhas e para permitir validação automatizada antes de cada mudança.

## Stack

- Expo SDK 57 / React Native 0.86 / React 19.2.3
- Expo Router ~57.0.23
- TypeScript strict
- TanStack Query 5
- Zustand 5
- SecureStore
- Socket.IO Client 4.8.3
- Expo Location
- Expo Notifications (registro no Backend V3 e abertura de corridas por push)
- Mapbox via `@rnmapbox/maps` 10.3.5
- Jest + jest-expo + React Native Testing Library

A linha SDK 57 corresponde a React Native 0.86 e Node mínimo 22.13.x. O Router recomendado na linha 57 é ~57.0.23.

## Arquitetura

```text
Tela
  ↓
Hook / Service de domínio
  ↓
API Client / Socket Client
  ↓
MOVI Backend V3
  ↓
PostgreSQL / Redis / Mapbox / Worker
```

Princípios:

- REST é a fonte oficial do estado persistente.
- Socket.IO entrega mudanças em tempo real.
- Depois de reconectar, o app consulta o estado oficial.
- Access token fica em memória.
- Refresh token fica no SecureStore.
- Operações críticas usam `Idempotency-Key`.
- Preço nunca é calculado no cliente.
- Nenhuma chave secreta do backend entra no aplicativo.

## Integração V3

Veja `docs/BACKEND_V3_INTEGRATION.md` para a matriz completa de rotas/eventos.

O cliente usa exatamente os endpoints atuais do V3 para passageiro, corrida, histórico, documentos, avaliação, denúncia e legal. O backend do snapshot também exige `Bearer` nos requests autenticados e usa access token no Socket.IO.

## Mapbox

`@rnmapbox/maps` exige código nativo e não funciona no Expo Go; é necessário development build/prebuild. Use somente um **public token `pk...`** no aplicativo. O pacote exige configuração nativa via config plugin e rebuild.

Configure:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
EXPO_PUBLIC_MAPBOX_TOKEN=pk.seu_token_publico
MAPBOX_DOWNLOAD_TOKEN=seu_download_token_privado_de_build
```

`MAPBOX_DOWNLOAD_TOKEN` é um token secreto Mapbox com permissão `Downloads:Read`; não usa prefixo `EXPO_PUBLIC_` e só é necessário durante build/prebuild. Nunca coloque esse segredo ou qualquer segredo do backend em variáveis públicas.

Copie `.env.example` para `.env` na raiz deste projeto e configure os valores no arquivo local. O `.env` é ignorado pelo Git; nunca o envie por chat nem o publique.

O projeto EAS deste app está associado em `app.config.js`. Para push Android, configure as credenciais FCM V1 e coloque na raiz o `google-services.json` do Firebase correspondente ao pacote `br.com.movi.passageiro`. Defina `GOOGLE_SERVICES_JSON=./google-services.json` antes do prebuild.

## Android local

### Emulador

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
```

### Aparelho físico

Use o IPv4 da máquina na mesma rede, por exemplo:

```env
EXPO_PUBLIC_API_URL=http://192.168.0.10:3000
```

O backend precisa aceitar a origem/rede correspondente quando o ambiente exigir CORS.

## Instalação

Node >= 22.13.0.

```bash
npm install
npx expo install --fix
```

Validação:

```bash
npm run typecheck
npm test -- --coverage
npm run lint
npm run doctor
npm run verify
```

Para Android nativo:

```bash
npx expo prebuild --clean
npx expo run:android
```

Ou development build:

```bash
eas build --profile development --platform android
```

Mapbox e push notifications remotos precisam de build de desenvolvimento/produção, não de Expo Go no Android.

## Testes automatizados

A pasta `tests/` valida pelo menos:

- formatação de valores;
- geração de `Idempotency-Key`;
- máquina visual de estados;
- limpeza de sessão;
- headers de autenticação e request id;
- refresh após HTTP 401;
- integração dos endpoints de estimativa/solicitação;
- comportamento do botão.

## O que ainda depende de evolução do backend V3

Este snapshot não mascara limitações reais do backend:

1. **Cartão/Pix e saques:** permanecem fora do fluxo até existir um provedor de pagamento real no backend.
2. **OpenAPI:** o cliente foi tipado manualmente a partir do contrato atual; a próxima evolução recomendada é gerar os tipos/clientes a partir de OpenAPI.
3. **Corrida:** os testes finais E2E devem ser feitos com passageiro + motorista no ambiente de DEV/STAGING, usando o backend real.
4. **Push:** configure credenciais do EAS/FCM/APNs, migre o backend e valide entrega/abertura em aparelhos físicos.

## Segurança

- Não salvar senha.
- Não salvar access token em AsyncStorage.
- Não colocar `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` ou segredos Mapbox no app.
- Não confiar no preço exibido até o backend confirmar a operação.
- Não repetir automaticamente mutações críticas.
- Tratar reconexão do Socket como estado intermediário e sincronizar por REST.
- Documentos são mantidos em storage privado pelo backend.

## Próxima etapa planejada

Passageiro e motorista já possuem fluxos de push e compartilhamento seguro integrados ao contrato do Backend V3. A próxima etapa é instalar as dependências, aplicar migrations e validar os fluxos nos builds nativos Android/iOS com backend de desenvolvimento. Pagamentos/saques continuam aguardando o provedor real.
