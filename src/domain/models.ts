import { z } from 'zod';

export const centsSchema = z.number().int().min(0).max(999999999999);
export const unitSchema = z.enum(['unid', 'kg', 'g', 'l', 'ml', 'pct', 'cx']);
export const receiptSchema = z.object({
  accessKey: z.string().regex(/^\d{44}$/), number: z.string().nullable(), series: z.string().nullable(),
  issuedAt: z.string().nullable(), merchant: z.string().min(1), cnpj: z.string().regex(/^\d{14}$/).nullable(),
  totalCents: centsSchema, originalUrl: z.url(), importedAt: z.iso.datetime(),
  items: z.array(z.object({ description: z.string().min(1), quantity: z.string().regex(/^\d+(\.\d+)?$/), unit: z.string().min(1), unitPrice: z.string().regex(/^\d+(\.\d+)?$/), totalCents: centsSchema, productId: z.string().nullable().default(null) })).min(1).max(2000),
});
export type Receipt = z.infer<typeof receiptSchema>;
const metadata = { id: z.string().min(1), workspaceId: z.string().min(1), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), deletedAt: z.iso.datetime().nullable().default(null) };
export const categorySchema = z.object({ ...metadata, name: z.string().trim().min(1), sortOrder: z.number().int().nonnegative() });
export const productSchema = z.object({ ...metadata, name: z.string().trim().min(1), categoryId: z.string(), unit: unitSchema, sortOrder: z.number().int().nonnegative(), archivedAt: z.iso.datetime().nullable() });
export const listSchema = z.object({ ...metadata, name: z.string().min(1), status: z.enum(['active', 'completed']), completedAt: z.iso.datetime().nullable(), previousListId: z.string().nullable(), amountCents: centsSchema.nullable().default(null), receipt: receiptSchema.nullable().default(null), pendingPolicy: z.enum(['carry_forward', 'discard']).nullable() });
export const itemSchema = z.object({ ...metadata, listId: z.string(), productId: z.string(), quantity: z.number().int().positive().max(9999), status: z.enum(['pending', 'in_cart']), productSnapshot: z.object({ name: z.string().min(1), unit: unitSchema, categoryName: z.string().min(1) }), carriedFromItemId: z.string().nullable() });
export const stateSchema = z.object({ schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), workspaceId: z.string().min(1), categories: z.array(categorySchema), products: z.array(productSchema), lists: z.array(listSchema), items: z.array(itemSchema) }).superRefine((s, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (s.lists.filter(l => l.status === 'active').length !== 1) invalid('Deve existir exatamente uma lista ativa.');
  for (const collection of [s.categories, s.products, s.lists, s.items]) {
    if (new Set(collection.map(e => e.id)).size !== collection.length) invalid('IDs duplicados.');
    if (collection.some(e => e.workspaceId !== s.workspaceId)) invalid('Espaço de compras inválido.');
  }
  if (s.products.some(p => !s.categories.some(c => c.id === p.categoryId))) invalid('Categoria ausente.');
  if (s.items.some(i => !s.products.some(p => p.id === i.productId) || !s.lists.some(l => l.id === i.listId))) invalid('Referência de item inválida.');
  if (new Set(s.items.map(i => `${i.listId}:${i.productId}`)).size !== s.items.length) invalid('Produto repetido na lista.');
  if (s.lists.some(l => (l.status === 'completed') !== (l.completedAt !== null))) invalid('Conclusão inválida.');
});
export type Category = z.infer<typeof categorySchema>;
export type Product = z.infer<typeof productSchema>;
export type ShoppingList = z.infer<typeof listSchema>;
export type ShoppingListItem = z.infer<typeof itemSchema>;
export type AppState = z.infer<typeof stateSchema>;
export type Selection = Record<string, number>;
