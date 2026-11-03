import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { randomUUID } from 'crypto';
import { MemoryDB } from '../src/libs/fakedb';
import { correntistas } from '../src/data/db.json'
import { TipoCob } from '../src/core/app/models';

describe('LOC', () => {
    let app: INestApplication;


    beforeAll(async () => {

        const cst = MemoryDB.create("CORRENTISTAS", ['chave']);
        MemoryDB.create("COB", ['txid']);
        MemoryDB.create("COB_HIST", ['id']);
        MemoryDB.create("LOCATIONS", ['id', 'uuid']);
        MemoryDB.create("LOC_COB", ['id', 'txid']);

        await Promise.all(correntistas.map(c => cst.add('DEV', c)));

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();


        const errorFormatter = (errors: ValidationError[], errMessage?: any, parentField?: string): any => {
            const message = errMessage || {};
            let errorField = '';
            let validationsList;

            errors.forEach((error) => {
                errorField = parentField ? `${parentField}.${error.property}` : error?.property;
                if (!error?.constraints && error?.children?.length) {
                    errorFormatter(error.children, message, errorField);
                } else {
                    validationsList = Object.values(error?.constraints);
                    message[errorField] = validationsList.length > 0 ? validationsList.pop() : 'Invalid Value!';
                }
            });

            return message;
        }
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({
            disableErrorMessages: false,
            transform: true,
            skipMissingProperties: true,
            exceptionFactory: (errors) => {
                throw new BadRequestException(errorFormatter(errors))

            }
        }));
        await app.init();
    });


    let IdOwner: string;
    let txid: string;
    let chave: string;

    beforeEach(() => {
        IdOwner = randomUUID();
        txid = randomUUID().replace(/\-/g, '');
        chave = correntistas[Math.floor(Math.random() * correntistas.length)].chave
    })




    describe('/POST', () => {

        describe('400', () => {
            it('o campo tipoCob não respeita o schema.', async () => {
                await request(app.getHttpServer())
                    .post(`/loc`)
                    .send({ IdOwner, tipoCob: 4 })
                    .set("mocked-token", "123-abc")
                    .expect(400)
                    .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400 }));
            });
        })

        describe('401', () => {
            it('Sem cabeçalho', async () => {
                await request(app.getHttpServer())
                    .post(`/loc`)
                    .send({ IdOwner, tipoCob: TipoCob.imediato })
                    .expect(401)
                    .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
            });

            it('Cabeçalho inválido', async () => {
                await request(app.getHttpServer())
                    .post(`/loc`)
                    .send({ IdOwner, tipoCob: TipoCob.imediato })
                    .set("mocked-token", "xpto")
                    .expect(401)
                    .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
            });
        });

        describe('201', () => {
            it.each([TipoCob.imediato, TipoCob.vencimento])('tipoCob %s', async (tipoCob) => {
                const res = await request(app.getHttpServer())
                    .post(`/loc`)
                    .send({ tipoCob })
                    .set("mocked-token", "123-abc")
                    .expect(201);

                expect(res.body).toMatchObject({ id: expect.any(Number), tipoCob, location: expect.any(String), criacao: expect.any(String) });
                expect(res.headers['location']).toBe(`/loc/${res.body.id}`);

                await request(app.getHttpServer())
                    .get(res.headers['location'])
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .expect((r: any) => expect(r.body).toMatchObject({ id: res.body.id, tipoCob }));
            });

            it('ids distintos a cada criação', async () => {
                const post = () => request(app.getHttpServer()).post(`/loc`).send({ tipoCob: TipoCob.imediato }).set("mocked-token", "123-abc").expect(201);
                const a = await post();
                const b = await post();
                expect(a.body.id).not.toBe(b.body.id);
            });
        })
    })

    describe('/PUT (fora da spec BACEN)', () => {
        it('PUT /loc → 404', async () => {
            await request(app.getHttpServer())
                .put(`/loc`)
                .send({ tipoCob: TipoCob.imediato })
                .set("mocked-token", "123-abc")
                .expect(404);
        });

        it('PUT /loc/123 → 404', async () => {
            await request(app.getHttpServer())
                .put(`/loc/123`)
                .send({ tipoCob: TipoCob.imediato })
                .set("mocked-token", "123-abc")
                .expect(404);
        });
    })



    describe('/GET/{id}', () => {
        describe('400', () => {
            it.each(['abc', '0', '-1', '1.5', '12abc'])('id inválido (%s)', async (id) => {
                await request(app.getHttpServer())
                    .get(`/loc/${id}`)
                    .set("mocked-token", "123-abc")
                    .expect(400)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, violacoes: [{ propriedade: 'loc.id' }] }));
            })
        })

        describe('404', () => {
            it('id inexistente', async () => {
                const id = 99999;
                await request(app.getHttpServer())
                    .get(`/loc/${id}`)
                    .set("mocked-token", "123-abc")
                    .expect(404)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 404 }));
            })
        })

        describe('200', () => {
            it('/loc', async () => {
                let itm: any = undefined;
                await request(app.getHttpServer())
                    .post(`/loc`)
                    .send({ tipoCob: TipoCob.imediato })
                    .set("mocked-token", "123-abc")
                    .expect(201)
                    .then(v => itm = v.body);

                await request(app.getHttpServer())
                    .get(`/loc/${itm.id}`)
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject(itm))
            });

            it('/cob', async () => {
                let itm: any = undefined;
                await request(app.getHttpServer())
                    .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
                    .send({ chave, valor: { original: "1.00" } })
                    .set("mocked-token", "123-abc")
                    .expect(201)
                    .then(v => itm = v.body)


                await request(app.getHttpServer())
                    .get(`/loc/${itm.loc.id}`)
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ txid: itm.txid, id: itm.loc.id }))
            });
        })
    });


    describe('/DELETE', () => {
        describe('400', () => {
            it.each(['abc', '0', '-1', '1.5'])('id inválido (%s)', async (id) => {
                await request(app.getHttpServer())
                    .delete(`/loc/${id}/txid`)
                    .set("mocked-token", "123-abc")
                    .expect(400)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, violacoes: [{ propriedade: 'loc.id' }] }));
            })
        });

        describe('404', () => {
            it('id inexistente', async () => {
                const id = 99999;
                await request(app.getHttpServer())
                    .delete(`/loc/${id}/txid`)
                    .set("mocked-token", "123-abc")
                    .expect(404)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 404 }));
            })
        });

        describe('200', () => {
            it('Preenchimento válido', async () => {
                let itm: any = undefined;
                await request(app.getHttpServer())
                    .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
                    .send({ chave, valor: { original: "1.00" } })
                    .set("mocked-token", "123-abc")
                    .expect(201)
                    .then(v => itm = v.body);

                await request(app.getHttpServer())
                    .delete(`/loc/${itm.loc.id}/txid`)
                    .set("mocked-token", "123-abc")
                    .expect(200)

            });

        });
    });

    describe('Conformidade BACEN', () => {
        const T = ["mocked-token", "123-abc"] as const;
        const periodo = () => ({ inicio: new Date(Date.now() - 3600_000).toISOString(), fim: new Date(Date.now() + 3600_000).toISOString() });
        const novaCob = async () => (await request(app.getHttpServer()).put(`/cob/${randomUUID().replace(/\-/g, '')}`).send({ chave, valor: { original: "1.00" } }).set(...T).expect(201)).body;

        it('POST /loc 400 usa type/title PayloadLocation', async () => {
            await request(app.getHttpServer())
                .post(`/loc`)
                .send({ tipoCob: 'xpto' })
                .set(...T)
                .expect(400)
                .expect((res: any) => expect(res.body).toMatchObject({ type: 'https://pix.bcb.gov.br/api/v2/error/PayloadLocationOperacaoInvalida', title: 'PayloadLocation inválido.', status: 400 }));
        });

        it('POST e GET /loc/{id} retornam apenas campos do PayloadLocation', async () => {
            const { body } = await request(app.getHttpServer()).post(`/loc`).send({ tipoCob: TipoCob.vencimento }).set(...T).expect(201);
            expect(Object.keys(body).sort()).toEqual(['criacao', 'id', 'location', 'tipoCob']);
            const get = await request(app.getHttpServer()).get(`/loc/${body.id}`).set(...T).expect(200);
            expect(get.body).toEqual(body);
        });

        it('DELETE /loc/{id}/txid retorna PayloadLocation sem txid e desvincula a cob', async () => {
            const cob = await novaCob();
            await request(app.getHttpServer())
                .delete(`/loc/${cob.loc.id}/txid`)
                .set(...T)
                .expect(200)
                .expect((res: any) => {
                    expect(res.body).toMatchObject({ id: cob.loc.id, tipoCob: TipoCob.imediato, location: expect.any(String), criacao: expect.any(String) });
                    expect(res.body.txid).toBeUndefined();
                    expect(res.body.uuid).toBeUndefined();
                });

            await request(app.getHttpServer()).get(`/loc/${cob.loc.id}`).set(...T).expect(200)
                .expect((res: any) => expect(res.body.txid).toBeUndefined());
            await request(app.getHttpServer()).get(`/cob/${cob.txid}`).set(...T).expect(200)
                .expect((res: any) => { expect(res.body.loc).toBeUndefined(); expect(res.body.location).toBeUndefined(); });
        });

        it('DELETE /loc/{id}/txid em location sem cobrança → 200', async () => {
            const { body } = await request(app.getHttpServer()).post(`/loc`).send({ tipoCob: TipoCob.imediato }).set(...T).expect(201);
            await request(app.getHttpServer()).delete(`/loc/${body.id}/txid`).set(...T).expect(200)
                .expect((res: any) => expect(res.body).toEqual(body));
        });

        describe('GET /loc', () => {
            it.each([
                [{}, 'loc.inicio'],
                [{ inicio: new Date().toISOString() }, 'loc.fim'],
                [{ inicio: 'ontem', fim: new Date().toISOString() }, 'loc.inicio'],
                [{ 'paginacao.itensPorPagina': 0 }, 'loc.paginacao.itensPorPagina'],
                [{ 'paginacao.itensPorPagina': 1001 }, 'loc.paginacao.itensPorPagina'],
                [{ 'paginacao.paginaAtual': -1 }, 'loc.paginacao.paginaAtual'],
                [{ txIdPresente: 'talvez' }, 'loc.txIdPresente'],
                [{ tipoCob: 'cobr' }, 'loc.tipoCob'],
            ])('query %p → 400 (%s)', async (query: any, propriedade) => {
                const q = 'inicio' in query || Object.keys(query).length === 0 ? query : { ...periodo(), ...query };
                await request(app.getHttpServer()).get(`/loc`).query(q).set(...T).expect(400)
                    .expect((res: any) => expect(res.body.violacoes).toEqual(expect.arrayContaining([expect.objectContaining({ propriedade })])));
            });

            it('paginacao.*, txIdPresente e tipoCob via query string; todo item tem location', async () => {
                await request(app.getHttpServer()).post(`/loc`).send({ tipoCob: TipoCob.imediato }).set(...T).expect(201);
                await novaCob();

                const { body } = await request(app.getHttpServer())
                    .get(`/loc`)
                    .query({ ...periodo(), 'paginacao.itensPorPagina': 1, 'paginacao.paginaAtual': 0 })
                    .set(...T)
                    .expect(200);
                expect(body.loc).toHaveLength(1);
                expect(body.parametros.paginacao).toMatchObject({ paginaAtual: 0, itensPorPagina: 1 });
                expect(body.parametros.paginacao.quantidadeTotalDeItens).toBeGreaterThanOrEqual(2);

                const all = (await request(app.getHttpServer()).get(`/loc`).query(periodo()).set(...T).expect(200)).body.loc;
                all.forEach((l: any) => { expect(l.location).toEqual(expect.any(String)); expect(l.uuid).toBeUndefined(); });

                const semTxid = (await request(app.getHttpServer()).get(`/loc`).query({ ...periodo(), txIdPresente: 'false' }).set(...T).expect(200)).body.loc;
                expect(semTxid.length).toBeGreaterThan(0);
                semTxid.forEach((l: any) => expect(l.txid).toBeUndefined());

                const cobv = (await request(app.getHttpServer()).get(`/loc`).query({ ...periodo(), tipoCob: 'cobv' }).set(...T).expect(200)).body.loc;
                cobv.forEach((l: any) => expect(l.tipoCob).toBe('cobv'));
            });
        });
    });
})
