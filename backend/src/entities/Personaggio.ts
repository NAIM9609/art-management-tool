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

  @Column({ type: 'varchar', length: 50, default: '#E0E7FF' })
  backgroundColor!: string;

  @Column({ type: 'varchar', length: 20, default: 'solid' })
  backgroundType!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  gradientFrom?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  gradientTo?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  backgroundImage?: string;

  @Column({ type: 'int', default: 0 })
  order!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
