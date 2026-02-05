import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, JoinColumn } from 'typeorm';
import { Order } from './Order';

@Entity('etsy_receipts')
export class EtsyReceipt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'bigint', unique: true })
  etsy_receipt_id!: number;

  @Column({ type: 'int', nullable: true })
  local_order_id?: number;

  @ManyToOne(() => Order, { nullable: true })
  @JoinColumn({ name: 'local_order_id' })
  local_order?: Order;

  @Column({ type: 'varchar', length: 100 })
  shop_id!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buyer_email?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  buyer_name?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status?: string;

  @Column({ type: 'boolean', default: false })
  is_paid!: boolean;

  @Column({ type: 'boolean', default: false })
  is_shipped!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  grand_total?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  subtotal?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_shipping_cost?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total_tax_cost?: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  payment_method?: string;

  @Column({ type: 'text', nullable: true })
  shipping_address?: string;

  @Column({ type: 'text', nullable: true })
  message_from_buyer?: string;

  @Column({ type: 'timestamp' })
  etsy_created_at!: Date;

  @Column({ type: 'timestamp' })
  etsy_updated_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_synced_at?: Date;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  sync_status!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
