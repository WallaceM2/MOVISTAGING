import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Surface } from "@/components/ui";
import { getDriverStatement } from "@/features/corrida/corridaService";
import { getPayoutSetup, savePayoutAccount, saveWithdrawalPin, type PayoutAccountInput } from "@/features/financeiro/saqueService";
import type { DriverPalette } from "@/theme";
import { useMoviTheme, useThemeStyles } from "@/theme/ThemeProvider";

const money = (value: number | string | null | undefined) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const emptyAccount: PayoutAccountInput = { tipo_chave_pix: "cpf", chave_pix: "", banco: "", agencia: "", conta: "", tipo_conta: "corrente" };

export default function DriverEarningsScreen() {
  const { colors: palette } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
  const client = useQueryClient();
  const statement = useQuery({ queryKey: ["driver-statement"], queryFn: () => getDriverStatement(1, 0) });
  const payout = useQuery({ queryKey: ["driver-payout-setup"], queryFn: getPayoutSetup });
  const [account, setAccount] = useState(emptyAccount);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const accountMutation = useMutation({ mutationFn: savePayoutAccount, onSuccess: async () => { setAccount(emptyAccount); setAccountFormOpen(false); await client.invalidateQueries({ queryKey: ["driver-payout-setup"] }); Alert.alert("Dados protegidos", "A chave Pix e os dados bancários foram salvos. Saques serão liberados após a integração e validação do provedor."); } });
  const pinMutation = useMutation({ mutationFn: () => saveWithdrawalPin(newPin, currentPin || undefined), onSuccess: async () => { setCurrentPin(""); setNewPin(""); await client.invalidateQueries({ queryKey: ["driver-payout-setup"] }); Alert.alert("PIN configurado", "Seu PIN foi protegido. Ele será exigido quando o fluxo real de saque estiver habilitado."); } });
  const busy = accountMutation.isPending || pinMutation.isPending;

  function submitAccount() {
    if (!account.chave_pix.trim() || !account.banco.trim() || !account.agencia.trim() || !account.conta.trim()) {
      Alert.alert("Confira os dados", "Preencha a chave Pix, o banco, a agência e a conta para continuar."); return;
    }
    accountMutation.mutate({ ...account, chave_pix: account.chave_pix.trim(), banco: account.banco.trim(), agencia: account.agencia.trim(), conta: account.conta.trim() });
  }
  function submitPin() {
    if (!/^\d{4}$/.test(newPin) || (payout.data?.conta?.pin_configurado && !/^\d{4}$/.test(currentPin))) {
      Alert.alert("PIN inválido", payout.data?.conta?.pin_configurado ? "Informe o PIN atual e um novo PIN com 4 dígitos." : "Escolha um PIN com exatamente 4 dígitos."); return;
    }
    pinMutation.mutate();
  }

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={statement.isRefetching || payout.isRefetching} onRefresh={() => { void statement.refetch(); void payout.refetch(); }} tintColor={palette.forest} />}>
    <Text style={styles.eyebrow}>SUA VIDA FINANCEIRA</Text><Text style={styles.title}>Meus ganhos</Text><Text style={styles.subtitle}>Resumo da carteira e configuração do recebimento.</Text>
    {statement.isLoading ? <ActivityIndicator color={palette.forest} /> : null}
    {statement.isError ? <Surface style={styles.infoCard}><Text style={styles.cardTitle}>Não foi possível carregar seus ganhos</Text><Text style={styles.body}>O saldo aparecerá quando os dados financeiros forem confirmados. Atualize para tentar novamente.</Text><Pressable onPress={() => void statement.refetch()}><Text style={styles.link}>Tentar novamente</Text></Pressable></Surface> : <Surface style={styles.earningsCard}>
      <View style={styles.cardHeading}><View style={styles.iconBox}><MaterialCommunityIcons name="wallet-outline" size={21} color={palette.forest} /></View><Text style={styles.totalLabel}>GANHOS NAS ÚLTIMAS 24H</Text></View>
      <Text style={styles.totalValue}>{money(statement.data?.ganhos_ultimas_24h)}</Text>
      <Text style={styles.bodyOnDark}>Ganhos acumulados: {money(statement.data?.ganhos_acumulados)}</Text>
      <View style={styles.dividerOnDark} />
      <View style={styles.balanceRow}><View><Text style={styles.balanceValue}>{money(statement.data?.saldo_total)}</Text><Text style={styles.balanceLabel}>Saldo operacional · carteira MOVI</Text></View><MaterialCommunityIcons name="information-outline" size={19} color="#C5D7CE" /></View>
    </Surface>}
    {Number(statement.data?.repasse_pendente ?? 0) > 0 ? <Surface style={styles.infoCard}><Text style={styles.body}>Repasse pendente de acerto: {money(statement.data?.repasse_pendente)}. Esse valor não é saldo disponível para saque.</Text></Surface> : null}

    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Saque</Text><Text style={styles.sectionHint}>Preparação para recebimento futuro</Text></View>
    <Surface style={styles.infoCard}>
      <View style={styles.cardHeading}><MaterialCommunityIcons name="shield-lock-outline" size={21} color={palette.forest} /><Text style={styles.cardTitle}>Dados de recebimento</Text></View>
      {payout.isLoading ? <ActivityIndicator color={palette.forest} /> : null}
      {payout.isError ? <Text style={styles.body}>Não foi possível consultar os dados de recebimento.</Text> : payout.data?.conta ? <View style={styles.savedAccount}><Text style={styles.savedLine}>Pix · {payout.data.conta.chave_pix_mascarada}</Text><Text style={styles.body}>Conta · {payout.data.conta.conta_mascarada || "não informada"}</Text><Text style={styles.body}>PIN de saque · {payout.data.conta.pin_configurado ? "configurado" : "não configurado"}</Text></View> : <Text style={styles.body}>Cadastre sua chave Pix e os dados bancários. Essas informações são protegidas e usadas para processar seus recebimentos.</Text>}
      <Pressable accessibilityRole="button" onPress={() => setAccountFormOpen((open) => !open)} style={styles.outlineButton}><MaterialCommunityIcons name={accountFormOpen ? "close" : "bank-plus"} size={18} color={palette.forest} /><Text style={styles.outlineText}>{accountFormOpen ? "Fechar cadastro" : payout.data?.conta ? "Alterar dados" : "Cadastrar dados Pix e conta"}</Text></Pressable>
      {accountFormOpen ? <View style={styles.form}>
        <Text style={styles.fieldLabel}>Tipo de chave Pix</Text>
        <View style={styles.chipRow}>{(["cpf", "email", "telefone", "aleatoria"] as const).map((type) => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: account.tipo_chave_pix === type }} onPress={() => setAccount({ ...account, tipo_chave_pix: type })} style={[styles.chip, account.tipo_chave_pix === type && styles.chipSelected]}><Text style={[styles.chipText, account.tipo_chave_pix === type && styles.chipTextSelected]}>{type === "aleatoria" ? "Aleatória" : type === "telefone" ? "Telefone" : type.toUpperCase()}</Text></Pressable>)}</View>
        <Field label="Chave Pix" value={account.chave_pix} onChangeText={(v) => setAccount({ ...account, chave_pix: v })} placeholder="Digite sua chave" styles={styles} palette={palette} />
        <Field label="Banco" value={account.banco} onChangeText={(v) => setAccount({ ...account, banco: v })} placeholder="Nome do banco" styles={styles} palette={palette} />
        <View style={styles.splitFields}><View style={styles.fieldHalf}><Field label="Agência" value={account.agencia} onChangeText={(v) => setAccount({ ...account, agencia: v })} placeholder="Agência" styles={styles} palette={palette} /></View><View style={styles.fieldHalf}><Field label="Conta" value={account.conta} onChangeText={(v) => setAccount({ ...account, conta: v })} placeholder="Número da conta" styles={styles} palette={palette} /></View></View>
        <Text style={styles.fieldLabel}>Tipo de conta</Text><View style={styles.chipRow}>{(["corrente", "poupanca", "pagamento"] as const).map((type) => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: account.tipo_conta === type }} onPress={() => setAccount({ ...account, tipo_conta: type })} style={[styles.chip, account.tipo_conta === type && styles.chipSelected]}><Text style={[styles.chipText, account.tipo_conta === type && styles.chipTextSelected]}>{type === "poupanca" ? "Poupança" : type === "corrente" ? "Corrente" : "Pagamento"}</Text></Pressable>)}</View>
        <Pressable accessibilityRole="button" disabled={busy} onPress={submitAccount} style={[styles.primaryButton, busy && styles.disabled]}>{accountMutation.isPending ? <ActivityIndicator color={palette.bg} /> : <Text style={styles.primaryText}>Salvar dados protegidos</Text>}</Pressable>
        {accountMutation.isError ? <Text style={styles.errorText}>{accountMutation.error.message}</Text> : null}
      </View> : null}
    </Surface>

    <Surface style={styles.infoCard}>
      <View style={styles.cardHeading}><MaterialCommunityIcons name="dialpad" size={21} color={palette.forest} /><Text style={styles.cardTitle}>PIN de saque</Text></View>
      {!payout.data?.conta ? <Text style={styles.body}>Cadastre os dados de recebimento antes de configurar o PIN.</Text> : <>
        {payout.data.conta.pin_configurado ? <Field label="PIN atual" value={currentPin} onChangeText={setCurrentPin} placeholder="4 dígitos" secureTextEntry keyboardType="number-pad" maxLength={4} styles={styles} palette={palette} /> : null}
        <Field label={payout.data.conta.pin_configurado ? "Novo PIN" : "Crie um PIN de 4 dígitos"} value={newPin} onChangeText={setNewPin} placeholder="••••" secureTextEntry keyboardType="number-pad" maxLength={4} styles={styles} palette={palette} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={submitPin} style={[styles.outlineButton, busy && styles.disabled]}>{pinMutation.isPending ? <ActivityIndicator color={palette.forest} /> : <><MaterialCommunityIcons name="lock-check-outline" size={18} color={palette.forest} /><Text style={styles.outlineText}>{payout.data.conta.pin_configurado ? "Alterar PIN" : "Configurar PIN"}</Text></>}</Pressable>
        {pinMutation.isError ? <Text style={styles.errorText}>{pinMutation.error.message}</Text> : null}
      </>}
      <Text style={styles.securityNote}>O PIN não fica salvo neste aparelho, e tentativas repetidas são limitadas por segurança.</Text>
    </Surface>

    <Surface style={styles.unavailableCard}><View style={styles.cardHeading}><MaterialCommunityIcons name="clock-alert-outline" size={20} color={palette.amber} /><Text style={styles.cardTitle}>Saques ainda indisponíveis</Text></View><Text style={styles.body}>A integração de pagamentos/repasse ainda não está ativa. Não é possível solicitar, liquidar ou confirmar uma transferência Pix agora.</Text><Pressable accessibilityRole="button" disabled style={[styles.primaryButton, styles.disabled]}><Text style={styles.primaryText}>Solicitar saque · indisponível</Text></Pressable></Surface>
    <Text style={styles.footnote}>O saldo mostrado é operacional e não representa valor liberado para transferência bancária. A tela de movimentações e corridas continua em Ganhos.</Text>
  </ScrollView>;
}

