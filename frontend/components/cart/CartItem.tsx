import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';
import { Card } from 'primereact/card';
import type { CartResponse } from '@/services/ShopAPIService';

interface CartItemProps {
  item: CartResponse['cart']['items'][0];
  updating: boolean;
  onUpdateQuantity: (quantity: number | null | undefined) => void;
  onRemove: () => void;
}

export default function CartItem({ item, updating, onUpdateQuantity, onRemove }: CartItemProps) {
  const product = item.product;
  const variant = item.variant;

  // Safety check - if product is null, return null
  if (!product) {
    console.warn('🛒 [RENDER] Cart item missing product data:', item);
    return null;
  }

  // Calculate price with variant adjustment
  const basePrice = typeof product.base_price === 'string' ? parseFloat(product.base_price) : (product.base_price || 0);
  const priceAdjustment = typeof variant?.price_adjustment === 'string' ? parseFloat(variant.price_adjustment) : (variant?.price_adjustment || 0);
  const finalPrice = basePrice + priceAdjustment;
  const total = finalPrice * item.quantity;

  return (
    <Card className="border border-gray-200">
      <div className="flex gap-4">
        <div className="w-24 h-24 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
          {product.images && product.images.length > 0 ? (
            <img
              src={product.images.find(img => img.is_primary)?.url || product.images[0].url}
              alt={product.title}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <i className="pi pi-image text-3xl text-gray-400"></i>
            </div>
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-black">
            {product.title}
          </h3>
          {variant && (
            <p className="text-sm text-gray-600 mt-1">
              Variant: {variant.name}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            SKU: {variant?.sku || product.sku}
          </p>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Qty:</label>
              <InputNumber
                value={item.quantity}
                onValueChange={(e) => onUpdateQuantity(e.value)}
                showButtons
                min={1}
                max={variant?.stock || 99}
                disabled={updating}
                className="w-32"
                useGrouping={false}
              />
            </div>
            <div className="flex-1 text-right">
              <p className="text-lg font-bold text-black">
                {product.currency === 'EUR' ? '€' : '$'}{total.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">
                {product.currency === 'EUR' ? '€' : '$'}{finalPrice.toFixed(2)} cad.
              </p>
            </div>
          </div>
        </div>

        <div>
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            onClick={onRemove}
            disabled={updating}
            loading={updating}
          />
        </div>
      </div>
    </Card>
  );
}
