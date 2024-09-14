import { Injectable, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Cart } from './cart.entity';
import { Owned } from './owned.entity';
import * as jwt from 'jsonwebtoken';
import * as amqp from 'amqplib/callback_api';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
    @InjectRepository(Owned)
    private ownedRepository: Repository<Owned>,
  ) {}

  async onModuleInit() {
    this.listenForUserDetailsRequest();
    this.listenForPurchaseConfirmation();
  }

  async addToOwned(userId: number, courseId: number) {
    const existingEntry = await this.ownedRepository.findOne({ where: { user_id: userId, course_id: courseId } });
    if (existingEntry) {
      throw new HttpException('El curso ya ha sido comprado', HttpStatus.CONFLICT);
    }

    const ownedEntry = this.ownedRepository.create({ user_id: userId, course_id: courseId });
    await this.ownedRepository.save(ownedEntry);
  }

  async getOwnedCourses(userId: number) {
    const ownedCourses = await this.ownedRepository.find({ where: { user_id: userId } });
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

    const newUser = this.userRepository.create({ name, email, password });
    await this.userRepository.save(newUser);

    const token = jwt.sign({ id: newUser.id }, 'your_secret_key', { expiresIn: '1h' });
    return { token, id: newUser.id, email: newUser.email, name: newUser.name };
  }

  async login(email: string, password: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || user.password !== password) {
      throw new Error('Credenciales incorrectas');
    }

    const token = jwt.sign({ id: user.id }, 'your_secret_key', { expiresIn: '1h' });
    return { token, id: user.id, email: user.email, name: user.name };
  }

  async addToCart(userId: number, courseId: number) {
    const existingEntry = await this.cartRepository.findOne({ where: { user_id: userId, course_id: courseId } });
    if (existingEntry) {
      throw new HttpException('El curso ya está en el carrito', HttpStatus.CONFLICT);
    }

    const cartEntry = this.cartRepository.create({ user_id: userId, course_id: courseId });
    await this.cartRepository.save(cartEntry);
  }

  async removeFromCart(userId: number, courseId: number) {
    await this.cartRepository.delete({ user_id: userId, course_id: courseId });
  }

  async getCart(userId: number) {
    const cartItems = await this.cartRepository.find({ where: { user_id: userId } });
    const courseIds = cartItems.map(item => item.course_id);

    const courseDetails = await this.requestCourseDetails(courseIds);
    return { cart: courseDetails };
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

  async syncCart(userId: number, courses: { id: number }[]) {
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
