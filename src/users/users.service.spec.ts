import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Cart } from './cart.entity';
import * as jwt from 'jsonwebtoken';
import * as amqp from 'amqplib/callback_api';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Cart)
    private cartRepository: Repository<Cart>,
  ) {}

  async onModuleInit() {
    this.listenToUserQueue();
  }

  listenToUserQueue() {
    amqp.connect('amqp://localhost', (error0, connection) => {
      if (error0) {
        throw error0;
      }

      connection.createChannel((error1, channel) => {
        if (error1) {
          throw error1;
        }

        const queue = 'user_info_queue';

        channel.assertQueue(queue, { durable: false });

        channel.consume(queue, async (msg) => {
          if (msg) {
            const { userId } = JSON.parse(msg.content.toString());
            const user = await this.userRepository.findOne(userId);
            if (user) {
              const response = {
                email: user.email,
                name: user.name,
              };

              const responseQueue = `response_user_info_${userId}`;
              channel.assertQueue(responseQueue, { durable: false });
              channel.sendToQueue(responseQueue, Buffer.from(JSON.stringify(response)));
            }
          }
        }, { noAck: true });
      });
    });
  }

  async register(name: string, email: string, password: string, cart: any[] = []) {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('El correo ya está en uso');
    }
  
    const newUser = this.userRepository.create({ name, email, password });
    await this.userRepository.save(newUser);
  
    // Sincronizar carrito local
    if (cart && cart.length > 0) {
      for (const item of cart) {
        const cartEntry = this.cartRepository.create({ user_id: newUser.id, course_id: item.id });
        await this.cartRepository.save(cartEntry);
      }
    }
  
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
      throw new Error('El curso ya está en el carrito');
    }

    const cartEntry = this.cartRepository.create({ user_id: userId, course_id: courseId });
    await this.cartRepository.save(cartEntry);
  }

  async removeFromCart(userId: number, courseId: number) {
    await this.cartRepository.delete({ user_id: userId, course_id: courseId });
  }

  async getCart(userId: number) {
    const cartItems = await this.cartRepository.find({ where: { user_id: userId } });

    // Aquí simulas la consulta al microservicio de cursos por medio de RabbitMQ
    const courseIds = cartItems.map(item => item.course_id);
    return courseIds; // Aquí devuelves solo los IDs de los cursos; el frontend pedirá más detalles después.
  }

  async syncCart(userId: number, courses: { id: number }[]) {
    for (const course of courses) {
      const existingEntry = await this.cartRepository.findOne({ where: { user_id: userId, course_id: course.id } });
      if (!existingEntry) {
        const cartEntry = this.cartRepository.create({ user_id: userId, course_id: course.id });
        await this.cartRepository.save(cartEntry);
      }
    }
  }
}
