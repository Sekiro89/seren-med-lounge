import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates request bodies against a Zod schema from `@serenemed/validation`
 * — the same schema the frontends use with React Hook Form, so the shape
 * is defined exactly once. Usage: `@UsePipes(new ZodValidationPipe(loginSchema))`.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return result.data;
  }
}
