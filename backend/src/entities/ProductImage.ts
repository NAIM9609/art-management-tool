import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { EnhancedProduct } from './EnhancedProduct';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  product_id!: number;

  @ManyToOne(() => EnhancedProduct, (product) => product.images)
  @JoinColumn({ name: 'product_id' })
  product!: EnhancedProduct;

  @Column({ type: 'varchar', length: 1000 })
  url!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  alt_text?: string;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn()
  created_at!: Date;
}
