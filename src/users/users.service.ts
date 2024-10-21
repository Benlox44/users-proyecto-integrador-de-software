import { Injectable, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Cart } from './cart.entity';
import { Owned } from './owned.entity';
import * as jwt from 'jsonwebtoken';
import * as amqp from 'amqplib/callback_api';
import { ConfigService } from '@nestjs/config';
import * as bcryptjs from "bcryptjs";

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(Owned)
    private ownedRepository: Repository<Owned>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.listenForUserDetailsRequest();
    this.listenForPurchaseConfirmation();
  }

  private extractUserIdFromToken(token: string): number {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      const decoded: any = jwt.verify(token, secret);
      return decoded.id;
    } catch (error) {
      throw new HttpException('Token inválido', HttpStatus.UNAUTHORIZED);
    }
  }

  async addToOwned(token: string, courseId: number) {
    const userId = this.extractUserIdFromToken(token);
    const existingEntry = await this.ownedRepository.findOne({ where: { user_id: userId, course_id: courseId } });
    if (existingEntry) {
      throw new HttpException('El curso ya ha sido comprado', HttpStatus.CONFLICT);
    }

    const ownedEntry = this.ownedRepository.create({ user_id: userId, course_id: courseId });
    await this.ownedRepository.save(ownedEntry);
  }

  async getOwnedCourses(token: string) {
    const userId = this.extractUserIdFromToken(token);
    console.log(`Obteniendo cursos comprados para el usuario con ID: ${userId}`);

    const ownedCourses = await this.ownedRepository.find({ where: { user_id: userId } });

    if (!ownedCourses || ownedCourses.length === 0) {
      console.log(`No se encontraron cursos comprados para el usuario con ID: ${userId}`);
    } else {
      console.log(`Cursos comprados encontrados para el usuario con ID ${userId}:`, ownedCourses);
    }

    const courseIds = ownedCourses.map(item => item.course_id);
    return { owned: courseIds };
  }

  private listenForPurchaseConfirmation() {
    amqp.connect('amqp://localhost', (error0, connection) => {
      if (error0) {
        throw error0;
      }

      connection.createChannel((error1, channel) => {
        if (error1) {
          throw error1;
        }

        const queue = 'purchase_to_user_queue';

        channel.assertQueue(queue, { durable: true });

        channel.consume(queue, async (msg) => {
          if (msg) {
            const { userId, courseIds } = JSON.parse(msg.content.toString());
            console.log('Recibido mensaje de compra:', { userId, courseIds });

            try {
              for (const courseId of courseIds) {
                await this.ownedRepository.save({ user_id: userId, course_id: courseId });
              }

              await this.cartRepository.delete({ user_id: userId });

              console.log(`Carrito para el usuario ${userId} ha sido eliminado.`);
            } catch (error) {
              console.error('Error al guardar la compra en la base de datos:', error);
            }

            channel.ack(msg);
          }
        });
      });
    });
  }

  private listenForUserDetailsRequest() {
    amqp.connect('amqp://localhost', (error0, connection) => {
      if (error0) {
        throw error0;
      }

      connection.createChannel((error1, channel) => {
        if (error1) {
          throw error1;
        }

        const queue = 'user_details_queue';

        channel.assertQueue(queue, { durable: false });

        channel.consume(queue, async (msg) => {
          if (!msg) return;

          const { userId } = JSON.parse(msg.content.toString());

          try {
            const user = await this.userRepository.findOne({ where: { id: userId } });

            if (user) {
              const cartItems = await this.cartRepository.find({ where: { user_id: userId } });
              const courseIds = cartItems.map(item => item.course_id);

              const response = { email: user.email, name: user.name, courseIds };
              const responseQueue = msg.properties.replyTo;
              const correlationId = msg.properties.correlationId;

              channel.sendToQueue(responseQueue, Buffer.from(JSON.stringify(response)), {
                correlationId,
              });
            }
          } catch (error) {
            console.error('Error al obtener los detalles del usuario:', error);
          }

          channel.ack(msg);
        });
      });
    });
  }

  async register(name: string, email: string, password: string) {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new HttpException('El correo ya está en uso', HttpStatus.CONFLICT);
    }
    const hashPass = await bcryptjs.hash(password, 10);

    const newUser = this.userRepository.create({ name, email, password:hashPass });
    await this.userRepository.save(newUser);

    const secret = this.configService.get<string>('JWT_SECRET');
    const token = jwt.sign({ id: newUser.id }, secret, { expiresIn: '1h' });
    return { token };
  }

  async login(email: string, password: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !(await bcryptjs.compare(password, user.password))) {
      throw new HttpException('Credenciales incorrectas', HttpStatus.UNAUTHORIZED);
    }

    const secret = this.configService.get<string>('JWT_SECRET');
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: '1h' });
    console.log('Token firmado:', token);
    return { token };
  }

  async getProfile(userId: number) {
    console.log(`Intentando obtener el perfil del usuario con ID: ${userId}`);

    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });

      if (!user) {
        console.log(`Usuario con ID ${userId} no encontrado`);
        throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
      }

      console.log(`Perfil encontrado para el usuario con ID ${userId}: Nombre: ${user.name}, Email: ${user.email}`);

      return {
        name: user.name,
        email: user.email,
      };
    } catch (error) {
      console.error(`Error al obtener el perfil del usuario con ID ${userId}:`, error.message);
      throw error;
    }
  }

  async updateProfile(userId: number, newName: string, newEmail: string, password: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
    }

    if (newEmail !== user.email) {
      const emailInUse = await this.userRepository.findOne({ where: { email: newEmail } });
      if (emailInUse) {
        throw new HttpException('El correo ya está en uso', HttpStatus.CONFLICT);
      }
    }

    user.name = newName;
    user.email = newEmail;
    if (password) {
      user.password = password;
    }

    await this.userRepository.save(user);
    return {
      name: user.name,
      email: user.email,
    };
  }

  async addToCart(userId: number, courseId: number) {
    try {
      console.log(`Añadiendo curso con ID ${courseId} al carrito del usuario ${userId}`);

      // Verificar si el curso ya ha sido comprado
      const ownedCourse = await this.ownedRepository.findOne({ where: { user_id: userId, course_id: courseId } });
      if (ownedCourse) {
        throw new HttpException('El curso ya está en tu posesión', HttpStatus.CONFLICT);
      }

      // Verificar si el curso ya está en el carrito
      const existingCartEntry = await this.cartRepository.findOne({ where: { user_id: userId, course_id: courseId } });
      if (existingCartEntry) {
        throw new HttpException('El curso ya está en el carrito', HttpStatus.CONFLICT);
      }

      const cartEntry = this.cartRepository.create({ user_id: userId, course_id: courseId });
      await this.cartRepository.save(cartEntry);
      console.log('Curso añadido al carrito correctamente.');
    } catch (error) {
      console.error('Error al añadir curso al carrito:', error);
      throw error instanceof HttpException ? error : new HttpException('Error al añadir curso al carrito', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }  

  async removeFromCart(token: string, courseId: number) {
    const userId = this.extractUserIdFromToken(token);
    console.log(`Intentando eliminar el curso con ID ${courseId} del carrito del usuario con ID ${userId}`);
  
    const existingEntry = await this.cartRepository.findOne({ where: { user_id: userId, course_id: courseId } });
    
    if (!existingEntry) {
      console.log(`Curso con ID ${courseId} no encontrado en el carrito del usuario con ID ${userId}`);
      throw new HttpException('El curso no está en el carrito', HttpStatus.NOT_FOUND);
    }
  
    try {
      await this.cartRepository.delete({ user_id: userId, course_id: courseId });
      console.log(`Curso con ID ${courseId} eliminado del carrito del usuario con ID ${userId} con éxito.`);
    } catch (error) {
      console.error(`Error al eliminar el curso con ID ${courseId} del carrito del usuario con ID ${userId}:`, error);
      throw new HttpException('Error al eliminar el curso del carrito', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }  

  async getCart(userId: number) {
    console.log(`Obteniendo carrito para el usuario con ID: ${userId}`);
    try {
      const cartItems = await this.cartRepository.find({ where: { user_id: userId } });
      console.log(`Items en el carrito del usuario ${userId}:`, cartItems);
  
      if (!cartItems) {
        throw new HttpException('No se encontraron items en el carrito', HttpStatus.NOT_FOUND);
      }
  
      const courseIds = cartItems.map(item => item.course_id);
      const courseDetails = await this.requestCourseDetails(courseIds);
      return { cart: courseDetails };
    } catch (error) {
      console.error('Error al obtener el carrito del usuario:', error);
      throw new HttpException('Error al obtener el carrito', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }  

  private async requestCourseDetails(courseIds: number[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      amqp.connect('amqp://localhost', (error0, connection) => {
        if (error0) {
          reject(error0);
          return;
        }

        connection.createChannel((error1, channel) => {
          if (error1) {
            reject(error1);
            return;
          }

          const queue = 'course_queue';
          const correlationId = this.generateUuid();

          channel.assertQueue('', { exclusive: true }, (error2, q) => {
            if (error2) {
              reject(error2);
              return;
            }

            channel.consume(
              q.queue,
              (msg) => {
                if (msg.properties.correlationId === correlationId) {
                  const courses = JSON.parse(msg.content.toString());
                  resolve(courses);
                  setTimeout(() => {
                    connection.close();
                  }, 500);
                }
              },
              { noAck: true },
            );

            channel.sendToQueue(queue, Buffer.from(JSON.stringify({ courseIds })), {
              correlationId,
              replyTo: q.queue,
            });
          });
        });
      });
    });
  }

  private generateUuid() {
    return Math.random().toString() + Math.random().toString() + Math.random().toString();
  }

  async syncCart(token: string, courses: { id: number }[]) {
    const userId = this.extractUserIdFromToken(token);
    for (const course of courses) {
      const existingEntry = await this.cartRepository.findOne({ where: { user_id: userId, course_id: course.id } });
      if (!existingEntry) {
        const cartEntry = this.cartRepository.create({ user_id: userId, course_id: course.id });
        await this.cartRepository.save(cartEntry);
      }
    }
    return { message: 'Carrito sincronizado correctamente' };
  }
}
