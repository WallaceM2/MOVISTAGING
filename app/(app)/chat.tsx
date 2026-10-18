import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Surface } from '@/components/ui';
import { useMoviTheme, useThemeStyles } from '@/theme/ThemeProvider';
import { getRideChat, sendRideChatMedia, sendRideChatText, type RideChatMessage } from '@/features/chat/chatService';
import { subscribeRideEvents } from '@/realtime/socket';
import { idempotencyKey } from '@/api/http';

export default function RideChatScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rideId = Number(id);
  const { colors } = useMoviTheme();
  const styles = useThemeStyles(createStyles);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const operation = useRef<{ fingerprint: string; key: string } | null>(null);
  const listRef = useRef<FlatList<RideChatMessage>>(null);
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, recording ? 1000 : 5000);
  const chat = useQuery({ queryKey: ['ride-chat', rideId], queryFn: () => getRideChat(rideId), enabled: Number.isSafeInteger(rideId) && rideId > 0, refetchInterval: 15000, refetchIntervalInBackground: false });

  useEffect(() => subscribeRideEvents({ chat_nova_mensagem: (event) => { if (event.corrida_id === rideId) void queryClient.invalidateQueries({ queryKey: ['ride-chat', rideId] }); } }), [rideId, queryClient]);
  const getOperation = useCallback((fingerprint: string) => {
    if (!operation.current || operation.current.fingerprint !== fingerprint) operation.current = { fingerprint, key: idempotencyKey('ride-chat') };
    return operation.current.key;
  }, []);

  async function sendText() {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await sendRideChatText(rideId, value, getOperation(`texto:${value}`));
      operation.current = null;
      setText('');
      await queryClient.invalidateQueries({ queryKey: ['ride-chat', rideId] });
    } catch (error) { Alert.alert('Mensagem não enviada', error instanceof Error ? error.message : 'Confira sua conexão e tente novamente.'); }
    finally { setSending(false); }
  }

  async function sendImage() {
    if (sending) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Acesso às fotos', 'Permita o acesso às fotos para anexar uma imagem ao chat.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82, allowsEditing: false });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const mimeType = asset.mimeType ?? (asset.fileName?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    if (!['image/jpeg', 'image/png'].includes(mimeType)) return Alert.alert('Formato não aceito', 'Escolha uma foto JPG ou PNG.');
    const key = getOperation(`imagem:${asset.uri}`);
    setSending(true);
    try {
      await sendRideChatMedia(rideId, { uri: asset.uri, name: asset.fileName ?? `foto-${Date.now()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`, mimeType, type: 'imagem' }, key);
      operation.current = null;
      await queryClient.invalidateQueries({ queryKey: ['ride-chat', rideId] });
    } catch (error) { Alert.alert('Foto não enviada', error instanceof Error ? error.message : 'Confira sua conexão e tente novamente.'); }
    finally { setSending(false); }
  }

  async function startVoice() {
    if (sending || recording) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) return Alert.alert('Microfone', 'Permita o acesso ao microfone para gravar uma mensagem de voz.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 60 });
      setRecording(true);
    } catch (error) { Alert.alert('Não foi possível gravar', error instanceof Error ? error.message : 'Tente novamente.'); }
  }

  const stopAndSendVoice = useCallback(async () => {
    if (!recording || sending) return;
    setRecording(false);
    setSending(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('A gravação não foi salva. Tente novamente.');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const key = getOperation(`audio:${uri}`);
      await sendRideChatMedia(rideId, { uri, name: `voz-${Date.now()}.m4a`, mimeType: 'audio/mp4', type: 'audio' }, key);
      operation.current = null;
      await queryClient.invalidateQueries({ queryKey: ['ride-chat', rideId] });
    } catch (error) { Alert.alert('Áudio não enviado', error instanceof Error ? error.message : 'Confira sua conexão e tente novamente.'); }
    finally { setSending(false); }
  }, [recording, sending, recorder, rideId, queryClient, getOperation]);

  useEffect(() => {
    if (!recording || recorderState.durationMillis < 60_000) return;
    const timeout = setTimeout(() => { void stopAndSendVoice(); }, 0);
    return () => clearTimeout(timeout);
  }, [recording, recorderState.durationMillis, stopAndSendVoice]);

  if (!Number.isSafeInteger(rideId) || rideId < 1) return <View style={styles.page}><Text style={styles.title}>Corrida não identificada</Text><Pressable onPress={() => router.back()}><Text style={styles.link}>Voltar</Text></Pressable></View>;

  const messages = chat.data?.mensagens ?? [];
  return <View style={styles.page}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Voltar para a corrida" onPress={() => router.back()} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} /></Pressable><View style={styles.headerCopy}><Text style={styles.title}>Chat da corrida</Text><Text style={styles.subtitle}>Conversa privada entre passageiro e motorista</Text></View></View>
    {chat.isError ? <Surface style={styles.error}><Text style={styles.body}>{chat.error instanceof Error ? chat.error.message : 'Não foi possível carregar o chat.'}</Text><Pressable onPress={() => void chat.refetch()}><Text style={styles.link}>Tentar novamente</Text></Pressable></Surface> : null}
    {chat.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    <FlatList
      ref={listRef}
      style={styles.messages}
      contentContainerStyle={styles.messageList}
      data={messages}
      keyExtractor={(message) => String(message.id)}
      renderItem={({ item }) => <MessageBubble message={item} mine={item.remetente_tipo === 'motorista'} />}
      ListEmptyComponent={!chat.isLoading ? <Text style={styles.empty}>A conversa fica disponível durante esta corrida. Combine aqui o encontro no embarque.</Text> : null}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={5}
      removeClippedSubviews={Platform.OS === 'android'}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
    />
    <View style={styles.composer}>
      {recording ? <View style={styles.recording}><View style={styles.recordDot} /><Text style={styles.recordText}>Gravando · {Math.min(60, Math.floor(recorderState.durationMillis / 1000))}s</Text><Pressable accessibilityRole="button" accessibilityLabel="Parar e enviar áudio" onPress={() => void stopAndSendVoice()} style={styles.sendAudio}><MaterialCommunityIcons name="send" size={19} color={colors.bg} /></Pressable></View> : <>
        <Pressable accessibilityRole="button" accessibilityLabel="Anexar foto" disabled={sending} onPress={() => void sendImage()} style={styles.attach}><MaterialCommunityIcons name="image-outline" size={22} color={colors.primary} /></Pressable>
        <TextInput accessibilityLabel="Mensagem da corrida" value={text} onChangeText={setText} placeholder="Mensagem…" placeholderTextColor={colors.muted} multiline maxLength={1000} editable={!sending} style={styles.input} />
        {text.trim() ? <Pressable accessibilityRole="button" accessibilityLabel="Enviar mensagem" disabled={sending} onPress={() => void sendText()} style={styles.send}><MaterialCommunityIcons name="send" size={19} color={colors.bg} /></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={recording ? 'Parar gravação' : 'Gravar mensagem de voz'} disabled={sending} onPress={() => void startVoice()} style={styles.attach}><MaterialCommunityIcons name="microphone-outline" size={22} color={colors.primary} /></Pressable>}
      </>}
    </View>
    <Text style={styles.helper}>{sending ? 'Enviando com segurança…' : 'Compartilhe somente informações necessárias para esta corrida.'}</Text>
  </View>;
}

