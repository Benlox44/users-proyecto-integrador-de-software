import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity()
export class Cart {
  @PrimaryColumn()
  user_id: number;

  @PrimaryColumn()
  course_id: number;
}
