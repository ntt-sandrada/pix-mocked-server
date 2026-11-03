import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MemoryDB } from './libs/fakedb';
import {correntistas} from './data/db.json'
import { AuthModule } from './auth.module';
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { swaggerAppConfig } from './swagger-app.config';
import { swaggerAuthConfig } from './swagger-auth.config';

const errorFormatter = (errors: ValidationError[], message: { [field: string]: string } = {}, parentField?: string) => {
  errors.forEach((error) => {
    const field = parentField ? `${parentField}.${error.property}` : error.property;
    if (!error.constraints && error.children?.length) {
      errorFormatter(error.children, message, field);
    } else {
      message[field] = Object.values(error.constraints || {}).pop() || 'Invalid Value!';
    }
  });
  return message;
}

async function bootstrap() {
  
  
  MemoryDB.create("COB", ['txid']);
  MemoryDB.create("COB_HIST", ['id']);
  MemoryDB.create("COBV", ['txid']);
  MemoryDB.create("COBR", ['txid']);
  MemoryDB.create("LOCATIONS", ['id', 'uuid']);
  MemoryDB.create("LOC_COB", ['id', 'txid']);
  MemoryDB.create("REC", ['idRec']);

  const ServerErrorTypes = {
    400: { type: "https://pix.bcb.gov.br/api/v2/error/CobOperacaoInvalida", title: "Payload inválido" },
    403: { type: "https://pix.bcb.gov.br/api/v2/error/AcessoNegado", title: "Acesso Negado" },
    404: { type: "https://pix.bcb.gov.br/api/v2/error/NaoEncontrado", title: "Não Encontrado" },
    503: { type: "https://pix.bcb.gov.br/api/v2/error/ServicoIndisponivel", title: "Serviço não está disponível no momento. Serviço solicitado pode estar em manutenção ou fora da janela de funcionamento." },
}


  const corr =  MemoryDB.create("CORRENTISTAS", ['chave']);
    await Promise.all(correntistas.map(async (c) => {
      await corr.add('DEV', c)
    }));
  
  //SERVIÇO PRINCIPAL  
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    disableErrorMessages: false,
    transform: true,
    skipMissingProperties: true,
    exceptionFactory: (errors) => { throw new BadRequestException(errorFormatter(errors)) }
  }));
  
  const appDocument = SwaggerModule.createDocument(app, swaggerAppConfig);
  SwaggerModule.setup('api-docs', app, appDocument);
  
  await app.listen(3000);

  //SERVIÇO DE AUTENTICAÇÃO
  const auth = await NestFactory.create(AuthModule);
  
  const authDocument = SwaggerModule.createDocument(auth, swaggerAuthConfig);
  SwaggerModule.setup('api-docs', auth, authDocument);
  
  await auth.listen(3001);
}
bootstrap();
