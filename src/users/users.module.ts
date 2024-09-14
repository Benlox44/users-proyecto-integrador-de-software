import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { Cart } from './cart.entity';
import { Owned } from './owned.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Cart, Owned])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
