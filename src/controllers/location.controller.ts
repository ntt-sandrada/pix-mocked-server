import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Query, Res, UseInterceptors } from "@nestjs/common";
import { Response } from "express";
import { LocGetResponse, LocGetFilter, LocPutRequest } from "../../src/core/app/models/loc";
import { TipoCob } from "../../src/core/app/models";
import { PSP } from "../../src/core/app/psp";
import { HttpInterceptor } from "../../src/http.interceptor";

const SCHEMA_ERROR = 'O campo $$ não respeita o schema.';

type PayloadLocation = Omit<LocGetResponse, 'uuid'>;

const toPayloadLocation = ({ uuid, ...loc }: LocGetResponse): PayloadLocation => loc;

const parseLocId = (value: any): number => {
    const id = /^[1-9][0-9]*$/.test(String(value ?? '')) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id)) {
        throw new BadRequestException({ id: SCHEMA_ERROR });
    }
    return id;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

const parseLocFilter = (qry: any = {}): LocGetFilter => {
    const errors: { [field: string]: string } = {};

    const dateTime = (field: string) => {
        const value = qry[field];
        if (typeof value !== 'string' || !RFC3339.test(value) || isNaN(Date.parse(value))) { errors[field] = SCHEMA_ERROR; }
        return value;
    }

    const integer = (field: string, min: number, max: number) => {
        const value = qry[`paginacao.${field}`] ?? qry.paginacao?.[field];
        if (value === undefined) { return undefined; }
        const n = typeof value === 'number' ? value : (/^-?\d+$/.test(String(value)) ? Number(value) : NaN);
        if (!Number.isInteger(n) || n < min || n > max) { errors[`paginacao.${field}`] = SCHEMA_ERROR; }
        return n;
    }

    const inicio = dateTime('inicio');
    const fim = dateTime('fim');
    const paginaAtual = integer('paginaAtual', 0, Number.MAX_SAFE_INTEGER);
    const itensPorPagina = integer('itensPorPagina', 1, 1000);

    let txIdPresente: boolean = undefined;
    if (qry.txIdPresente !== undefined) {
        txIdPresente = { true: true, false: false }[String(qry.txIdPresente)];
        if (txIdPresente === undefined) { errors.txIdPresente = SCHEMA_ERROR; }
    }

    if (qry.tipoCob !== undefined && !Object.values(TipoCob).includes(qry.tipoCob)) { errors.tipoCob = SCHEMA_ERROR; }

    if (Object.keys(errors).length) {
        throw new BadRequestException(errors);
    }

    return {
        inicio,
        fim,
        ...(qry.tipoCob !== undefined ? { tipoCob: qry.tipoCob } : {}),
        ...(txIdPresente !== undefined ? { txIdPresente } : {}),
        ...((paginaAtual ?? itensPorPagina) !== undefined ? { paginacao: { paginaAtual: paginaAtual ?? 0, itensPorPagina: itensPorPagina ?? 100 } } : {}),
    };
}

@Controller("loc")
@UseInterceptors(HttpInterceptor)
export class LocationController {
    constructor(private readonly pspService: PSP) { }

    @Post()
    async create(@Body() data: LocPutRequest, @Headers() headers, @Res({ passthrough: true }) res?: Response): Promise<PayloadLocation> {
        const IdOwner = headers["IdOwner"];
        const loc = await this.pspService.addLoc({ IdOwner, ...data });
        res?.setHeader('location', `/loc/${loc.id}`);
        return toPayloadLocation(loc);
    }

    @Get(':id')
    async read(@Param() params: any, @Headers() headers): Promise<PayloadLocation> {
        const IdOwner = headers["IdOwner"];
        const id = parseLocId(params.id);
        const loc = await this.pspService.readLoc({ IdOwner, id });
        return loc && toPayloadLocation(loc);
    }

    @Get()
    async list(@Headers() headers, @Query() qry: any) {
        const IdOwner = headers["IdOwner"];
        const filter = parseLocFilter(qry);
        const res = await this.pspService.listLoc({ ...filter, IdOwner });
        return { ...res, loc: res.loc.map(toPayloadLocation) };
    }

    @Delete(':id/txid')
    async remove(@Param() params: any, @Headers() headers): Promise<Omit<PayloadLocation, 'txid'>> {
        const id = parseLocId(params.id);
        const IdOwner = headers["IdOwner"];
        await this.pspService.removeLoc({ id, IdOwner });
        const loc = await this.pspService.readLoc({ IdOwner, id });
        return loc && (({ txid, ...payload }) => payload)(toPayloadLocation(loc));
    }
}
