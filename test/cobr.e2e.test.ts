import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { randomUUID } from 'crypto';
import { MemoryDB } from '../src/libs/fakedb';
import { gerarCPF } from '../src/libs/documentos';
import {
  PeriodicidadeRecorrencia,
  PoliticaRetentativa,
} from '../src/core/app/models/rec';

const amanha = () => new Date(Date.now() + 86400000).toJSON().substring(0, 10);
const ontem = () => new Date(Date.now() - 86400000).toJSON().substring(0, 10);
const novoTxid = () => randomUUID().replace(/\-/g, '');
const omit = (obj: any, ...keys: string[]) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

const baseBody = (): any => ({
  idRec: 'RR1234567820240115abcdefghijk',
  infoAdicional: 'Serviços de Streamming de Música e Filmes.',
  calendario: { dataDeVencimento: amanha() },
  valor: { original: '106.07' },
  ajusteDiaUtil: true,
  devedor: {
    cep: '89256140',
    cidade: 'Uberlândia',
    email: 'sebastiao.tavares@mail.com',
    logradouro: 'Alameda Franco 1056',
    uf: 'MG',
  },
  recebedor: { agencia: '9708', conta: '012682', tipoConta: 'CORRENTE' },
});

const TYPE = 'https://pix.bcb.gov.br/api/v2/error/CobROperacaoInvalida';
const DETAIL = 'A cobrança não respeita o schema.';

