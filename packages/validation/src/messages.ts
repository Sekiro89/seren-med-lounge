import { z } from 'zod';

const messageBody = z.string().trim().min(1).max(5000);

export const createMessageThreadSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: messageBody,
});

export type CreateMessageThreadInput = z.infer<typeof createMessageThreadSchema>;

export const sendMessageSchema = z.object({
  body: messageBody,
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const assignMessageThreadSchema = z.object({
  assignedToId: z.string().min(1),
});

export type AssignMessageThreadInput = z.infer<typeof assignMessageThreadSchema>;
