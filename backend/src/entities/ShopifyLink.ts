import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity('shopify_links')
export class ShopifyLink {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  local_product_id!: number;

  @Column({ type: 'bigint', unique: true })
  shopify_product_id!: number;

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
