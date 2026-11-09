import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PSP } from '../../src/core/app/psp';
import { randomUUID } from 'crypto';
import { MemoryDB } from '../../src/libs/fakedb';
import { CobRController } from '../../src/controllers/cobr.controller';
import {
  CobRPutRequest,
  StatusCobR,
  StatusTentativa,
  TipoTentativa,
} from '../../src/core/app/models/cobr';
import { TipoConta } from '../../src/core/app/models';
import { PoliticaRetentativa } from '../../src/core/app/models/rec';
import { OperacaoInvalidaException } from '../../src/libs/errors';

const amanha = () => new Date(Date.now() + 86400000).toJSON().substring(0, 10);

describe('CobRController', () => {
  let ctrl: CobRController;

  beforeAll(async () => {
    MemoryDB.create('COBR', ['txid']);
    MemoryDB.create('REC', ['idRec']);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [CobRController],
      providers: [PSP],
    }).compile();

    ctrl = app.get<CobRController>(CobRController);
  });

  let IdOwner: string;
  let txid: string;
  let body: CobRPutRequest;

  beforeEach(async () => {
    IdOwner = randomUUID();
    txid = randomUUID().replace(/\-/g, '');
    body = {
      idRec: 'RR1234567820240115abcdefghijk',
      calendario: { dataDeVencimento: amanha() },
      valor: { original: '106.07' },
      recebedor: {
        agencia: '9708',
        conta: '012682',
        tipoConta: TipoConta.Corrente,
      },
    };
  });

  describe('ADD', () => {
    it('success', async () => {
      await expect(ctrl.add(body, txid, { IdOwner })).resolves.toMatchObject({
        idRec: body.idRec,
        txid,
        status: StatusCobR.Criada,
        ajusteDiaUtil: true,
        politicaRetentativa: PoliticaRetentativa.Permite,
        calendario: { dataDeVencimento: body.calendario.dataDeVencimento },
        atualizacao: [{ status: StatusCobR.Criada }],
      });
    });

    it('txid inválido', () =>
      expect(ctrl.add(body, 'abc', { IdOwner })).rejects.toBeInstanceOf(
        BadRequestException,
      ));

    it('txid duplicado', async () => {
      await ctrl.add(body, txid, { IdOwner });
      await expect(ctrl.add(body, txid, { IdOwner })).rejects.toBeInstanceOf(
        OperacaoInvalidaException,
      );
    });
  });

  describe('CREATE', () => {
    it('success', async () => {
      const cobr = await ctrl.create(body, { IdOwner });
      await expect(ctrl.read(cobr.txid, { IdOwner })).resolves.toMatchObject({
        txid: cobr.txid,
        status: StatusCobR.Criada,
      });
    });
  });

  describe('READ', () => {
    it('inexistente', () =>
      expect(ctrl.read(txid, { IdOwner })).resolves.toBeUndefined());
  });

  describe('EDIT', () => {
    it('cancelamento', async () => {
      await ctrl.add(body, txid, { IdOwner });
      await expect(
        ctrl.edit({ status: StatusCobR.Cancelada }, txid, { IdOwner }),
      ).resolves.toMatchObject({
        status: StatusCobR.Cancelada,
        atualizacao: [
          { status: StatusCobR.Criada },
          { status: StatusCobR.Cancelada },
        ],
        encerramento: {
          cancelamento: { solicitante: 'USUARIO_RECEBEDOR', codigo: 'SLCR' },
        },
      });
    });

    it('cancelamento duplicado', async () => {
      await ctrl.add(body, txid, { IdOwner });
      await ctrl.edit({ status: StatusCobR.Cancelada }, txid, { IdOwner });
      await expect(
        ctrl.edit({ status: StatusCobR.Cancelada }, txid, { IdOwner }),
      ).rejects.toBeInstanceOf(OperacaoInvalidaException);
    });

    it('inexistente', () =>
      expect(
        ctrl.edit({ status: StatusCobR.Cancelada }, txid, { IdOwner }),
      ).resolves.toBeUndefined());
  });

  describe('RETENTATIVA', () => {
    it('success', async () => {
      await ctrl.add(body, txid, { IdOwner });
      const res = await ctrl.createRetentativa(txid, amanha(), { IdOwner });
      expect(res.tentativas).toHaveLength(1);
      expect(res.tentativas[0]).toMatchObject({
        dataLiquidacao: amanha(),
        tipo: TipoTentativa.NaoAgendada,
        status: StatusTentativa.Solicitada,
      });
      expect(res.tentativas[0].endToEndId).toMatch(/^E[a-zA-Z0-9]{31}$/);
    });

    it('política não permite', async () => {
      await ctrl.add(
        { ...body, idRec: 'RN1234567820240115abcdefghijk' },
        txid,
        { IdOwner },
      );
      await expect(
        ctrl.createRetentativa(txid, amanha(), { IdOwner }),
      ).rejects.toBeInstanceOf(OperacaoInvalidaException);
    });

    it('limite de retentativas', async () => {
      await ctrl.add(body, txid, { IdOwner });
      for (let i = 0; i < 3; i++) {
        await ctrl.createRetentativa(txid, amanha(), { IdOwner });
      }
      await expect(
        ctrl.createRetentativa(txid, amanha(), { IdOwner }),
      ).rejects.toBeInstanceOf(OperacaoInvalidaException);
    });

    it('data inválida', () =>
      expect(
        ctrl.createRetentativa(txid, '2024-02-30', { IdOwner }),
      ).rejects.toBeInstanceOf(BadRequestException));

    it('inexistente', () =>
      expect(
        ctrl.createRetentativa(txid, amanha(), { IdOwner }),
      ).rejects.toBeInstanceOf(NotFoundException));
  });

  describe('LIST', () => {
    const inicio = new Date(Date.now() - 86400000).toJSON();
    const fim = new Date(Date.now() + 86400000).toJSON();

    it('filtros e paginação', async () => {
      for (let i = 0; i < 5; i++) {
        await ctrl.create(body, { IdOwner });
      }
      const outro = await ctrl.create(
        { ...body, idRec: 'RN1234567820240115abcdefghijk' },
        { IdOwner },
      );
      await ctrl.edit({ status: StatusCobR.Cancelada }, outro.txid, {
        IdOwner,
      });

      await expect(
        ctrl.list({ IdOwner }, { inicio, fim }),
      ).resolves.toMatchObject({
        parametros: { paginacao: { quantidadeTotalDeItens: 6 } },
      });
      await expect(
        ctrl.list({ IdOwner }, { inicio, fim, idRec: body.idRec }),
      ).resolves.toMatchObject({
        parametros: { paginacao: { quantidadeTotalDeItens: 5 } },
      });
      await expect(
        ctrl.list({ IdOwner }, { inicio, fim, status: StatusCobR.Cancelada }),
      ).resolves.toMatchObject({ cobsr: [{ txid: outro.txid }] });

      const pag = await ctrl.list(
        { IdOwner },
        { inicio, fim, paginacao: { paginaAtual: 1, itensPorPagina: 4 } },
      );
      expect(pag.cobsr).toHaveLength(2);
      expect(pag.parametros.paginacao).toMatchObject({
        paginaAtual: 1,
        itensPorPagina: 4,
        quantidadeDePaginas: 2,
        quantidadeTotalDeItens: 6,
      });
    });
  });
});