describe('COBR', () => {
  let app: INestApplication;

  beforeAll(async () => {
    MemoryDB.create('COBR', ['txid']);
    MemoryDB.create('REC', ['idRec']);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const errorFormatter = (
      errors: ValidationError[],
      errMessage?: any,
      parentField?: string,
    ): any => {
      const message = errMessage || {};
      let errorField = '';
      let validationsList;

      errors.forEach((error) => {
        errorField = parentField
          ? `${parentField}.${error.property}`
          : error?.property;
        if (!error?.constraints && error?.children?.length) {
          errorFormatter(error.children, message, errorField);
        } else {
          validationsList = Object.values(error?.constraints);
          message[errorField] =
            validationsList.length > 0
              ? validationsList.pop()
              : 'Invalid Value!';
        }
      });

      return message;
    };
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        disableErrorMessages: false,
        transform: true,
        skipMissingProperties: true,
        exceptionFactory: (errors) => {
          throw new BadRequestException(errorFormatter(errors));
        },
      }),
    );
    await app.init();
  });

  afterAll(async () => await app.close());

  let txid: string;
  let body: any;

  beforeEach(() => {
    txid = novoTxid();
    body = baseBody();
  });

  const put = (id: string, payload: any, token = '123-abc') =>
    request(app.getHttpServer())
      .put(`/cobr/${id}`)
      .send(payload)
      .set('mocked-token', token);
  const violacao = (propriedade: string, razao: string) => ({
    status: 400,
    type: TYPE,
    detail: DETAIL,
    violacoes: [{ propriedade, razao }],
  });

  describe('/PUT', () => {
    describe('400', () => {
      it('O objeto cobr.calendario não respeita o schema.', async () => {
        await put(txid, omit(body, 'calendario'))
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.calendario',
                'O objeto cobr.calendario não respeita o schema.',
              ),
            ),
          );
      });

      it('O campo cobr.calendario.dataDeVencimento é anterior à data de criação da cobrança.', async () => {
        await put(txid, { ...body, calendario: { dataDeVencimento: ontem() } })
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.calendario.dataDeVencimento',
                'O campo cobr.calendario.dataDeVencimento é anterior à data de criação da cobrança.',
              ),
            ),
          );
      });

      it('O campo cobr.valor.original não respeita o schema.', async () => {
        await put(txid, { ...body, valor: { original: 'abc' } })
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.valor.original',
                'O campo cobr.valor.original não respeita o schema.',
              ),
            ),
          );
      });

      it('Campos obrigatórios ausentes em objetos aninhados', async () => {
        await put(txid, {
          ...body,
          valor: { extra: '1' },
          calendario: { extra: '1' },
        })
          .expect(400)
          .expect((res) => {
            const err = JSON.parse(res.text);
            expect(err.type).toBe(TYPE);
            expect(err.violacoes.map((v) => v.propriedade)).toEqual(
              expect.arrayContaining([
                'cobr.valor.original',
                'cobr.calendario.dataDeVencimento',
              ]),
            );
          });
        await request(app.getHttpServer())
          .get(`/cobr/${txid}`)
          .set('mocked-token', '123-abc')
          .expect(404);
      });

      it('PUTs concorrentes com o mesmo txid criam uma única cobrança', async () => {
        const res = await Promise.all([
          put(txid, body),
          put(txid, { ...body, valor: { original: '200.00' } }),
        ]);
        expect(res.map((r) => r.status).sort()).toEqual([201, 400]);
      });

      it('O campo cobr.valor.original é zero.', async () => {
        await put(txid, { ...body, valor: { original: '0.00' } })
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.valor.original',
                'O campo cobr.valor.original é zero.',
              ),
            ),
          );
      });

      it('O campo cobr.idRec não respeita o schema.', async () => {
        await put(txid, { ...body, idRec: 'XX123' })
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.idRec',
                'O campo cobr.idRec não respeita o schema.',
              ),
            ),
          );
      });

      it('O objeto cobr.recebedor não respeita o schema.', async () => {
        await put(txid, omit(body, 'recebedor'))
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.recebedor',
                'O objeto cobr.recebedor não respeita o schema.',
              ),
            ),
          );
      });

      it('O campo cobr.recebedor.tipoConta não respeita o schema.', async () => {
        await put(txid, {
          ...body,
          recebedor: { conta: '012682', tipoConta: 'XPTO' },
        })
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.recebedor.tipoConta',
                'O campo cobr.recebedor.tipoConta não respeita o schema.',
              ),
            ),
          );
      });

      it('O campo cobr.infoAdicional não respeita o schema.', async () => {
        await put(txid, { ...body, infoAdicional: 'a'.repeat(141) })
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao(
                'cobr.infoAdicional',
                'O campo cobr.infoAdicional não respeita o schema.',
              ),
            ),
          );
      });

      it('O campo cobr.txid não respeita o schema.', async () => {
        await put('abc', body)
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject(
              violacao('cobr.txid', 'O campo cobr.txid não respeita o schema.'),
            ),
          );
      });

      it('txid já utilizado', async () => {
        await put(txid, body).expect(201);
        await put(txid, body)
          .expect(400)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject({
              status: 400,
              type: TYPE,
              violacoes: [],
            }),
          );
      });
    });

    describe('401', () => {
      it('Sem cabeçalho', async () => {
        await request(app.getHttpServer())
          .put(`/cobr/${txid}`)
          .send(body)
          .expect(401)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject({ status: 401 }),
          );
      });

      it('Cabeçalho inválido', async () => {
        await put(txid, body, 'xpto')
          .expect(401)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject({ status: 401 }),
          );
      });
    });

    describe('201', () => {
      it('Preenchimento válido', async () => {
        await put(txid, body)
          .expect(201)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject({
              idRec: body.idRec,
              txid,
              status: 'CRIADA',
              politicaRetentativa: 'PERMITE_3R_7D',
              ajusteDiaUtil: true,
              calendario: {
                criacao: new Date().toJSON().substring(0, 10),
                dataDeVencimento: body.calendario.dataDeVencimento,
              },
              valor: body.valor,
              recebedor: body.recebedor,
              devedor: body.devedor,
              atualizacao: [{ status: 'CRIADA' }],
            }),
          );
      });

      it('Preenchimento mínimo: ajusteDiaUtil padrão true e política NAO_PERMITE para idRec RN', async () => {
        await put(txid, {
          ...omit(body, 'infoAdicional', 'devedor', 'ajusteDiaUtil'),
          idRec: 'RN1234567820240115abcdefghijk',
        })
          .expect(201)
          .expect((res) =>
            expect(JSON.parse(res.text)).toMatchObject({
              txid,
              ajusteDiaUtil: true,
              politicaRetentativa: 'NAO_PERMITE',
            }),
          );
      });
    });
  });

  describe('/PUT com idRec gerado por /POST /rec', () => {
    const pessoa = () => ({
      cep: '26083190',
      cidade: 'Nova Iguaçu',
      logradouro: 'Rua Gemeos',
      uf: 'RJ',
      nome: 'Teste da Silva',
      cpf: gerarCPF(),
    });
    const criarRec = (politicaRetentativa: PoliticaRetentativa) =>
      request(app.getHttpServer())
        .post('/rec')
        .send({
          vinculo: {
            objeto: 'Pagamento de assinatura de serviço',
            contrato: novoTxid(),
            devedor: pessoa(),
          },
          ativacao: { dadosJornada: { txid: novoTxid() } },
          calendario: {
            dataInicial: new Date().toJSON(),
            periodicidade: PeriodicidadeRecorrencia.Mensal,
          },
          politicaRetentativa,
          recebedor: pessoa(),
          valor: { valorRec: '1000.00' },
        })
        .set('mocked-token', '123-abc')
        .expect(201)
        .then((res) => JSON.parse(res.text).idRec as string);

    it.each([
      [PoliticaRetentativa.Permite, 'PERMITE_3R_7D'],
      [PoliticaRetentativa.NaoPermite, 'NAO_PERMITE'],
    ])('201 %s', async (politica, esperado) => {
      const idRec = await criarRec(politica);
      expect(idRec).toMatch(/^R[RN][0-9]{8}[0-9]{8}[a-zA-Z0-9]{11}$/);
      await put(txid, { ...body, idRec })
        .expect(201)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            idRec,
            politicaRetentativa: esperado,
          }),
        );
    });
  });

  describe('/POST', () => {
    it('201', async () => {
      await request(app.getHttpServer())
        .post('/cobr')
        .send(body)
        .set('mocked-token', '123-abc')
        .expect(201)
        .expect((res) => {
          const cobr = JSON.parse(res.text);
          expect(cobr).toMatchObject({ idRec: body.idRec, status: 'CRIADA' });
          expect(cobr.txid).toMatch(/^[a-zA-Z0-9]{26,35}$/);
        });
    });

    it('400', async () => {
      await request(app.getHttpServer())
        .post('/cobr')
        .send({ ...body, valor: { original: 'abc' } })
        .set('mocked-token', '123-abc')
        .expect(400)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject(
            violacao(
              'cobr.valor.original',
              'O campo cobr.valor.original não respeita o schema.',
            ),
          ),
        );
    });

    it('401', async () => {
      await request(app.getHttpServer()).post('/cobr').send(body).expect(401);
    });
  });

  describe('/GET {:txid}', () => {
    it('200', async () => {
      await put(txid, body).expect(201);
      await request(app.getHttpServer())
        .get(`/cobr/${txid}`)
        .set('mocked-token', '123-abc')
        .expect(200)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            txid,
            idRec: body.idRec,
            status: 'CRIADA',
            politicaRetentativa: 'PERMITE_3R_7D',
          }),
        );
    });

    it('404 txid inexistente', async () => {
      await request(app.getHttpServer())
        .get(`/cobr/${novoTxid()}`)
        .set('mocked-token', '123-abc')
        .expect(404)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({ status: 404 }),
        );
    });

    it('404 cobrança de outro usuário recebedor', async () => {
      await put(txid, body).expect(201);
      await request(app.getHttpServer())
        .get(`/cobr/${txid}`)
        .set('mocked-token', '456-def')
        .expect(404);
    });

    it('401', async () => {
      await request(app.getHttpServer()).get(`/cobr/${txid}`).expect(401);
    });
  });

  describe('/GET', () => {
    const TOKEN = '789-ghi';
    const inicio = new Date(Date.now() - 86400000).toJSON();
    const fim = new Date(Date.now() + 86400000).toJSON();
    const idRecN = 'RN9876543220240115abcdefghijk';
    const list = (qry: string) =>
      request(app.getHttpServer())
        .get(`/cobr?${qry}`)
        .set('mocked-token', TOKEN);

    beforeAll(async () => {
      for (let i = 0; i < 5; i++) {
        await put(novoTxid(), baseBody(), TOKEN).expect(201);
      }
      const id = novoTxid();
      await put(id, { ...baseBody(), idRec: idRecN }, TOKEN).expect(201);
      await request(app.getHttpServer())
        .patch(`/cobr/${id}`)
        .send({ status: 'CANCELADA' })
        .set('mocked-token', TOKEN)
        .expect(200);
    });

    it('200 período', async () => {
      await list(`inicio=${inicio}&fim=${fim}`)
        .expect(200)
        .expect((res) => {
          const { parametros, cobsr } = JSON.parse(res.text);
          expect(cobsr).toHaveLength(6);
          expect(parametros).toMatchObject({
            inicio,
            fim,
            paginacao: {
              paginaAtual: 0,
              itensPorPagina: 100,
              quantidadeDePaginas: 1,
              quantidadeTotalDeItens: 6,
            },
          });
        });
    });

    it('200 período sem cobranças', async () => {
      await list(`inicio=2020-01-01T00:00:00Z&fim=2020-01-02T00:00:00Z`)
        .expect(200)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            cobsr: [],
            parametros: { paginacao: { quantidadeTotalDeItens: 0 } },
          }),
        );
    });

    it('200 filtro idRec', async () => {
      await list(`inicio=${inicio}&fim=${fim}&idRec=${idRecN}`)
        .expect(200)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            parametros: {
              idRec: idRecN,
              paginacao: { quantidadeTotalDeItens: 1 },
            },
            cobsr: [{ idRec: idRecN }],
          }),
        );
    });

    it('200 filtro status', async () => {
      await list(`inicio=${inicio}&fim=${fim}&status=CANCELADA`)
        .expect(200)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            parametros: {
              status: 'CANCELADA',
              paginacao: { quantidadeTotalDeItens: 1 },
            },
            cobsr: [{ status: 'CANCELADA' }],
          }),
        );
    });

    it('200 paginação', async () => {
      await list(
        `inicio=${inicio}&fim=${fim}&paginacao.paginaAtual=1&paginacao.itensPorPagina=4`,
      )
        .expect(200)
        .expect((res) => {
          const { parametros, cobsr } = JSON.parse(res.text);
          expect(cobsr).toHaveLength(2);
          expect(parametros.paginacao).toMatchObject({
            paginaAtual: 1,
            itensPorPagina: 4,
            quantidadeDePaginas: 2,
            quantidadeTotalDeItens: 6,
          });
        });
    });

    it('400 inicio ausente', async () => {
      await list(`fim=${fim}`)
        .expect(400)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject(
            violacao(
              'cobr.inicio',
              'O campo cobr.inicio não respeita o schema.',
            ),
          ),
        );
    });

    it('401', async () => {
      await request(app.getHttpServer())
        .get(`/cobr?inicio=${inicio}&fim=${fim}`)
        .expect(401);
    });
  });

  describe('/PATCH', () => {
    const patch = (id: string, payload: any) =>
      request(app.getHttpServer())
        .patch(`/cobr/${id}`)
        .send(payload)
        .set('mocked-token', '123-abc');

    it('200 cancelamento', async () => {
      await put(txid, body).expect(201);
      await patch(txid, { status: 'CANCELADA' })
        .expect(200)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            txid,
            status: 'CANCELADA',
            atualizacao: [{ status: 'CRIADA' }, { status: 'CANCELADA' }],
            encerramento: {
              cancelamento: {
                solicitante: 'USUARIO_RECEBEDOR',
                codigo: 'SLCR',
              },
            },
          }),
        );
      await request(app.getHttpServer())
        .get(`/cobr/${txid}`)
        .set('mocked-token', '123-abc')
        .expect(200)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({ status: 'CANCELADA' }),
        );
    });

    it('400 status não respeita o schema', async () => {
      await put(txid, body).expect(201);
      await patch(txid, { status: 'ATIVA' })
        .expect(400)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject(
            violacao(
              'cobr.status',
              'O campo cobr.status não respeita o schema.',
            ),
          ),
        );
    });

    it('400 cobrança já cancelada', async () => {
      await put(txid, body).expect(201);
      await patch(txid, { status: 'CANCELADA' }).expect(200);
      await patch(txid, { status: 'CANCELADA' })
        .expect(400)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            status: 400,
            type: TYPE,
            title: 'Operação inválida.',
            violacoes: [],
          }),
        );
    });

    it('404', async () => {
      await patch(novoTxid(), { status: 'CANCELADA' })
        .expect(404)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({ status: 404 }),
        );
    });

    it('401', async () => {
      await request(app.getHttpServer())
        .patch(`/cobr/${txid}`)
        .send({ status: 'CANCELADA' })
        .expect(401);
    });
  });

  describe('/POST {:txid}/retentativa/{:data}', () => {
    const retentativa = (id: string, data: string) =>
      request(app.getHttpServer())
        .post(`/cobr/${id}/retentativa/${data}`)
        .set('mocked-token', '123-abc');

    it('201', async () => {
      await put(txid, body).expect(201);
      await retentativa(txid, amanha())
        .expect(201)
        .expect((res) => {
          const cobr = JSON.parse(res.text);
          expect(cobr).toMatchObject({
            txid,
            tentativas: [
              {
                dataLiquidacao: amanha(),
                tipo: 'NTAG',
                status: 'SOLICITADA',
                atualizacao: [{ status: 'SOLICITADA' }],
              },
            ],
          });
          expect(cobr.tentativas[0].endToEndId).toMatch(/^E[a-zA-Z0-9]{31}$/);
        });
    });

    it('400 política da recorrência não permite retentativa', async () => {
      await put(txid, {
        ...body,
        idRec: 'RN1234567820240115abcdefghijk',
      }).expect(201);
      await retentativa(txid, amanha())
        .expect(400)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            status: 400,
            type: TYPE,
            detail:
              'A política configurada na recorrência não permite retentativa de cobrança.',
          }),
        );
    });

    it('400 limite de retentativas', async () => {
      await put(txid, body).expect(201);
      for (let i = 0; i < 3; i++) {
        await retentativa(txid, amanha()).expect(201);
      }
      await retentativa(txid, amanha()).expect(400);
    });

    it('400 cobrança cancelada', async () => {
      await put(txid, body).expect(201);
      await request(app.getHttpServer())
        .patch(`/cobr/${txid}`)
        .send({ status: 'CANCELADA' })
        .set('mocked-token', '123-abc')
        .expect(200);
      await retentativa(txid, amanha()).expect(400);
    });

    it('400 data de liquidação no passado', async () => {
      await put(txid, body).expect(201);
      await retentativa(txid, ontem())
        .expect(400)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({
            type: TYPE,
            detail:
              'A data de liquidação da retentativa está fora do período permitido.',
          }),
        );
    });

    it('400 data de liquidação após 7 dias do vencimento', async () => {
      await put(txid, body).expect(201);
      const data = new Date(Date.now() + 9 * 86400000)
        .toJSON()
        .substring(0, 10);
      await retentativa(txid, data).expect(400);
    });

    it('retentativas concorrentes respeitam o limite', async () => {
      await put(txid, body).expect(201);
      await retentativa(txid, amanha()).expect(201);
      await retentativa(txid, amanha()).expect(201);
      const res = await Promise.all([
        retentativa(txid, amanha()),
        retentativa(txid, amanha()),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([201, 400]);
      await request(app.getHttpServer())
        .get(`/cobr/${txid}`)
        .set('mocked-token', '123-abc')
        .expect(200)
        .expect((r) => expect(JSON.parse(r.text).tentativas).toHaveLength(3));
    });

    it('400 data inválida', async () => {
      await put(txid, body).expect(201);
      await retentativa(txid, '2024-02-30')
        .expect(400)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject(
            violacao('cobr.data', 'O campo cobr.data não respeita o schema.'),
          ),
        );
    });

    it('404', async () => {
      await retentativa(novoTxid(), amanha())
        .expect(404)
        .expect((res) =>
          expect(JSON.parse(res.text)).toMatchObject({ status: 404 }),
        );
    });

    it('401', async () => {
      await request(app.getHttpServer())
        .post(`/cobr/${txid}/retentativa/${amanha()}`)
        .expect(401);
    });
  });
});
