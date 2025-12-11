import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, JoinColumn } from 'typeorm';
import { EnhancedProduct } from './EnhancedProduct';

@Entity('etsy_products')
export class EtsyProduct {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'bigint', unique: true })
  etsy_listing_id!: number;

  @Column({ type: 'int', nullable: true })
  local_product_id?: number;

  @ManyToOne(() => EnhancedProduct, { nullable: true })
  @JoinColumn({ name: 'local_product_id' })
  local_product?: EnhancedProduct;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column({ type: 'int', default: 0 })
  quantity!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sku?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  state?: string;

  @Column({ type: 'text', nullable: true })
  url?: string;

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
