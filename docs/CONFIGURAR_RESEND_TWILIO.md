# Configuração de e-mail e SMS para recuperação de senha

O MOVI V3 já possui integração de envio para **Resend (e-mail)** e **Twilio (SMS)**. Este guia configura os canais sem colocar credenciais no app móvel, no Git ou em mensagens.

## Resend — recuperação por e-mail

1. Crie ou acesse a conta Resend e adicione um domínio que você controla.
2. Publique no DNS os registros SPF/DKIM apresentados pelo Resend e aguarde a verificação do domínio.
3. Crie uma API key com permissão de envio (`sending access`) e, se disponível, restrinja-a ao domínio verificado. Guarde-a no gerenciador de segredos.
4. Escolha um remetente desse domínio, por exemplo `MOVI <nao-responda@SEU-DOMINIO>`. O domínio precisa estar verificado antes de enviar para usuários.

Configure no `.env` do V3:

```dotenv
RESEND_API_KEY=re_...
PASSWORD_RECOVERY_EMAIL_FROM=MOVI <nao-responda@SEU-DOMINIO>
```

O endereço acima é um exemplo de formato; substitua pelo domínio real verificado da MOVI. Não use um endereço de terceiros nem publique a chave.

## Twilio — recuperação por SMS

1. Crie ou acesse uma conta Twilio e habilite Programmable Messaging.
2. Obtenha o Account SID da conta e crie uma API key dedicada ao serviço MOVI. Guarde o SID e o secret da API key no cofre de segredos. Prefira uma chave `Restricted` com permissão de criação de mensagens quando disponível; se a região/conta não permitir esse tipo, use uma chave `Standard` dedicada. O Auth Token principal fica apenas como alternativa temporária para desenvolvimento.
3. Configure um sender habilitado para o seu caso de uso e confirme no Console as regras atuais de entrega para o Brasil. Para números, use formato internacional E.164. A disponibilidade e a preservação do identificador do remetente variam por tipo de sender e operadora; confira as regras de Brasil da Twilio antes de escolher.
4. Em contas de teste/trial, confira as restrições de destino e de sender antes de testar. Envio internacional e regras de operadoras podem exigir configuração adicional.

Configure no `.env` do V3:

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_API_KEY_SID=SK...
TWILIO_API_KEY_SECRET=...
TWILIO_FROM_NUMBER=+55...
```

`TWILIO_AUTH_TOKEN` pode ser usado temporariamente no ambiente local se ainda não houver API key. Não o configure em produção quando uma chave dedicada estiver disponível.

O serviço normaliza telefones brasileiros para `+55` quando o destino ainda não tem código do país. Os números devem continuar validados no cadastro; não registre códigos OTP nem telefones completos nos logs. A Twilio pode exigir sender global habilitado para A2P no Brasil; número local brasileiro pode ter restrição de uso para mensagens P2P, então valide o tipo de tráfego antes de contratar.

## Segurança e implantação

- Mantenha `.env` fora do Git. Para produção, cadastre as mesmas variáveis no cofre de segredos do host (por exemplo, Render Environment) e não envie `.env` por e-mail ou chat.
- Use uma chave de envio do Resend, não uma chave com permissões administrativas. Restrinja o acesso ao projeto e rotacione a chave se ela for exposta.
- Restrinja o acesso ao Twilio Console; nunca exponha a API key, o secret ou o Auth Token no PSG, MTA, site público, logs ou respostas HTTP. Revogue a chave dedicada se houver suspeita de exposição.
- Após configurar os segredos, reinicie o V3. A API deve responder `503 RECOVERY_CHANNEL_UNAVAILABLE` enquanto o canal solicitado não estiver configurado; isso é intencional e evita alegar que um código foi enviado.
- O código expira em 10 minutos, tem limite de tentativas e não deve aparecer nas respostas da API nem nos logs.

## Verificação controlada

1. Reinicie o MOVI V3 e confirme que iniciou sem erros.
2. Solicite recuperação para uma conta de teste cujo e-mail/telefone você controla.
3. Confirme o recebimento pelo Resend/Twilio e use o código somente no fluxo do app.
4. Verifique código incorreto, código expirado, limite de tentativas e redefinição concluída. Confirme também que sessões antigas deixam de funcionar.
5. Não teste enviando OTP a clientes reais. Confira os registros de entrega nos consoles dos provedores, sem copiar segredos ou códigos para tickets.

## O que falta para ativar

O código está integrado, mas o canal não fica operacional até que o proprietário da conta configure domínio/remetente no Resend e sender/credenciais no Twilio, insira os valores no ambiente local e no ambiente de produção, e faça o teste controlado acima. Não é necessário compartilhar os segredos com o assistente.

Referências oficiais:

- [Resend — enviar e-mails](https://resend.com/docs/api-reference/emails/send-email)
- [Resend — configurar domínio](https://resend.com/docs/dashboard/domains/introduction)
- [Twilio — enviar SMS pela Messaging API](https://www.twilio.com/docs/messaging/tutorials/how-to-send-sms-messages)
- [Twilio — autenticação de API](https://www.twilio.com/docs/usage/requests-to-twilio)
- [Twilio — tipos de API key e criação](https://www.twilio.com/docs/iam/api-keys/keys-in-console)
