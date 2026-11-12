import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { catchError, Observable, tap } from 'rxjs';
import { owners } from './data/db.json';
import { OperacaoInvalidaException } from './libs/errors';

@Injectable()
export class HttpInterceptor implements NestInterceptor {
  private handleError = (
    type: string,
    title: string,
    detail: string,
    status: number,
    violacoes: { razao: string; propriedade: string }[],
  ) => ({
    type,
    title,
    status,
    detail,
    violacoes,
  });

  private ServerErrorTypes = {
    400: (
      prefix: string,
      detail: string,
      violacoes: { razao: string; propriedade: string }[],
      title: string = 'Payload Inválido',
    ) =>
      this.handleError(
        `https://pix.bcb.gov.br/api/v2/error/${prefix}OperacaoInvalida`,
        title,
        detail,
        400,
        violacoes,
      ),
    401: () =>
      this.handleError(
        'https://pix.bcb.gov.br/api/v2/error/AcessoNegado',
        'Acesso Negado',
        'Access Token inválido.',
        401,
        [],
      ),
    403: (
      detail: string,
      violacoes: { razao: string; propriedade: string }[],
    ) =>
      this.handleError(
        `https://pix.bcb.gov.br/api/v2/error/AcessoNegado`,
        `Acesso Negado`,
        detail,
        403,
        violacoes,
      ),
    404: () =>
      this.handleError(
        `https://pix.bcb.gov.br/api/v2/error/NaoEncontrado`,
        `Não Encontrado`,
        'Entidade não encontrada.',
        404,
        [],
      ),
    503: () =>
      this.handleError(
        `https://pix.bcb.gov.br/api/v2/error/ServicoIndisponivel`,
        'Serviço Indisponível',
        `Serviço não está disponível no momento. Serviço solicitado pode estar em manutenção ou fora da janela de funcionamento.`,
        503,
        [],
      ),
  };

  intercept(context: ExecutionContext, next: CallHandler): Observable<void> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['mocked-token'];

    const own = token ? owners.find((f) => f.token === token) : undefined;

    if (own) {
      request.headers['IdOwner'] = own.id;

      return next.handle().pipe(
        tap((res) => {
          if (
            (request.method === 'GET' ||
              request.method === 'PATCH' ||
              request.method === 'DELETE') &&
            !res
          ) {
            throw new NotFoundException();
          } else {
            return res;
          }
        }),
        catchError((err: HttpException): Observable<any> => {
          const statusHandle = {
            400: () => {
              const endpoint = request['url'].split('?')[0].split('/')[1];

              const handle: (msgs: any) => Observable<any> = {
                cob: (msgs: { [key: string]: string }) => {
                  const violacoes = Object.keys(msgs).map((key: string) => ({
                    propriedade: `${endpoint}.${key}`,
                    razao: msgs[key].replace('$$', `${endpoint}.${key}`),
                  }));
                  throw new BadRequestException(
                    this.ServerErrorTypes[err.getStatus()](
                      'Cob',
                      'A cobrança não respeita o schema.',
                      violacoes,
                    ),
                  );
                },
                cobv: (msgs: { [key: string]: string }) => {
                  const violacoes = Object.keys(msgs).map((key: string) => ({
                    propriedade: `${endpoint}.${key}`,
                    razao: msgs[key].replace('$$', `${endpoint}.${key}`),
                  }));
                  throw new BadRequestException(
                    this.ServerErrorTypes[err.getStatus()](
                      'CobV',
                      'A cobrança não respeita o schema.',
                      violacoes,
                    ),
                  );
                },
                loc: (msgs: { [key: string]: string }) => {
                  const violacoes = Object.keys(msgs).map((key: string) => ({
                    propriedade: `${endpoint}.${key}`,
                    razao: msgs[key].replace('$$', `${endpoint}.${key}`),
                  }));
                  throw new BadRequestException(
                    this.ServerErrorTypes[err.getStatus()](
                      'PayloadLocation',
                      'O Location não respeita o schema.',
                      violacoes,
                      'PayloadLocation inválido.',
                    ),
                  );
                },

                cobr: (msgs: { [key: string]: string }) => {
                  if (err instanceof OperacaoInvalidaException) {
                    throw new BadRequestException(
                      this.ServerErrorTypes[400](
                        'CobR',
                        err.detail,
                        [],
                        'Operação inválida.',
                      ),
                    );
                  }
                  const violacoes = Object.keys(msgs).map((key: string) => ({
                    propriedade: `${endpoint}.${key}`,
                    razao: msgs[key].replace('$$', `${endpoint}.${key}`),
                  }));
                  throw new BadRequestException(
                    this.ServerErrorTypes[err.getStatus()](
                      'CobR',
                      'A cobrança não respeita o schema.',
                      violacoes,
                      'Operação inválida.',
                    ),
                  );
                },
                rec: (msgs: { [key: string]: string }) => {
                  const violacoes = Object.keys(msgs).map((key: string) => ({
                    propriedade: `${endpoint}.${key}`,
                    razao: msgs[key].replace('$$', `${endpoint}.${key}`),
                  }));
                  throw new BadRequestException(
                    this.ServerErrorTypes[err.getStatus()](
                      'Rec',
                      'A recorrência não respeita o schema.',
                      violacoes,
                    ),
                  );
                },
              }[endpoint];

              //console.log(err.getResponse().valueOf())
              return handle(err.getResponse().valueOf()); //return handle(JSON.parse(err.getResponse().valueOf()['message']));
            },
            404: () => {
              throw new NotFoundException(
                this.ServerErrorTypes[err.getStatus()](),
              );
            },
            500: () => {
              console.log(err);
              throw new InternalServerErrorException(
                this.ServerErrorTypes[err.getStatus?.() || 500],
              );
            },
          }[err.getStatus?.() || 500];

          return statusHandle();
        }),
      );
    } else {
      return new Observable<any>(() => {
        throw new UnauthorizedException(this.ServerErrorTypes[401]());
      });
    }
  }
}
