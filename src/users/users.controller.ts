import { Controller, Post, Body, Get, Param, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('login')
  async login(@Body() body) {
    try {
      const { email, password } = body;
      return await this.usersService.login(email, password);
    } catch (error) {
      throw new HttpException('Credenciales incorrectas', HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('register')
  async register(@Body() body) {
    return this.usersService.register(body.name, body.email, body.password);
  }

  @Post('add-to-cart')
  async addToCart(@Body() body) {
    return this.usersService.addToCart(body.userId, body.courseId);
  }

  @Post('remove-from-cart')
  async removeFromCart(@Body() body) {
    return this.usersService.removeFromCart(body.userId, body.courseId);
  }

  @Get('cart/:userId')
  async getCart(@Param('userId') userId: number) {
    return this.usersService.getCart(userId);
  }

  @Post('sync-cart')
  async syncCart(@Body() body) {
    return this.usersService.syncCart(body.userId, body.courses);
  }

  @Post('add-to-owned')
  async addToOwned(@Body() body) {
    return this.usersService.addToOwned(body.userId, body.courseId);
  }

  @Get('owned/:userId')
  async getOwnedCourses(@Param('userId') userId: number) {
    return this.usersService.getOwnedCourses(userId);
  }
}
