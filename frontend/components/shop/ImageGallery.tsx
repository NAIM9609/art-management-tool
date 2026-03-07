import { useState } from 'react';
import { Button } from 'primereact/button';
import OptimizedImage from '@/components/OptimizedImage';

interface ProductImage {
  url: string;
  alt_text?: string;
  is_primary?: boolean;
  position?: number;
}

interface ImageGalleryProps {
  images: ProductImage[];
  productTitle?: string;
}

export default function ImageGallery({ images, productTitle = 'Product' }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const displayImages = images.length > 0 
    ? [...images].sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return (a.position || 0) - (b.position || 0);
      })
    : [{ url: '/placeholder-art.png', alt_text: productTitle }];

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % displayImages.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + displayImages.length) % displayImages.length);
  };

  const goToImage = (index: number) => {
    setCurrentIndex(index);
  };

  const currentImage = displayImages[currentIndex];

  return (
    <div className="space-y-4">
      {/* Main Image */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
        <OptimizedImage
          src={currentImage.url}
          alt={currentImage.alt_text || productTitle}
          className="w-full h-full"
          imgClassName="w-full h-full object-contain"
        />
        
        {displayImages.length > 1 && (
          <>
            <Button
              icon="pi pi-chevron-left"
              className="absolute left-2 top-1/2 -translate-y-1/2"
              rounded
              outlined
              onClick={prevImage}
            />
            <Button
              icon="pi pi-chevron-right"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              rounded
              outlined
              onClick={nextImage}
            />
          </>
        )}
      </div>

      {/* Thumbnails */}
      {displayImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {displayImages.map((img, idx) => (
            <button
              key={idx}
              onClick={() => goToImage(idx)}
              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                idx === currentIndex ? 'border-blue-600' : 'border-gray-200'
              }`}
            >
              <OptimizedImage
                src={img.url}
                alt={img.alt_text || `${productTitle} ${idx + 1}`}
                width={80}
                height={80}
                imgClassName="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Image Counter */}
      {displayImages.length > 1 && (
        <div className="text-center text-sm text-gray-600">
          {currentIndex + 1} / {displayImages.length}
        </div>
      )}
    </div>
  );
}
