'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { shopAPI, Product } from '@/services/ShopAPIService';
import { Button } from 'primereact/button';
import { Toast } from 'primereact/toast';
import { useToast } from '@/hooks';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageGallery from '@/components/shop/ImageGallery';

// Generate a placeholder page for static export; actual slug is read client-side via useParams()
export function generateStaticParams() {
  return [{ slug: '_' }];
}

export default function ProductDetailPage() {
  const params = useParams();
  const locale = useLocale();
  const { toast, showError } = useToast();
  
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  const slug = params?.slug as string;

  useEffect(() => {
    if (slug) {
      fetchProduct();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const productData = await shopAPI.getProduct(slug);
      setProduct(productData);
    } catch (error) {
      console.error('Error fetching product:', error);
      showError('Failed to load product details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          {toast}
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          {toast}
          <div className="text-center py-16">
            <i className="pi pi-exclamation-triangle text-6xl text-gray-400 mb-4"></i>
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Product Not Found</h2>
            <Link href={`/${locale}/shop`}>
              <Button label="Back to Shop" icon="pi pi-arrow-left" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentPrice = typeof product.base_price === 'string' ? parseFloat(product.base_price) : (product.base_price || 0);
  const productImages = product.images || [];

  return (
    <div className="min-h-screen">
      {toast}

      <main className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-6 md:py-8">
        {/* Breadcrumb */}
        <div className="mb-4 md:mb-6">
          <Link href={`/${locale}/shop`} className="text-blue-600 hover:text-blue-700 inline-flex items-center text-sm font-medium">
            <i className="pi pi-arrow-left mr-2"></i>
            Torna allo Shop
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-12 p-4 md:p-8">
            {/* Image Gallery */}
            <ImageGallery images={productImages} productTitle={product.title} />

            {/* Product Info */}
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.title}</h1>
                {product.short_description && (
                  <p className="text-base text-gray-600 mb-3">{product.short_description}</p>
                )}
                {product.long_description && (
                  <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mt-4">
                    {product.long_description}
                  </div>
                )}
              </div>

              {/* Price */}
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-blue-600">
                  {product.currency === 'EUR' ? '€' : '$'}{(typeof currentPrice === 'string' ? parseFloat(currentPrice) : currentPrice).toFixed(2)}
                </span>
              </div>

              {/* Etsy Button */}
              {product.etsy_link && (
                <a href={product.etsy_link} target="_blank" rel="noopener noreferrer" className="block">
                  <Button
                    label="Acquista su Etsy"
                    icon="pi pi-external-link"
                    className="w-full"
                    size="large"
                    style={{ 
                      backgroundColor: '#0066CC',
                      borderColor: '#0066CC',
                      color: '#ffffff',
                      height: '3.5rem',
                      fontSize: '1.1rem',
                      fontWeight: '600'
                    }}
                  />
                </a>
              )}
              
              {/* View Character Button */}
              {product.character_id && (
                <Link href={`/${locale}/personaggi`}>
                  <Button
                    label="View Character"
                    icon="pi pi-user"
                    className="w-full p-button-outlined"
                    size="large"
                    style={{ 
                      height: '3.5rem',
                      fontSize: '1.1rem',
                      borderColor: '#0066CC',
                      color: '#0066CC',
                      fontWeight: '600'
                    }}
                  />
                </Link>
              )}

              {/* Product Meta */}
              {product.sku && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="font-semibold">SKU:</span>
                    <span>{product.sku}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
