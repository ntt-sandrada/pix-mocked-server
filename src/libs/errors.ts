import { BadRequestException } from '@nestjs/common';

export class OperacaoInvalidaException extends BadRequestException {
  constructor(public readonly detail: string) {
    super(detail);
  }
}
