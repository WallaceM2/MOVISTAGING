import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { createSupportTicket, getSupportTicket, listSupportFaq, listSupportTickets, sendSupportMessage, triageSupportQuestion, type SupportCategory, type SupportStatus } from '@/features/suporte/supportService';
import { colors } from '@/theme/colors';

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
  return <Screen title="Ajuda e suporte" subtitle="Tire dúvidas rápidas ou envie seu caso para a equipe MOVI.">
    <Card style={styles.notice}><Text style={styles.noticeTitle}>Precisa de ajuda agora?</Text><Text style={styles.body}>Em risco imediato, procure os serviços de emergência da sua região. A ajuda automática não analisa ocorrências de segurança.</Text></Card>

    <Text style={styles.section}>Pergunte ao MOVI</Text>
    <Text style={styles.body}>A ajuda rápida orienta questões comuns. Quando não resolver, você pode abrir um chamado humano.</Text>
    <TextInput accessibilityLabel="Sua dúvida" value={question} onChangeText={setQuestion} placeholder="Ex.: como acompanho minha corrida?" placeholderTextColor={colors.muted} style={styles.input} returnKeyType="send" onSubmitEditing={() => void askSupport()} />
    <Button title="Consultar ajuda rápida" onPress={() => void askSupport()} loading={asking} disabled={question.trim().length < 3} />
    {answer ? <Card style={styles.answer}><Text style={styles.answerLabel}>RESPOSTA · {answer.title}</Text><Text style={styles.body}>{answer.text}</Text><Text style={styles.helper}>Esta orientação não confirma pagamentos nem altera corridas ou sua conta.</Text></Card> : null}

    <Text style={styles.section}>Assuntos frequentes</Text>
    {faq.isLoading ? <ActivityIndicator color={colors.primary} /> : faq.data?.artigos.map((article) => <Pressable key={article.id} accessibilityRole="button" onPress={() => { setQuestion(article.titulo); setAnswer({ title: article.titulo, text: article.resposta }); }}><Card style={styles.faq}><Text style={styles.faqTitle}>{article.titulo}</Text><Text style={styles.faqOpen}>Ver orientação</Text></Card></Pressable>)}
    {faq.isError ? <Text style={styles.error}>Não foi possível carregar os assuntos frequentes. Você ainda pode abrir um chamado.</Text> : null}

    <View style={styles.rowTitle}><Text style={styles.section}>Fale com a equipe</Text><Pressable accessibilityRole="button" onPress={() => { setSelectedId(null); setComposerOpen((open) => !open); }}><Text style={styles.link}>{composerOpen ? 'Fechar' : 'Novo chamado'}</Text></Pressable></View>
    {composerOpen ? <Card style={styles.form}>
      <Text style={styles.body}>Descreva o ocorrido e, se houver, informe o número da corrida. Não envie senhas, códigos de embarque ou dados completos de cartão. Nesta versão, o chamado aceita texto, sem anexos.</Text>
      <View style={styles.chips}>{categories.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: category === item.id }} onPress={() => setCategory(item.id)} style={[styles.chip, category === item.id && styles.chipSelected]}><Text style={[styles.chipText, category === item.id && styles.chipTextSelected]}>{item.label}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="Assunto" value={subject} onChangeText={setSubject} placeholder="Assunto" placeholderTextColor={colors.muted} maxLength={160} style={styles.input} />
      <TextInput accessibilityLabel="Número da corrida opcional" value={rideId} onChangeText={setRideId} placeholder="Número da corrida (opcional)" placeholderTextColor={colors.muted} keyboardType="number-pad" style={styles.input} />
      <TextInput accessibilityLabel="Descreva o ocorrido" value={description} onChangeText={setDescription} placeholder="O que aconteceu? Inclua quando ocorreu e o que você precisa." placeholderTextColor={colors.muted} multiline maxLength={4000} style={[styles.input, styles.multiline]} />
      <Text style={styles.helper}>{description.trim().length}/4000 · mínimo 20 caracteres</Text>
      <Button title="Enviar ao suporte" onPress={() => void submitTicket()} loading={creating} disabled={subject.trim().length < 4 || description.trim().length < 20} />
      <Text style={styles.helper}>Previsão de primeira resposta humana: 24–48 horas corridas. É uma estimativa de resposta inicial, não de resolução.</Text>
    </Card> : null}

    {selectedId !== null ? <Card style={styles.form}>
      <View style={styles.rowTitle}><Text style={styles.section}>Chamado #{selectedId}</Text><Pressable accessibilityRole="button" onPress={() => setSelectedId(null)}><Text style={styles.link}>Voltar</Text></Pressable></View>
      {detail.isLoading ? <ActivityIndicator color={colors.primary} /> : detail.isError ? <Text style={styles.error}>Não foi possível abrir este chamado.</Text> : selected ? <>
        <Text style={styles.body}>{selected.assunto} · {statusLabels[selected.status]}</Text>
        {(selected.mensagens ?? []).map((item) => <View key={item.id} style={[styles.message, item.autor_tipo !== 'admin' && styles.userMessage]}><Text style={styles.messageAuthor}>{item.autor_tipo === 'admin' ? 'Equipe MOVI' : 'Você'}</Text><Text style={styles.body}>{item.mensagem}</Text></View>)}
        {selected.status !== 'fechado' ? <><TextInput accessibilityLabel="Responder ao chamado" value={reply} onChangeText={setReply} placeholder="Escreva uma mensagem" placeholderTextColor={colors.muted} multiline maxLength={4000} style={[styles.input, styles.multiline]} /><Button title="Enviar mensagem" onPress={() => void submitReply()} loading={sending} disabled={!reply.trim()} /></> : <Text style={styles.helper}>Este chamado foi fechado. Abra outro se precisar de ajuda adicional.</Text>}
      </> : null}
    </Card> : null}

    <Text style={styles.section}>Seus chamados</Text>
    {tickets.isLoading ? <ActivityIndicator color={colors.primary} /> : tickets.data?.dados.length ? tickets.data.dados.map((ticket) => <Pressable key={ticket.id} accessibilityRole="button" onPress={() => { setComposerOpen(false); setSelectedId(ticket.id); }}><Card style={styles.ticket}><View style={styles.rowTitle}><Text style={styles.faqTitle}>#{ticket.id} · {ticket.assunto}</Text><Text style={styles.status}>{statusLabels[ticket.status]}</Text></View><Text style={styles.body}>{ticket.ultima_mensagem ?? 'Chamado recebido.'}</Text></Card></Pressable>) : <Text style={styles.helper}>Seus chamados aparecerão aqui.</Text>}
    {tickets.isError ? <Text style={styles.error}>Não foi possível consultar seus chamados.</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA', gap: 6 }, noticeTitle: { color: '#9A3412', fontSize: 15, fontWeight: '900' },
  section: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 5 }, body: { color: colors.muted, lineHeight: 20 }, input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, backgroundColor: colors.surface }, multiline: { minHeight: 110, textAlignVertical: 'top' },
  answer: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', gap: 8 }, answerLabel: { color: '#166534', fontSize: 11, fontWeight: '900' }, helper: { color: colors.muted, fontSize: 12, lineHeight: 18 }, faq: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, faqTitle: { color: colors.text, fontSize: 14, fontWeight: '800', flex: 1 }, faqOpen: { color: colors.success, fontSize: 12, fontWeight: '800' },
  rowTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, link: { color: colors.success, fontWeight: '900' }, form: { gap: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface }, chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary }, chipText: { color: colors.text, fontSize: 12, fontWeight: '700' }, chipTextSelected: { color: colors.white }, ticket: { gap: 7 }, status: { color: colors.success, fontSize: 11, fontWeight: '900' }, message: { backgroundColor: '#F3F4F6', borderRadius: 14, padding: 12, gap: 5 }, userMessage: { backgroundColor: '#ECFDF5' }, messageAuthor: { color: colors.text, fontSize: 11, fontWeight: '900' }, error: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
