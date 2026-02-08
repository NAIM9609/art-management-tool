// Export all repositories
export { ProductRepository } from './ProductRepository';
export type { Product, ProductImage, ProductVariant, Category, ProductFilters } from './ProductRepository';

export { ProductImageRepository } from './ProductImageRepository';
export type { ProductImage as ProductImageType } from './ProductImageRepository';

export { ProductVariantRepository } from './ProductVariantRepository';
export type { ProductVariant as ProductVariantType } from './ProductVariantRepository';

export { CategoryRepository } from './CategoryRepository';
export type { Category as CategoryType } from './CategoryRepository';

export { OrderRepository, OrderItemRepository } from './OrderRepository';
export type { Order, OrderItem, OrderFilters } from './OrderRepository';
export { PaymentStatus, FulfillmentStatus } from './OrderRepository';

export { CartRepository, CartItemRepository } from './CartRepository';
export type { Cart, CartItem } from './CartRepository';

export { PersonaggioRepository } from './PersonaggioRepository';
export type { Personaggio } from './PersonaggioRepository';

export { FumettoRepository } from './FumettoRepository';
export type { Fumetto } from './FumettoRepository';

export { DiscountCodeRepository, DiscountType } from './DiscountCodeRepository';
export type { DiscountCode } from './DiscountCodeRepository';

export { NotificationRepository, NotificationType } from './NotificationRepository';
export type { Notification } from './NotificationRepository';

export { AuditLogRepository } from './AuditLogRepository';
export type { AuditLog } from './AuditLogRepository';

export { ShopifyLinkRepository } from './ShopifyLinkRepository';
export type { ShopifyLink } from './ShopifyLinkRepository';

export { 
  EtsyOAuthTokenRepository,
  EtsySyncConfigRepository,
  EtsyProductRepository,
  EtsyReceiptRepository,
  EtsyInventorySyncLogRepository,
} from './EtsyRepository';
export type { 
  EtsyOAuthToken,
  EtsySyncConfig,
  EtsyProduct,
  EtsyReceipt,
  EtsyInventorySyncLog,
} from './EtsyRepository';
