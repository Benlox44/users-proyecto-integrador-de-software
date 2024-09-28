import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      console.error('No se proporcionó el token');
      throw new HttpException('No se proporcionó el token', HttpStatus.UNAUTHORIZED);
    }
  
    try {
      const payload = this.jwtService.verify(token, { secret: 'your_secret_key' });
      request['user'] = payload;
    } catch (error) {
      console.error('Error al verificar el token en AuthGuard:', error);
      throw new HttpException('Token inválido o expirado', HttpStatus.UNAUTHORIZED);
    }
  
    return true;
  }  

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }  
}
