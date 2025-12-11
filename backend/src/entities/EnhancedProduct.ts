import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { ProductVariant } from './ProductVariant';
import { ProductImage } from './ProductImage';
import { Category } from './Category';

export enum ProductStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

@Entity('products')
export class EnhancedProduct {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  short_description?: string;

  @Column({ type: 'text', nullable: true })
  long_description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  base_price!: number;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency!: string;

  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  sku?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  gtin?: string;

  @Column({ type: 'varchar', length: 20, default: ProductStatus.DRAFT })
  status!: ProductStatus;

  @Column({ type: 'int', nullable: true })
  character_id?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  character_value?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  etsy_link?: string;

  @ManyToMany(() => Category, (category) => category.products)
  @JoinTable({ name: 'product_categories' })
  categories!: Category[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images!: ProductImage[];

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
