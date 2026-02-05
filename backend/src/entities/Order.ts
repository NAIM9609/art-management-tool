import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { OrderItem } from './OrderItem';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum FulfillmentStatus {
  UNFULFILLED = 'unfulfilled',
  FULFILLED = 'fulfilled',
  PARTIALLY_FULFILLED = 'partially_fulfilled',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  order_number!: string;

  @Column({ type: 'int', nullable: true })
  user_id?: number;

  @Column({ type: 'varchar', length: 255 })
  customer_email!: string;

  @Column({ type: 'varchar', length: 255 })
  customer_name!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  tax!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total!: number;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency!: string;

  @Column({ type: 'varchar', length: 20, default: PaymentStatus.PENDING })
  payment_status!: PaymentStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_intent_id?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  payment_method?: string;

  @Column({ type: 'varchar', length: 20, default: FulfillmentStatus.UNFULFILLED })
  fulfillment_status!: FulfillmentStatus;

  @Column({ type: 'jsonb', nullable: true })
  shipping_address?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  billing_address?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
