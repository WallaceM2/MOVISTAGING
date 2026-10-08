# MOVI — Despacho por categoria

O backend trata `carro` e `moto` como categorias distintas em quatro camadas:

1. **Corrida:** `corridas.categoria` é obrigatória para novas solicitações.
2. **Motorista:** `motoristas.categoria` identifica a categoria atualmente aprovada.
3. **Redis:** há GEO sets separados para motoristas de `carro` e `moto`.
4. **Demanda:** há GEO sets separados para pedidos de `carro` e `moto`.

Na oferta:

```text
corrida.categoria == motorista.categoria
```

é uma condição obrigatória tanto no serviço de despacho quanto no PostgreSQL.

## Ciclo

```text
passageiro escolhe MOTO
        ↓
cria corrida categoria=moto
        ↓
calcula tarifa moto
        ↓
busca somente motoristas:moto
        ↓
offer:motorista
        ↓
aceite protegido
        ↓
encerra demais ofertas
```

O mesmo fluxo existe para `carro`.

## Concorrência

O backend usa:

- lock da linha da corrida;
- índice de uma oferta ativa por corrida;
- índice de uma corrida ativa por motorista;
- índice de uma corrida ativa por passageiro;
- atualização condicional `status='solicitada' AND motorista_id IS NULL`;
- oferta vinculada ao motorista específico.

Isso evita que dois motoristas fiquem vinculados à mesma corrida e reduz conflitos entre telas abertas/reconexões.

## Roteamento e moto

O Mapbox Directions v5 disponibiliza perfis `driving`, `driving-traffic`, `walking` e `cycling`; não há um perfil específico de motocicleta na API. O MOVI, portanto, usa `driving` como aproximação de rota para moto e mantém a categoria de despacho separada. Antes do lançamento público, valide regras municipais, vias restritas e eventuais necessidades de roteamento específico para motocicletas.
