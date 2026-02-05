import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { ProductVariant } from './ProductVariant';

@Entity('etsy_inventory_sync_log')
export class EtsyInventorySyncLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'bigint' })
  etsy_listing_id!: number;

  @Column({ type: 'int', nullable: true })
  local_variant_id?: number;

  @ManyToOne(() => ProductVariant, { nullable: true })
  @JoinColumn({ name: 'local_variant_id' })
  local_variant?: ProductVariant;

  @Column({ type: 'int' })
  etsy_quantity!: number;

  @Column({ type: 'int' })
  local_quantity!: number;

  @Column({ type: 'int' })
  quantity_diff!: number;

  @Column({ type: 'varchar', length: 50 })
  sync_action!: string;

  @Column({ type: 'varchar', length: 50 })
  sync_result!: string;

  @Column({ type: 'text', nullable: true })
  error_message?: string;

  @CreateDateColumn()
  synced_at!: Date;
}
