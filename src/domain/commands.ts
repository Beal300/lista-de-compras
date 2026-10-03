import { z } from 'zod';

import { centsSchema, unitSchema } from './models';
const id = z.string().min(1).max(128);
const quantity = z.number().int().min(1).max(9999);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('restoreAndAdd'), listId: id, productId: id }).strict(),
  z.object({ type: z.literal('quickAdd'), listId: id, productId: id }).strict(),
  z.object({ type: z.literal('updateItem'), listId: id, itemId: id, patch: z.object({ quantity: quantity.optional(), status: z.enum(['pending', 'in_cart']).optional() }).strict().refine(p => p.quantity !== undefined || p.status !== undefined) }).strict(),
  z.object({ type: z.literal('removeItem'), listId: id, itemId: id }).strict(),
  z.object({ type: z.literal('reviewSelection'), listId: id, selection: z.record(id, quantity) }).strict(),
  z.object({ type: z.literal('finishShopping'), listId: id, policy: z.enum(['carry_forward', 'discard']), amountCents: centsSchema.nullable().optional() }).strict(),
  z.object({ type: z.literal('saveProduct'), product: z.object({ id: id.optional(), name: z.string().trim().min(1).max(160), categoryId: id, unit: unitSchema.optional() }).strict(), addToListId: id.optional() }).strict(),
  z.object({ type: z.literal('setPurchaseAmount'), purchaseId: id, amountCents: centsSchema.nullable() }).strict(),
  z.object({ type: z.literal('deleteHistory'), purchaseId: id, confirmed: z.literal(true) }).strict(),
  z.object({ type: z.literal('pruneHistory'), keepId: id, confirmed: z.literal(true) }).strict(),
  z.object({ type: z.literal('attachReceipt'), purchaseId: id, previewToken: z.uuid(), confirmed: z.literal(true), replaceAmountConfirmed: z.literal(true).optional() }).strict(),
  z.object({ type: z.literal('archiveProduct'), productId: id }).strict(),
]);
export const commandSchema = z.object({ operationId: z.uuid(), expectedRevision: z.number().int().nonnegative(), action: actionSchema }).strict();
export type Action = z.infer<typeof actionSchema>;
export type Command = z.infer<typeof commandSchema>;
