import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Habilitar CORS con configuración específica
  app.enableCors({
    origin: 'http://localhost:3000',  // Permitir este origen
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,  // Si necesitas enviar cookies o autenticación
  });

  await app.listen(3001);
}
bootstrap();
