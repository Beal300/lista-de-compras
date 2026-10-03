export function parseMoney(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^(\d+|\d{1,3}(\.\d{3})+)(,\d{1,2})?$/.test(text)) throw new Error('Informe um valor como 123,45, com no máximo duas casas decimais.');
  const [whole, fraction = ''] = text.replace(/\./g, '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 999999999999) throw new Error('Valor acima do limite permitido.');
  return cents;
}
export const formatMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const moneyInput = (cents: number | null) => cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',');
