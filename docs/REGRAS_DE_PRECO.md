# MOVI — Regras de preço e repasse

## Regra econômica atual

A política do produto é:

- **15%** do valor bruto da corrida = taxa do Movi.
- **85%** do valor bruto da corrida = repasse econômico do motorista/motoqueiro.

A divisão é persistida na corrida e protegida por `CHECK CONSTRAINT` no PostgreSQL. O app nunca deve confiar em percentuais enviados pelo frontend.

## Piso por quilômetro

**Interpretação adotada no backend:** os valores de R$ 1,00/km (moto) e R$ 1,50/km (carro) são pisos líquidos do parceiro. A meta de R$ 2,00/km para carro é uma meta comercial configurável, não uma garantia de remuneração independente da viagem. Se a regra comercial futura for um preço pago pelo passageiro em vez de um piso líquido do parceiro, apenas a tabela de tarifas e a regra de cálculo precisam ser alteradas.

O piso informado pelo produto é tratado como **piso líquido do parceiro**, porque o parceiro recebe 85% do valor bruto.

| Categoria | Piso líquido do parceiro | Bruto mínimo equivalente por km com 15% de comissão |
|---|---:|---:|
| Moto | R$ 1,00/km | R$ 1,1765/km |
| Carro | R$ 1,50/km | R$ 1,7647/km |
| Carro — meta | R$ 2,00/km | R$ 2,3529/km |

A tabela `movi_tarifas` é a fonte de verdade. Os valores acima são a configuração global inicial; cada área de operação pode receber sua própria tarifa quando o produto passar a operar em múltiplas cidades.

## Fórmula base

```text
bruto = taxa_base + (distancia_km × valor_por_km_cliente) + (tempo_min × valor_por_minuto_cliente)

se bruto < tarifa_minima_cliente:
    bruto = tarifa_minima_cliente

bruto = bruto × multiplicador_dinamica

taxa_movi = arredondar(bruto × 15%, 2)
repasse_parceiro = arredondar(bruto - taxa_movi, 2)
```

O arredondamento do repasse usa o restante do valor depois da comissão para evitar diferença de 1 centavo entre as duas parcelas.

## Dinâmica

A dinâmica considera **demanda e disponibilidade da mesma categoria**. Uma solicitação de moto não aumenta a demanda usada para precificar carro e vice-versa.

O multiplicador pode variar entre 1x e 3x na configuração inicial e deve ser exibido ao passageiro de forma transparente conforme a interface do aplicativo.

## Importante para operação real

A política comercial deve ser validada por jurídico/contabilidade e pelas regras locais da área de operação. Tarifas, taxas, tributos, descontos, cancelamentos e eventuais preços mínimos precisam ser apresentados de forma clara ao consumidor antes da contratação quando exigido.
