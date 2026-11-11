import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumberString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DadosPessoa, TipoConta, Vencimento } from '../models';
import {
  IsCNPJValid,
  IsCPFValid,
  IsIDRec,
  MinStringNumber,
} from '../../../validators/custom-validators';
import { PoliticaRetentativa } from './rec';

const SCHEMA_ERROR = 'O campo $$ não respeita o schema.';
const OBJECT_SCHEMA_ERROR = 'O objeto $$ não respeita o schema.';

export enum StatusCobR {
  Criada = 'CRIADA',
  Ativa = 'ATIVA',
  Concluida = 'CONCLUIDA',
  Expirada = 'EXPIRADA',
  Rejeitada = 'REJEITADA',
  Cancelada = 'CANCELADA',
}

export enum TipoTentativa {
  Agendada = 'AGND',
  NaoAgendada = 'NTAG',
  RetentativaIntradia = 'RIFL',
}

export enum StatusTentativa {
  Solicitada = 'SOLICITADA',
  Agendada = 'AGENDADA',
  Paga = 'PAGA',
  Cancelada = 'CANCELADA',
  Rejeitada = 'REJEITADA',
  Expirada = 'EXPIRADA',
}

/** 	
Todos os campos que indicam valores monetários obedecem ao pattern \d{1,10}.\d{2}. O separador decimal é o caractere ponto. Não é aplicável utilizar separador de milhar. Exemplos de valores aderentes ao padrão: “1.00”, “123.99”, “123456789.23" */
export class CobRValor {
  @IsNotEmpty({ message: SCHEMA_ERROR })
  @IsNumberString({}, { message: SCHEMA_ERROR })
  @MinStringNumber(0.01, { message: 'O campo $$ é zero.' })
  original: string;
}

export class CobRRecebedor {
  @IsDefined({ message: SCHEMA_ERROR })
  @IsNotEmpty({ message: SCHEMA_ERROR })
  @MaxLength(20, { message: SCHEMA_ERROR })
  conta: string;
  @IsDefined({ message: SCHEMA_ERROR })
  @IsEnum(TipoConta, { message: SCHEMA_ERROR })
  tipoConta: TipoConta;
  @MaxLength(4, { message: SCHEMA_ERROR })
  agencia?: string;
}

export class CobRPutRequest {
  @IsDefined({ message: SCHEMA_ERROR })
  @Length(29, 29, { message: SCHEMA_ERROR })
  @IsIDRec({ message: SCHEMA_ERROR })
  idRec: string;

  @MaxLength(140, { message: SCHEMA_ERROR })
  infoAdicional?: string;

  @IsDefined({ message: OBJECT_SCHEMA_ERROR })
  @IsNotEmptyObject({ nullable: false }, { message: OBJECT_SCHEMA_ERROR })
  @ValidateNested({ message: OBJECT_SCHEMA_ERROR })
  @Type(() => Vencimento)
  calendario: Vencimento;

  @IsDefined({ message: OBJECT_SCHEMA_ERROR })
  @IsNotEmptyObject({ nullable: false }, { message: OBJECT_SCHEMA_ERROR })
  @ValidateNested({ message: OBJECT_SCHEMA_ERROR })
  @Type(() => CobRValor)
  valor: CobRValor;

  @IsBoolean({ message: SCHEMA_ERROR })
  ajusteDiaUtil?: boolean;

  @IsDefined({ message: OBJECT_SCHEMA_ERROR })
  @IsNotEmptyObject({ nullable: false }, { message: OBJECT_SCHEMA_ERROR })
  @ValidateNested({ message: OBJECT_SCHEMA_ERROR })
  @Type(() => CobRRecebedor)
  recebedor: CobRRecebedor;

  @ValidateNested({ message: OBJECT_SCHEMA_ERROR })
  @Type(() => DadosPessoa)
  devedor?: DadosPessoa;

  tributo?: any;
}

export class CobRPatchRequest {
  @IsIn([StatusCobR.Cancelada], { message: SCHEMA_ERROR })
  status?: StatusCobR.Cancelada;
}

export interface ICobRAtualizacao {
  status: StatusCobR;
  data: string;
}

export interface ICobRTentativa {
  dataLiquidacao: string;
  tipo: TipoTentativa;
  status: StatusTentativa;
  endToEndId: string;
  atualizacao: { status: StatusTentativa; data: string }[];
}

export class CobRGetResponse {
  idRec: string;
  txid: string;
  infoAdicional?: string;
  calendario: { criacao: string; dataDeVencimento: string };
  valor: CobRValor;
  ajusteDiaUtil: boolean;
  recebedor: CobRRecebedor;
  devedor?: DadosPessoa;
  tributo?: any;
  status: StatusCobR;
  politicaRetentativa: PoliticaRetentativa;
  atualizacao: ICobRAtualizacao[];
  tentativas?: ICobRTentativa[];
  encerramento?: {
    cancelamento?: { solicitante: string; codigo: string; descricao: string };
  };
}

export class CobRPutResponse extends CobRGetResponse {}

export class CobRPatchResponse extends CobRGetResponse {}

export class CobRGetFilter {
  @IsDefined({ message: SCHEMA_ERROR })
  @IsDateString({}, { message: SCHEMA_ERROR })
  inicio: string;
  @IsDefined({ message: SCHEMA_ERROR })
  @IsDateString({}, { message: SCHEMA_ERROR })
  fim: string;
  idRec?: string;
  @IsCPFValid({ message: SCHEMA_ERROR })
  cpf?: string;
  @IsCNPJValid({ message: SCHEMA_ERROR })
  cnpj?: string;
  status?: string;
  convenio?: string;
  paginacao?: { paginaAtual: number; itensPorPagina: number };
}

export interface ICobRQueryResponse {
  parametros: {
    inicio: string;
    fim: string;
    idRec?: string;
    cpf?: string;
    cnpj?: string;
    status?: string;
    paginacao: {
      paginaAtual: number;
      itensPorPagina: number;
      quantidadeDePaginas: number;
      quantidadeTotalDeItens: number;
    };
  };
  cobsr: CobRGetResponse[];
}
