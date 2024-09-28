import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      console.error('No se proporcionó el token');
      throw new HttpException('No se proporcionó el token', HttpStatus.UNAUTHORIZED);
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      console.log('JWT_SECRET utilizado para verificar:', secret);
      const payload = this.jwtService.verify(token, { secret });
      request['user'] = payload;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        console.error('Error al verificar el token: sesión expirada');
        throw new HttpException('Sesión expirada, por favor inicie sesión nuevamente', HttpStatus.UNAUTHORIZED);
      } else {
        console.error('Error al verificar el token en AuthGuard:', error);
        throw new HttpException('Token inválido o expirado', HttpStatus.UNAUTHORIZED);
      }
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
