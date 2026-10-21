import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { contestCancellationFee, getCashDebts, respondToCashDebt, type CashDebt } from '@/features/perfil/debtService';
import { brl } from '@/utils/format';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';

function date(value: string | null | undefined) {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Não informado' : parsed.toLocaleString('pt-BR');
}

function statusLabel(status: CashDebt['resposta_passageiro']) {
  return ({ pendente: 'Aguardando sua resposta', confirmada: 'Você confirmou o registro', contestada: 'Em análise pelo suporte', prazo_esgotado: 'Prazo de resposta encerrado' })[status];
}

export default function DebtScreen() {
  const colors = useMoviTheme().colors;
  const styles = useThemeStyles(createStyles);
  const client = useQueryClient();
  const debtQuery = useQuery({ queryKey: ['cash-debts'], queryFn: getCashDebts });
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [feeDrafts, setFeeDrafts] = useState<Record<number, string>>({});
  const mutation = useMutation({
    mutationFn: ({ rideId, decision }: { rideId: number; decision: { decisao: 'confirmar' } | { decisao: 'contestar'; descricao: string } }) => respondToCashDebt(rideId, decision),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['cash-debts'] });
      if (result.suporte_chamado_id) Alert.alert('Contestação enviada', `O chamado #${result.suporte_chamado_id} foi aberto. A previsão de primeira resposta é de 24 a 48 horas.`);
      else Alert.alert('Resposta registrada', 'Sua confirmação registra ciência do valor informado. Ela não quita nem altera o débito.');
    },
    onError: (error) => Alert.alert('Não foi possível enviar', error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente.'),
  });
  const feeMutation = useMutation({
    mutationFn: ({ rideId, descricao }: { rideId: number; descricao: string }) => contestCancellationFee(rideId, descricao),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['cash-debts'] });
      Alert.alert('Contestação enviada', `O chamado #${result.suporte_chamado_id} foi aberto. O débito permanece registrado durante a análise. O crédito de R$ 3,00 já feito na carteira do motorista não é revertido automaticamente pela contestação.`);
    },
    onError: (error) => Alert.alert('Não foi possível enviar', error instanceof Error ? error.message : 'Verifique sua conexão e tente novamente.'),
  });

  if (debtQuery.isLoading) return <Screen title="Extrato e débito" loading />;
  if (debtQuery.isError || !debtQuery.data) return <Screen title="Extrato e débito" subtitle="Não foi possível carregar as cobranças." ><Card><Text style={styles.note}>Tente novamente quando sua conexão com o MOVI estiver disponível.</Text><Button title="Tentar novamente" onPress={() => void debtQuery.refetch()} /></Card></Screen>;

  const debts = debtQuery.data.debitos;
  const fees = debtQuery.data.taxas_cancelamento ?? [];
  const total = Number(debtQuery.data.total_pendente ?? 0);
  return <Screen title="Extrato e débito" subtitle="Consulte valores de corridas em dinheiro e responda ou conteste cada ocorrência.">
    <Card><Text style={styles.label}>Débito pendente total</Text><Text style={styles.total}>{brl(total)}</Text>{total >= 10 ? <Text style={styles.warning}>Novas solicitações de corrida ficam bloqueadas ao atingir R$ 10,00 em aberto.</Text> : total > 0 ? <Text style={styles.note}>Ao atingir R$ 10,00, novas solicitações serão bloqueadas até a liquidação confirmada.</Text> : <Text style={styles.ok}>Não há débito pendente.</Text>}</Card>
    {total > 0 ? <Card><Text style={styles.note}>A quitação digital ainda não está habilitada. Confirmar ou contestar um registro não movimenta dinheiro nem baixa o saldo.</Text></Card> : null}
    {debts.map((item) => {
      const canAcknowledge = item.resposta_passageiro === 'pendente';
      const canDispute = item.resposta_passageiro === 'pendente' || item.resposta_passageiro === 'prazo_esgotado';
      const draft = drafts[item.corrida_id] ?? '';
      return <Card key={item.corrida_id}>
        <Text style={styles.rideTitle}>Corrida #{item.corrida_id}</Text>
        <Text style={styles.route}>{item.origem} → {item.destino}</Text>
        <Text style={styles.meta}>Finalizada: {date(item.finalizada_em)}</Text>
        <View style={styles.divider} />
        <Text style={styles.row}>Valor da corrida <Text style={styles.amount}>{brl(item.valor_devido)}</Text></Text>
        <Text style={styles.row}>Informado como recebido <Text style={styles.amount}>{brl(item.valor_recebido)}</Text></Text>
        <Text style={styles.row}>Diferença registrada <Text style={styles.amount}>{brl(item.diferenca_debito)}</Text></Text>
        <Text style={styles.debtAmount}>Saldo desta ocorrência: {brl(item.saldo_pendente)}</Text>
        <Text style={styles.response}>{statusLabel(item.resposta_passageiro)}</Text>
        {item.resposta_passageiro === 'pendente' ? <Text style={styles.note}>Prazo para responder: {date(item.prazo_resposta_em)}. Se não houver resposta, o sistema registra apenas o prazo encerrado.</Text> : null}
        {item.resposta_passageiro === 'contestada' ? <Text style={styles.note}>Chamado #{item.suporte_chamado_id ?? '—'} · primeira resposta prevista entre {date(item.resposta_prevista_min_em)} e {date(item.resposta_prevista_max_em)}.</Text> : null}
        {item.resposta_passageiro === 'confirmada' ? <Text style={styles.note}>Sua confirmação registra ciência do relato do motorista; o débito permanece até liquidação financeira confirmada.</Text> : null}
        {item.resposta_passageiro === 'prazo_esgotado' ? <Text style={styles.note}>A falta de resposta não foi considerada confirmação. Você ainda pode contestar para solicitar análise.</Text> : null}
        {canAcknowledge ? <View style={styles.buttonWrap}><Button title="Confirmar que vi o registro" compact onPress={() => Alert.alert('Confirmar registro?', 'Isso registra apenas que você tomou ciência do valor. Não é uma confirmação bancária e não quita o débito.', [{ text: 'Voltar', style: 'cancel' }, { text: 'Confirmar ciência', onPress: () => mutation.mutate({ rideId: item.corrida_id, decision: { decisao: 'confirmar' } }) }])} disabled={mutation.isPending} /></View> : null}
        {canDispute ? <>
          <TextInput value={draft} onChangeText={(value) => setDrafts((current) => ({ ...current, [item.corrida_id]: value.slice(0, 2000) }))} placeholder="Explique por que você discorda (mínimo 20 caracteres)" placeholderTextColor={colors.muted} multiline maxLength={2000} style={styles.input} accessibilityLabel={`Motivo da contestação da corrida ${item.corrida_id}`} />
          <View style={styles.buttonWrap}><Button title="Contestar e pedir análise" variant="secondary" compact onPress={() => {
            if (draft.trim().length < 20) return Alert.alert('Explique sua contestação', 'Informe pelo menos 20 caracteres para ajudar o suporte a analisar o caso.');
            mutation.mutate({ rideId: item.corrida_id, decision: { decisao: 'contestar', descricao: draft.trim() } });
          }} disabled={mutation.isPending} loading={mutation.isPending} /></View>
        </> : null}
      </Card>;
    })}
    {fees.map((fee) => {
      const draft = feeDrafts[fee.corrida_id] ?? '';
      return <Card key={`taxa-${fee.corrida_id}`}>
        <Text style={styles.rideTitle}>Taxa de cancelamento · Corrida #{fee.corrida_id}</Text>
        <Text style={styles.route}>{fee.origem} → {fee.destino}</Text>
        <Text style={styles.meta}>R$ 3,00 aplicados porque o motorista aceitou e o cancelamento ocorreu 180 segundos ou mais após o aceite.</Text>
        <Text style={styles.row}>Débito pendente <Text style={styles.amount}>{brl(fee.valor)}</Text></Text>
        <Text style={styles.note}>O MOVI já creditou R$ 3,00 na carteira interna do motorista. Esse crédito é um adiantamento da plataforma, não uma transferência bancária. Seu débito permanece em aberto até a quitação; contestar não o apaga nem reverte automaticamente o crédito.</Text>
        {fee.status === 'contestada' ? <Text style={styles.response}>Em análise · chamado #{fee.suporte_chamado_id ?? '—'} · primeira resposta prevista entre {date(fee.resposta_prevista_min_em)} e {date(fee.resposta_prevista_max_em)}.</Text> : <>
          <TextInput value={draft} onChangeText={(value) => setFeeDrafts((current) => ({ ...current, [fee.corrida_id]: value.slice(0, 2000) }))} placeholder="Explique por que você contesta (mínimo 20 caracteres)" placeholderTextColor={colors.muted} multiline maxLength={2000} style={styles.input} accessibilityLabel={`Motivo da contestação da taxa da corrida ${fee.corrida_id}`} />
          <View style={styles.buttonWrap}><Button title="Contestar taxa e pedir análise" variant="secondary" compact onPress={() => {
            if (draft.trim().length < 20) return Alert.alert('Explique sua contestação', 'Informe pelo menos 20 caracteres para ajudar o suporte a analisar o caso.');
            feeMutation.mutate({ rideId: fee.corrida_id, descricao: draft.trim() });
          }} disabled={feeMutation.isPending} loading={feeMutation.isPending} /></View>
        </>}
      </Card>;
    })}
  </Screen>;
}

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({
  label: { color: colors.muted, fontSize: 13 }, total: { fontSize: 34, fontWeight: '900', color: colors.text, marginVertical: 8 }, ok: { color: colors.success, fontWeight: '800' }, note: { color: colors.muted, lineHeight: 20, marginTop: 8 }, warning: { color: colors.danger, fontWeight: '800', lineHeight: 20 }, rideTitle: { color: colors.text, fontSize: 19, fontWeight: '900' }, route: { color: colors.text, lineHeight: 20, marginTop: 6 }, meta: { color: colors.muted, fontSize: 12, marginTop: 6 }, divider: { borderBottomWidth: 1, borderColor: colors.border, marginVertical: 12 }, row: { color: colors.muted, marginVertical: 3 }, amount: { color: colors.text, fontWeight: '800' }, debtAmount: { color: colors.danger, fontWeight: '900', marginTop: 8 }, response: { color: colors.text, fontWeight: '800', marginTop: 12 }, input: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.bg, padding: 12, marginTop: 12, textAlignVertical: 'top', color: colors.text }, buttonWrap: { marginTop: 10, minHeight: 44 },
}); }
