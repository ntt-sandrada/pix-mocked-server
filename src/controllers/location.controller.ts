import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Query, Res, UseInterceptors } from "@nestjs/common";
import { Response } from "express";
import { LocGetResponse, LocGetFilter, LocPutRequest } from "../../src/core/app/models/loc";
import { PSP } from "../../src/core/app/psp";
import { HttpInterceptor } from "../../src/http.interceptor";

const parseLocId = (value: any): number => {
    const id = /^[1-9][0-9]*$/.test(String(value ?? '')) ? Number(value) : NaN;
    if (!Number.isSafeInteger(id)) {
        throw new BadRequestException({ id: 'O campo $$ não respeita o schema.' });
    }
    return id;
}

@Controller("loc")
@UseInterceptors(HttpInterceptor)
export class LocationController {
    constructor(private readonly pspService: PSP) { }

    @Post()
    async create(@Body() data: LocPutRequest, @Headers() headers, @Res({ passthrough: true }) res?: Response): Promise<LocGetResponse> {
        const IdOwner = headers["IdOwner"];
        const loc = await this.pspService.addLoc({ IdOwner, ...data });
        res?.setHeader('location', `/loc/${loc.id}`);
        return loc;
    }

    @Get(':id')
    async read(@Param() params: any, @Headers() headers): Promise<LocGetResponse> {
        const IdOwner = headers["IdOwner"];
        const id = parseLocId(params.id);
        const res = await this.pspService.readLoc({ IdOwner, id });
        return res;
    }

    @Get()
    list(@Headers() headers, @Query() qry: LocGetFilter) {
        const IdOwner = headers["IdOwner"];
        return this.pspService.listLoc({ ...qry, IdOwner });
    }

    @Delete(':id/txid')
    async remove(@Param() params: any, @Headers() headers): Promise<any> {
        const id = parseLocId(params.id);
        const IdOwner = headers["IdOwner"];
        return await this.pspService.removeLoc({ id, IdOwner })
    }
}
