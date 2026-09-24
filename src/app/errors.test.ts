import { expect, it } from 'vitest';
import { actionErrorMessage } from './errors';
import { initialize, updateItem } from '../domain/shopping';

it('não apresenta falha técnica como quantidade inválida', () => {
  expect(actionErrorMessage(new TypeError('crypto.randomUUID is not a function'))).toContain('falha inesperada');
  expect(actionErrorMessage(new TypeError())).not.toContain('quantidade');
});
it('apresenta a validação de quantidade somente quando ela falha', () => {
  const state = initialize(true);
  try { updateItem(state, state.items[0].id, { quantity: 0 }); throw new Error('Validação deveria falhar'); }
  catch (error) { expect(actionErrorMessage(error)).toBe('Quantidade inválida. Use um número inteiro entre 1 e 9999.'); }
});
