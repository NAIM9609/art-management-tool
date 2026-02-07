import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, JoinColumn } from 'typeorm';
import { EnhancedProduct } from './EnhancedProduct';

@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  product_id!: number;

  @ManyToOne(() => EnhancedProduct, (product) => product.variants)
  @JoinColumn({ name: 'product_id' })
  product!: EnhancedProduct;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  attributes?: Record<string, any>;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price_adjustment!: number;

  @Column({ type: 'int', default: 0 })
  stock!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;

  getPrice(basePrice: number): number {
    return basePrice + parseFloat(this.price_adjustment.toString());
  }
}
