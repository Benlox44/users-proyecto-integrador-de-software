import { Controller, Post, Body, Get, Request, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '../auth/auth.guard'; // Importa el AuthGuard

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

  @UseGuards(AuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    const userId = req.user.id;
    
    console.log(`Solicitud recibida para obtener el perfil del usuario con ID: ${userId}`);
    
    try {
      const userProfile = await this.usersService.getProfile(userId);
      console.log(`Perfil del usuario con ID ${userId} enviado correctamente.`);
      return userProfile;
    } catch (error) {
      console.error(`Error en el controlador al obtener el perfil del usuario con ID ${userId}:`, error.message);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(AuthGuard)
  @Post('updateProfile')
  async updateProfile(@Request() req, @Body() body) {
    const userId = req.user.id;
    const { name, newEmail, password } = body;
    return this.usersService.updateProfile(userId, name, newEmail, password);
  }

  @UseGuards(AuthGuard)
  @Post('add-to-cart')
  async addToCart(@Request() req, @Body() body) {
    const userId = req.user.id;
    return this.usersService.addToCart(userId, body.courseId);
  }

  @UseGuards(AuthGuard)
@Post('remove-from-cart')
async removeFromCart(@Request() req, @Body() body) {
  const userId = req.user.id;
  console.log(`Solicitud de eliminación para el carrito del usuario ${userId} y curso ${body.courseId}`);
  try {
    return await this.usersService.removeFromCart(req.headers.authorization.split(' ')[1], body.courseId);
  } catch (error) {
    console.error(`Error en la solicitud de eliminación para el carrito del usuario ${userId}:`, error.message);
    throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

  @UseGuards(AuthGuard)
  @Get('cart')
  async getCart(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getCart(userId);
  }

  @UseGuards(AuthGuard)
  @Post('sync-cart')
  async syncCart(@Request() req, @Body() body) {
    const userId = req.user.id;
    return this.usersService.syncCart(userId, body.courses);
  }

  @UseGuards(AuthGuard)
  @Post('add-to-owned')
  async addToOwned(@Request() req, @Body() body) {
    const userId = req.user.id;
    return this.usersService.addToOwned(userId, body.courseId);
  }

  @UseGuards(AuthGuard)
  @Get('owned')
  async getOwnedCourses(@Request() req) {
    const userId = req.user.id;

    console.log(`Solicitud para obtener cursos comprados del usuario ${userId}`);
    
    try {
      const ownedCourses = await this.usersService.getOwnedCourses(req.headers.authorization.split(' ')[1]);
      console.log(`Cursos comprados para el usuario ${userId}:`, ownedCourses);
      return ownedCourses;
    } catch (error) {
      console.error(`Error al obtener los cursos comprados para el usuario ${userId}:`, error.message);
      throw new HttpException(error.message, error.status || HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
