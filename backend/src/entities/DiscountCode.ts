import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

@Entity('discount_codes')
export class DiscountCode {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: DiscountType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  min_order_value?: number;

  @Column({ type: 'int', nullable: true })
  max_uses?: number;

  @Column({ type: 'int', default: 0 })
  times_used!: number;

  @Column({ type: 'timestamp', nullable: true })
  valid_from?: Date;

  @Column({ type: 'timestamp', nullable: true })
  valid_until?: Date;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
