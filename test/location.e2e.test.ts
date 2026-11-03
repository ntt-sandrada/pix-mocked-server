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
                    .expect(200)
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
                    .expect(200)
                    .then(v => itm = v.body);

                await request(app.getHttpServer())
                    .delete(`/loc/${itm.loc.id}/txid`)
                    .set("mocked-token", "123-abc")
                    .expect(200)

            });

        });
    });
})