function Field({ label, value, onChangeText, placeholder, styles, palette, secureTextEntry = false, keyboardType = "default", maxLength }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; styles: ReturnType<typeof createStyles>; palette: DriverPalette; secureTextEntry?: boolean; keyboardType?: "default" | "number-pad"; maxLength?: number }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} maxLength={maxLength} autoCapitalize="none" style={styles.input} /></View>;
}

function createStyles(palette: DriverPalette) { return StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas },
  content: { padding: 20, paddingTop: 28, paddingBottom: 44, gap: 17 },
  eyebrow: { color: palette.forest, fontWeight: "900", fontSize: 11, letterSpacing: 1.4 },
  title: { color: palette.ink, fontSize: 32, lineHeight: 38, fontWeight: "900", marginTop: -7 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  earningsCard: { backgroundColor: "#0B302C", borderColor: "#0B302C", gap: 14, marginVertical: 4, padding: 20 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconBox: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#D8FFF1", alignItems: "center", justifyContent: "center" },
  totalLabel: { color: "#C5D7CE", fontSize: 11, lineHeight: 15, fontWeight: "900", letterSpacing: 1 },
  totalValue: { color: "white", fontSize: 40, lineHeight: 48, fontWeight: "900" },
  bodyOnDark: { color: "#C5D7CE", fontSize: 14, lineHeight: 20 },
  dividerOnDark: { height: 1, backgroundColor: "#FFFFFF2A", marginVertical: 4 },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balanceValue: { color: "white", fontWeight: "900", fontSize: 22, lineHeight: 28 },
  balanceLabel: { color: "#C5D7CE", fontSize: 12, lineHeight: 17, marginTop: 4 },
  sectionHeading: { gap: 4, marginTop: 4 },
  sectionTitle: { color: palette.ink, fontSize: 21, lineHeight: 27, fontWeight: "900" },
  sectionHint: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  infoCard: { gap: 15, padding: 18 },
  unavailableCard: { gap: 15, borderColor: palette.amber, padding: 18 },
  cardTitle: { color: palette.ink, fontWeight: "900", fontSize: 16, lineHeight: 22, flex: 1 },
  body: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  savedAccount: { gap: 7, padding: 14, borderRadius: 12, backgroundColor: palette.canvas },
  savedLine: { color: palette.ink, fontSize: 15, lineHeight: 21, fontWeight: "800" },
  outlineButton: { minHeight: 54, paddingHorizontal: 15, borderRadius: 13, borderWidth: 1, borderColor: palette.line, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  outlineText: { color: palette.forest, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  form: { gap: 14, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 15 },
  field: { gap: 7 },
  fieldLabel: { color: palette.inkSoft, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  input: { minHeight: 52, borderRadius: 11, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.canvas, color: palette.ink, paddingHorizontal: 14, fontSize: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: 20, justifyContent: "center", borderWidth: 1, borderColor: palette.line, backgroundColor: palette.canvas },
  chipSelected: { backgroundColor: palette.mint, borderColor: palette.forest },
  chipText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
  chipTextSelected: { color: palette.forest },
  splitFields: { flexDirection: "row", gap: 10 },
  fieldHalf: { flex: 1 },
  primaryButton: { minHeight: 54, borderRadius: 13, backgroundColor: palette.forest, justifyContent: "center", alignItems: "center", paddingHorizontal: 14 },
  primaryText: { color: palette.bg, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  disabled: { opacity: 0.48 },
  errorText: { color: palette.red, fontSize: 13, lineHeight: 18 },
  securityNote: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  footnote: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: "center", paddingHorizontal: 5 },
  link: { color: palette.forest, fontSize: 14, lineHeight: 19, fontWeight: "900" },
}); }

