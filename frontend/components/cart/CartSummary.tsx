import Link from 'next/link';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';

interface CartSummaryProps {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  locale: string;
  onCheckout: () => void;
}

export default function CartSummary({
  subtotal,
  discount,
  tax,
  total,
  currency,
  locale,
  onCheckout,
}: CartSummaryProps) {
  const currencySymbol = currency === 'EUR' ? '€' : '$';
  const toNum = (v: number | string) => typeof v === 'string' ? parseFloat(v) : v;

  return (
    <Card title="Riepilogo Ordine" className="border-2 border-gray-200 sticky top-24">
      <div className="space-y-3">
        <div className="flex justify-between text-gray-700">
          <span>Subtotal:</span>
          <span className="font-semibold">
            {currencySymbol}{toNum(subtotal).toFixed(2)}
          </span>
        </div>

        {toNum(discount) > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount:</span>
            <span className="font-semibold">
              -{currencySymbol}{toNum(discount).toFixed(2)}
            </span>
          </div>
        )}

        {toNum(tax) > 0 && (
          <div className="flex justify-between text-gray-700">
            <span>Tax:</span>
            <span className="font-semibold">
              {currencySymbol}{toNum(tax).toFixed(2)}
            </span>
          </div>
        )}

        <div className="border-t pt-3 flex justify-between text-lg font-bold text-black">
          <span>Totale:</span>
          <span className="text-black">
            {currencySymbol}{toNum(total).toFixed(2)}
          </span>
        </div>

        <Button
          label="Vai al Checkout"
          icon="pi pi-arrow-right"
          iconPos="right"
          className="w-full mt-4"
          size="large"
          onClick={onCheckout}
          style={{
            backgroundColor: '#0066CC',
            borderColor: '#0066CC',
            fontWeight: '600'
          }}
        />

        <Link href={`/${locale}/shop`}>
          <Button
            label="Continua Shopping"
            icon="pi pi-shopping-bag"
            outlined
            className="w-full"
            style={{
              borderColor: '#0066CC',
              color: '#0066CC',
              fontWeight: '600'
            }}
          />
        </Link>
      </div>
    </Card>
  );
}
