import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { Cart } from './cart.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Cart])],  // <-- Aquí registras las entidades
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