const MessageBubble = React.memo(function MessageBubble({ message, mine }: { message: RideChatMessage; mine: boolean }) {
  const { colors } = useMoviTheme();
  const player = useAudioPlayer(message.tipo === 'audio' ? message.midia_url : null);
  const audioStatus = useAudioPlayerStatus(player);
  const styles = useThemeStyles(createStyles);
  const time = new Date(message.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
    {message.tipo === 'imagem' && message.midia_url ? <Image source={{ uri: message.midia_url }} style={styles.photo} resizeMode="cover" /> : null}
    {message.tipo === 'audio' ? <Pressable accessibilityRole="button" accessibilityLabel={audioStatus.playing ? 'Pausar áudio' : 'Reproduzir áudio'} onPress={() => audioStatus.playing ? player.pause() : player.play()} style={styles.audio}><MaterialCommunityIcons name={audioStatus.playing ? 'pause-circle' : 'play-circle'} size={30} color={colors.primary} /><Text style={[styles.body, { color: colors.text }]}>{audioStatus.isLoaded ? `${Math.floor(audioStatus.duration)}s · áudio` : 'Carregando áudio…'}</Text></Pressable> : null}
    {message.mensagem ? <Text style={[styles.body, mine ? { color: colors.bg } : { color: colors.text }]}>{message.mensagem}</Text> : null}
    <Text style={[styles.time, mine ? { color: colors.bg } : { color: colors.muted }]}>{mine ? 'Você · ' : 'Corrida · '}{time}</Text>
  </View>;
}, (previous, next) => previous.mine === next.mine
  && previous.message.id === next.message.id
  && previous.message.tipo === next.message.tipo
  && previous.message.mensagem === next.message.mensagem
  && previous.message.midia_url === next.message.midia_url
  && previous.message.criado_em === next.message.criado_em);

function createStyles(colors: ReturnType<typeof useMoviTheme>['colors']) { return StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }, header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 10 }, back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, headerCopy: { flex: 1 }, title: { color: colors.text, fontSize: 17, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 10, marginTop: 3 }, messages: { flex: 1 }, messageList: { paddingVertical: 14, gap: 9, flexGrow: 1, justifyContent: 'flex-end' }, empty: { alignSelf: 'center', maxWidth: 280, textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 19, marginVertical: 20 }, bubble: { maxWidth: '84%', borderRadius: 18, padding: 11, gap: 7 }, mine: { alignSelf: 'flex-end', backgroundColor: colors.primary }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, body: { color: colors.text, fontSize: 13, lineHeight: 19 }, time: { fontSize: 9, alignSelf: 'flex-end' }, photo: { width: 220, height: 200, borderRadius: 12, backgroundColor: colors.bg }, audio: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 150 }, composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, padding: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface }, attach: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, maxHeight: 96, minHeight: 42, paddingHorizontal: 9, paddingVertical: 10, color: colors.text, fontSize: 14 }, send: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, helper: { textAlign: 'center', color: colors.muted, fontSize: 9, marginTop: 7 }, error: { marginTop: 12, gap: 8 }, link: { color: colors.primary, fontSize: 12, fontWeight: '800' }, recording: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 }, recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }, recordText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' }, sendAudio: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
}); }
