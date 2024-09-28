import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { Cart } from './cart.entity';
import { Owned } from './owned.entity';
import { AuthModule } from '../auth/auth.module'; // Importa el módulo de autenticación

@Module({
  imports: [TypeOrmModule.forFeature([User, Cart, Owned]), AuthModule],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
