import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

@Entity('personaggi')
export class Personaggio {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  icon?: string;

  @Column({ type: 'json', nullable: true })
  images?: string[];

  @Column({ name: 'background_color', type: 'varchar', length: 50, default: '#E0E7FF' })
  backgroundColor!: string;

  @Column({ name: 'background_type', type: 'varchar', length: 20, default: 'solid' })
  backgroundType!: string;

  @Column({ name: 'gradient_from', type: 'varchar', length: 50, nullable: true })
  gradientFrom?: string;

  @Column({ name: 'gradient_to', type: 'varchar', length: 50, nullable: true })
  gradientTo?: string;

  @Column({ name: 'background_image', type: 'varchar', length: 500, nullable: true })
  backgroundImage?: string;

  @Column({ type: 'int', default: 0 })
  order!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
