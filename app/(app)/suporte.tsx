import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppButton, Surface } from '@/components/ui';
import { createSupportTicket, getSupportTicket, listSupportFaq, listSupportTickets, sendSupportMessage, triageSupportQuestion, type SupportCategory, type SupportStatus } from '@/features/support/supportService';
import { palette } from '@/theme';

const categories: { id: SupportCategory; label: string }[] = [
  { id: 'corrida', label: 'Corrida' }, { id: 'pagamento', label: 'Pagamento' },
  { id: 'conta', label: 'Conta' }, { id: 'seguranca', label: 'Segurança' }, { id: 'outro', label: 'Outro' },
];
const statusLabels: Record<SupportStatus, string> = {
  aberto: 'Recebido', em_atendimento: 'Em atendimento', aguardando_usuario: 'Aguardando sua resposta', resolvido: 'Respondido', fechado: 'Fechado',
};

export default function SupportScreen() {
  const client = useQueryClient();
  const faq = useQuery({ queryKey: ['support-faq'], queryFn: listSupportFaq, staleTime: 300000 });
  const tickets = useQuery({ queryKey: ['support-tickets'], queryFn: listSupportTickets, refetchInterval: 60000, refetchIntervalInBackground: false });
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ title: string; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory>('outro');
  const [subject, setSubject] = useState('');
  const [rideId, setRideId] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const detail = useQuery({ queryKey: ['support-ticket', selectedId], queryFn: () => getSupportTicket(selectedId as number), enabled: selectedId !== null, refetchInterval: selectedId !== null ? 30000 : false, refetchIntervalInBackground: false });

  async function askSupport() {
    if (question.trim().length < 3) return Alert.alert('Escreva sua dúvida', 'Digite pelo menos 3 caracteres para consultar a ajuda rápida.');
    setAsking(true);
    try {
      const result = await triageSupportQuestion(question.trim());
      setAnswer({ title: result.titulo, text: result.resposta });
    } catch (error) {
      Alert.alert('Ajuda indisponível', error instanceof Error ? error.message : 'Não foi possível consultar a ajuda agora.');
    } finally { setAsking(false); }
  }

  async function submitTicket() {
    if (subject.trim().length < 4) return Alert.alert('Informe o assunto', 'O assunto precisa ter pelo menos 4 caracteres.');
    if (description.trim().length < 20) return Alert.alert('Conte o que aconteceu', 'A descrição precisa ter pelo menos 20 caracteres.');
    const ride = rideId.trim() ? Number(rideId.trim()) : undefined;
    if (ride !== undefined && (!Number.isSafeInteger(ride) || ride <= 0)) return Alert.alert('Número de corrida inválido', 'Informe somente o número da corrida.');
    setCreating(true);
    try {
      const result = await createSupportTicket({ categoria: category, assunto: subject.trim(), mensagem: description.trim(), ...(ride ? { corrida_id: ride } : {}) });
      setSubject(''); setRideId(''); setDescription(''); setComposerOpen(false); setSelectedId(result.chamado.id);
      await client.invalidateQueries({ queryKey: ['support-tickets'] });
      Alert.alert('Chamado recebido', `A previsão da primeira resposta humana é de ${result.previsao_resposta_humana_horas.minimo} a ${result.previsao_resposta_humana_horas.maximo} horas. Esse prazo é para a primeira resposta, não para a resolução do caso.`);
    } catch (error) {
      Alert.alert('Não foi possível abrir o chamado', error instanceof Error ? error.message : 'Tente novamente em instantes.');
    } finally { setCreating(false); }
  }

  async function submitReply() {
    if (selectedId === null || !reply.trim()) return;
    setSending(true);
    try {
      await sendSupportMessage(selectedId, reply.trim());
      setReply('');
      await Promise.all([client.invalidateQueries({ queryKey: ['support-ticket', selectedId] }), client.invalidateQueries({ queryKey: ['support-tickets'] })]);
    } catch (error) {
      Alert.alert('Mensagem não enviada', error instanceof Error ? error.message : 'Tente novamente em instantes.');
    } finally { setSending(false); }
  }

  const selected = detail.data?.chamado;
  return <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>CENTRAL MOVI</Text><Text style={styles.title}>Ajuda e suporte</Text>
    <Text style={styles.body}>Tire dúvidas rápidas ou envie seu caso para a equipe MOVI. A ajuda automática orienta, mas não decide casos de conta, segurança ou pagamentos.</Text>
    <Surface style={styles.notice}><Text style={styles.noticeTitle}>Em risco imediato</Text><Text style={styles.body}>Procure os serviços de emergência da sua região. O chat não investiga nem substitui esse atendimento.</Text></Surface>

    <Text style={styles.section}>Pergunte ao MOVI</Text>
    <TextInput accessibilityLabel="Sua dúvida" value={question} onChangeText={setQuestion} placeholder="Ex.: como funciona o ganho diário?" placeholderTextColor={palette.muted} style={styles.input} returnKeyType="send" onSubmitEditing={() => void askSupport()} />
    <AppButton title="Consultar ajuda rápida" onPress={() => void askSupport()} loading={asking} disabled={question.trim().length < 3} />
    {answer ? <Surface style={styles.answer}><Text style={styles.answerLabel}>{answer.title}</Text><Text style={styles.body}>{answer.text}</Text><Text style={styles.helper}>Esta orientação não altera corridas, valores ou sua conta.</Text></Surface> : null}

    <Text style={styles.section}>Perguntas frequentes</Text>
    {faq.isLoading ? <ActivityIndicator color={palette.forest} /> : faq.data?.artigos.map((article) => <Pressable key={article.id} accessibilityRole="button" onPress={() => { setQuestion(article.titulo); setAnswer({ title: article.titulo, text: article.resposta }); }}><Surface style={styles.faq}><Text style={styles.faqTitle}>{article.titulo}</Text><Text style={styles.faqOpen}>Ver</Text></Surface></Pressable>)}
    {faq.isError ? <Text style={styles.error}>Não foi possível carregar as perguntas frequentes. Você ainda pode abrir um chamado.</Text> : null}

    <View style={styles.rowTitle}><Text style={styles.section}>Fale com a equipe</Text><Pressable accessibilityRole="button" onPress={() => { setSelectedId(null); setComposerOpen((open) => !open); }}><Text style={styles.link}>{composerOpen ? 'Fechar' : 'Novo chamado'}</Text></Pressable></View>
    {composerOpen ? <Surface style={styles.form}>
      <Text style={styles.body}>Descreva o ocorrido, quando aconteceu e o que você precisa. Você pode informar o número da corrida. Não envie senha, código de embarque ou dados completos do cartão. Chamados aceitam texto, sem anexos nesta versão.</Text>
      <View style={styles.chips}>{categories.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: category === item.id }} onPress={() => setCategory(item.id)} style={[styles.chip, category === item.id && styles.chipSelected]}><Text style={[styles.chipText, category === item.id && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="Assunto" value={subject} onChangeText={setSubject} placeholder="Assunto" placeholderTextColor={palette.muted} maxLength={160} style={styles.input} />
      <TextInput accessibilityLabel="Número da corrida opcional" value={rideId} onChangeText={setRideId} placeholder="Número da corrida (opcional)" placeholderTextColor={palette.muted} keyboardType="number-pad" style={styles.input} />
      <TextInput accessibilityLabel="Descreva o ocorrido" value={description} onChangeText={setDescription} placeholder="O que aconteceu? Inclua quando ocorreu e o que você precisa." placeholderTextColor={palette.muted} multiline maxLength={4000} style={[styles.input, styles.multiline]} />
      <Text style={styles.helper}>{description.trim().length}/4000 · mínimo 20 caracteres</Text>
      <AppButton title="Enviar ao suporte" onPress={() => void submitTicket()} loading={creating} disabled={subject.trim().length < 4 || description.trim().length < 20} />
      <Text style={styles.helper}>Previsão de primeira resposta humana: 24–48 horas corridas. É uma estimativa, não um prazo de resolução.</Text>
    </Surface> : null}

    {selectedId !== null ? <Surface style={styles.form}>
      <View style={styles.rowTitle}><Text style={styles.section}>Chamado #{selectedId}</Text><Pressable accessibilityRole="button" onPress={() => setSelectedId(null)}><Text style={styles.link}>Voltar</Text></Pressable></View>
      {detail.isLoading ? <ActivityIndicator color={palette.forest} /> : detail.isError ? <Text style={styles.error}>Não foi possível abrir este chamado.</Text> : selected ? <>
        <Text style={styles.body}>{selected.assunto} · {statusLabels[selected.status]}</Text>
        {(selected.mensagens ?? []).map((item) => <View key={item.id} style={[styles.message, item.autor_tipo !== 'admin' && styles.userMessage]}><Text style={styles.messageAuthor}>{item.autor_tipo === 'admin' ? 'Equipe MOVI' : 'Você'}</Text><Text style={styles.body}>{item.mensagem}</Text></View>)}
        {selected.status !== 'fechado' ? <><TextInput accessibilityLabel="Responder ao chamado" value={reply} onChangeText={setReply} placeholder="Escreva uma mensagem" placeholderTextColor={palette.muted} multiline maxLength={4000} style={[styles.input, styles.multiline]} /><AppButton title="Enviar mensagem" onPress={() => void submitReply()} loading={sending} disabled={!reply.trim()} /></> : <Text style={styles.helper}>Este chamado foi fechado. Abra outro se precisar de ajuda.</Text>}
      </> : null}
    </Surface> : null}

    <Text style={styles.section}>Seus chamados</Text>
    {tickets.isLoading ? <ActivityIndicator color={palette.forest} /> : tickets.data?.dados.length ? tickets.data.dados.map((ticket) => <Pressable key={ticket.id} accessibilityRole="button" onPress={() => { setComposerOpen(false); setSelectedId(ticket.id); }}><Surface style={styles.ticket}><View style={styles.rowTitle}><Text style={styles.faqTitle}>#{ticket.id} · {ticket.assunto}</Text><Text style={styles.status}>{statusLabels[ticket.status]}</Text></View><Text style={styles.body}>{ticket.ultima_mensagem ?? 'Chamado recebido.'}</Text></Surface></Pressable>) : <Text style={styles.helper}>Seus chamados aparecerão aqui.</Text>}
    {tickets.isError ? <Text style={styles.error}>Não foi possível consultar seus chamados.</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.canvas }, content: { padding: 20, paddingTop: 28, paddingBottom: 45, gap: 12 }, eyebrow: { color: palette.forest, fontSize: 9, letterSpacing: 1.4, fontWeight: '900' }, title: { color: palette.ink, fontSize: 27, fontWeight: '900', marginTop: -8 },
  section: { color: palette.ink, fontSize: 16, fontWeight: '900', marginTop: 6 }, body: { color: palette.muted, fontSize: 12, lineHeight: 19 }, notice: { backgroundColor: palette.amberBg, borderColor: '#F2D4A4', gap: 6 }, noticeTitle: { color: palette.amber, fontWeight: '900', fontSize: 14 },
  input: { minHeight: 50, borderWidth: 1, borderColor: palette.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: palette.ink, backgroundColor: palette.paper }, multiline: { minHeight: 110, textAlignVertical: 'top' }, answer: { backgroundColor: palette.mint, borderColor: '#CAE7D9', gap: 8 }, answerLabel: { color: palette.forest, fontWeight: '900' }, helper: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  faq: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 14 }, faqTitle: { flex: 1, color: palette.ink, fontWeight: '800', fontSize: 12 }, faqOpen: { color: palette.forest, fontWeight: '900', fontSize: 11 }, rowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, link: { color: palette.forest, fontWeight: '900' }, form: { gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: palette.line, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: palette.paper }, chipSelected: { borderColor: palette.forest, backgroundColor: palette.forest }, chipText: { color: palette.ink, fontSize: 11, fontWeight: '700' }, chipTextSelected: { color: palette.paper }, ticket: { gap: 7, padding: 14 }, status: { color: palette.forest, fontSize: 10, fontWeight: '900' }, message: { backgroundColor: '#F3F4F6', borderRadius: 14, padding: 12, gap: 5 }, userMessage: { backgroundColor: palette.mint }, messageAuthor: { color: palette.ink, fontSize: 10, fontWeight: '900' }, error: { color: palette.red, fontSize: 12, lineHeight: 18 },
});
