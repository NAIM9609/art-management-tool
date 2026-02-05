import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('etsy_oauth_tokens')
export class EtsyOAuthToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  shop_id!: string;

  @Column({ type: 'text' })
  access_token!: string;

  @Column({ type: 'text' })
  refresh_token!: string;

  @Column({ type: 'varchar', length: 50, default: 'Bearer' })
  token_type!: string;

  @Column({ type: 'timestamp' })
  expires_at!: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  scope?: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  isExpired(): boolean {
    const fiveMinutesFromNow = new Date();
    fiveMinutesFromNow.setMinutes(fiveMinutesFromNow.getMinutes() + 5);
    return fiveMinutesFromNow > this.expires_at;
  }
}
