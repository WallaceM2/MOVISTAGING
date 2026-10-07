export function brl(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0);
}

export function km(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toFixed(2).replace('.', ',')} km`;
}

export function minutes(value: number | string | null | undefined): string {
  const n = Math.max(0, Math.round(Number(value ?? 0)));
  return `${n} min`;
}
