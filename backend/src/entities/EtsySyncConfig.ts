import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('etsy_sync_config')
export class EtsySyncConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  shop_id!: string;

  @Column({ type: 'timestamp', nullable: true })
  last_product_sync?: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_inventory_sync?: Date;

  @Column({ type: 'varchar', length: 50, default: 'idle' })
  sync_status!: string;

  @Column({ type: 'text', nullable: true })
  sync_error?: string;

  @Column({ type: 'int', default: 10000 })
  rate_limit_remaining!: number;

  @Column({ type: 'timestamp', nullable: true })
  rate_limit_reset_at?: Date;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  isRateLimited(): boolean {
    if (!this.rate_limit_reset_at) return false;
    return this.rate_limit_remaining <= 0 && new Date() < this.rate_limit_reset_at;
  }

  updateRateLimit(remaining: number, resetAt: Date): void {
    this.rate_limit_remaining = remaining;
    this.rate_limit_reset_at = resetAt;
  }

  markSyncStarted(syncType: string): void {
    this.sync_status = 'in_progress';
    this.sync_error = '';
    const now = new Date();
    if (syncType === 'product') {
      this.last_product_sync = now;
    } else if (syncType === 'inventory') {
      this.last_inventory_sync = now;
    }
  }

  markSyncCompleted(): void {
    this.sync_status = 'completed';
    this.sync_error = '';
  }

  markSyncError(error: string): void {
    this.sync_status = 'error';
    this.sync_error = error;
  }
}
