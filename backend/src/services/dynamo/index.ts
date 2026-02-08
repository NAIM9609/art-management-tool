/**
 * DynamoDB-based service implementations
 * These provide the same API as the original TypeORM services but use DynamoDB repositories
 */

export { ProductServiceDynamo, productServiceDynamo } from './ProductServiceDynamo';
export type { Product, ProductImage, ProductVariant, Category, ProductFilters } from './ProductServiceDynamo';
export { ProductStatus } from './ProductServiceDynamo';

export { CartServiceDynamo, cartServiceDynamo } from './CartServiceDynamo';
export type { Cart, CartItem } from './CartServiceDynamo';

export { OrderServiceDynamo, orderServiceDynamo } from './OrderServiceDynamo';
export type { Order, OrderItem, CheckoutData, OrderFilters } from './OrderServiceDynamo';
export { PaymentStatus, FulfillmentStatus } from './OrderServiceDynamo';

export { NotificationServiceDynamo, notificationServiceDynamo } from './NotificationServiceDynamo';
export type { Notification, CreateNotificationData } from './NotificationServiceDynamo';
export { NotificationType } from './NotificationServiceDynamo';
