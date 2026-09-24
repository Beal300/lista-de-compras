import { ZodError } from 'zod';

export function actionErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    if (error.issues.some(issue => issue.path.includes('quantity'))) {
      return 'Quantidade inválida. Use um número inteiro entre 1 e 9999.';
    }
    if (error.issues.some(issue => issue.path.includes('name'))) return 'Informe um nome válido para o produto.';
    return 'Os dados da alteração são inválidos. A versão salva foi preservada.';
  }
  if (error instanceof TypeError || !(error instanceof Error)) {
    return 'Ocorreu uma falha inesperada ao realizar a alteração. Seus dados salvos foram preservados. Tente novamente ou atualize o navegador.';
  }
  return error.message;
}
