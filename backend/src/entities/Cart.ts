import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CartItem } from './CartItem';

@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'session_token', type: 'varchar', length: 255, unique: true })
  session_id!: string;

  @Column({ type: 'int', nullable: true })
  user_id?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  discount_code?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount_amount!: number;

  @Column({ type: 'timestamp', nullable: true })
  expires_at?: Date;

  @OneToMany(() => CartItem, (item) => item.cart)
  items!: CartItem[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
