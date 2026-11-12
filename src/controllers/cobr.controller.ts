import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import {
  CobRGetFilter,
  CobRPatchRequest,
  CobRPutRequest,
} from '../core/app/models/cobr';
import { PixRequest } from '../core/app/models';
import { randomUUID } from 'crypto';

const SCHEMA_ERROR = 'O campo $$ não respeita o schema.';

const validateTxId = (txid: string) => {
  if (!/^[a-zA-Z0-9]{26,35}$/.test(String(txid ?? ''))) {
    throw new BadRequestException({ txid: SCHEMA_ERROR });
  }
};

const validateDate = (data: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data ?? ''));
  const [year, month, day] = m ? m.slice(1).map(Number) : [];
  const lastDay = m ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (!m || month < 1 || month > 12 || day < 1 || day > lastDay) {
    throw new BadRequestException({ data: SCHEMA_ERROR });
  }
};

@Controller('cobr')
@UseInterceptors(HttpInterceptor)
export class CobRController {
  constructor(private readonly pspService: PSP) {}

  @Put(':txid')
  @HttpCode(201)
  async add(
    @Body() data: CobRPutRequest,
    @Param('txid') txid,
    @Headers() headers,
  ) {
    validateTxId(txid);
    const IdOwner = headers['IdOwner'];
    const itm: PixRequest<CobRPutRequest> = { IdOwner, txid, data };
    return await this.pspService.addCobR(itm);
  }

  @Post()
  async create(@Body() data: CobRPutRequest, @Headers() headers) {
    const IdOwner = headers['IdOwner'];
    const txid: string = randomUUID().replace(/\-/g, '');
    const itm: PixRequest<CobRPutRequest> = { IdOwner, txid, data };
    return await this.pspService.addCobR(itm);
  }

  @Post(':txid/retentativa/:data')
  async createRetentativa(
    @Param('txid') txid,
    @Param('data') data,
    @Headers() headers,
  ) {
    validateDate(data);
    const IdOwner = headers['IdOwner'];
    const itm = await this.pspService.retentativaCobR({ IdOwner, txid }, data);
    if (!itm) {
      throw new NotFoundException();
    }
    return itm;
  }

  @Get(':txid')
  async read(@Param('txid') txid, @Headers() headers) {
    const IdOwner = headers['IdOwner'];
    return await this.pspService.readCobR({ IdOwner, txid });
  }

  @Get()
  list(@Headers() headers, @Query() qry: CobRGetFilter) {
    const IdOwner = headers['IdOwner'];
    return this.pspService.listCobR({ ...qry, IdOwner });
  }

  @Patch(':txid')
  edit(
    @Body() data: CobRPatchRequest,
    @Param('txid') txid,
    @Headers() headers,
  ) {
    const IdOwner = headers['IdOwner'];
    const itm: PixRequest<CobRPatchRequest> = { IdOwner, txid, data };
    return this.pspService.editCobR(itm);
  }
}
