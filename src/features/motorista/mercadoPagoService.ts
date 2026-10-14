import { Linking } from 'react-native';
import { apiFetch } from '@/api/http';

export type MercadoPagoLinkStatus = {
  vinculado: boolean;
  ambiente: 'sandbox' | 'production' | null;
  conectado_em: string | null;
  expirado: boolean;
};

export async function getMercadoPagoLinkStatus() {
  return apiFetch<MercadoPagoLinkStatus>('/api/motoristas/mercadopago/vinculacao');
}

export async function startMercadoPagoLink() {
  const result = await apiFetch<{ authorization_url: string; expires_in_seconds: number }>(
    '/api/motoristas/mercadopago/vinculacao',
    { method: 'POST', body: JSON.stringify({}) },
  );
  if (!result.authorization_url.startsWith('https://auth.mercadopago.com/authorization?')) {
    throw new Error('O endereço de autorização do Mercado Pago é inválido.');
  }
  await Linking.openURL(result.authorization_url);
}
