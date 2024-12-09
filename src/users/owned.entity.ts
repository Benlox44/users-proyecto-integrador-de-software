import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class Owned {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  course_id: number;

  @Column()
  order_id: number;

  @Column('float')
  price: number;

}
