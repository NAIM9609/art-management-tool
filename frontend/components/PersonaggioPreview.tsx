'use client';

import { PersonaggioDTO } from '@/services/PersonaggiAPIService';
import { Galleria } from 'primereact/galleria';
import { useState, useEffect } from 'react';
import OptimizedImage from '@/components/OptimizedImage';
import { getApiBaseUrl } from '@/services/apiUtils';

interface PersonaggioPreviewProps {
  personaggio: Partial<PersonaggioDTO>;
}

interface GalleriaImage {
  itemImageSrc: string;
  thumbnailImageSrc: string;
  alt: string;
}

export default function PersonaggioPreview({ personaggio }: PersonaggioPreviewProps) {
  const API_BASE_URL = getApiBaseUrl();
  const [images, setImages] = useState<GalleriaImage[]>([]);

  const getImageUrl = (url: string | undefined) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${API_BASE_URL}${url}`;
  };

  useEffect(() => {
    if (personaggio && personaggio.images && personaggio.images.length > 0) {
      const formattedImages = personaggio.images.map((imgSrc: string, index: number) => ({
        itemImageSrc: imgSrc.startsWith('http') ? imgSrc : `${API_BASE_URL}${imgSrc}`,
        thumbnailImageSrc: personaggio.icon 
          ? (personaggio.icon.startsWith('http') ? personaggio.icon : `${API_BASE_URL}${personaggio.icon}`)
          : (imgSrc.startsWith('http') ? imgSrc : `${API_BASE_URL}${imgSrc}`),
        alt: `${personaggio.name} - Image ${index + 1}`
      }));
      setImages(formattedImages);
    } else {
      setImages([]);
    }
  }, [personaggio, API_BASE_URL]);

  const getBackgroundStyle = () => {
    if (personaggio.backgroundType === 'gradient' && personaggio.gradientFrom && personaggio.gradientTo) {
      return {
        background: `linear-gradient(to bottom right, ${personaggio.gradientFrom}, ${personaggio.gradientTo})`,
      };
    }
    if (personaggio.backgroundType === 'image' && personaggio.backgroundImage) {
      return {
        backgroundImage: `url(${personaggio.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    return {
      backgroundColor: personaggio.backgroundColor || '#E0E7FF',
    };
  };

  const itemTemplate = (item: GalleriaImage) => {
    if (!item || !item.itemImageSrc) {
      return <div className="w-full h-96 bg-gray-200 flex items-center justify-center">No Image</div>;
    }
    return (
      <OptimizedImage
        src={item.itemImageSrc}
        alt={item.alt || 'Image'}
        imgClassName="w-full object-contain"
        className="w-full"
      />
    );
  };

  const thumbnailTemplate = (item: GalleriaImage) => {
    if (!item || !item.thumbnailImageSrc) {
      return <div className="w-15 h-15 bg-gray-200"></div>;
    }
    return (
      <OptimizedImage
        src={item.thumbnailImageSrc}
        alt={item.alt || 'Thumbnail'}
        width={60}
        height={60}
        imgClassName="object-cover"
      />
    );
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4">User View Preview</h3>

      {/* 1. CARD PREVIEW - Come appare nella griglia /personaggi */}
      <div>
        <h4 className="text-sm font-semibold text-gray-600 mb-3">Card View (Grid)</h4>
        <div className="max-w-xs">
          <div 
            className="rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all duration-300"
            style={getBackgroundStyle()}
          >
            <div className="relative w-full aspect-square mb-4">
              {personaggio.icon ? (
                <OptimizedImage
                  src={getImageUrl(personaggio.icon)}
                  alt={`${personaggio.name} Icon`}
                  className="w-full h-full"
                  imgClassName="w-full h-full object-contain rounded-lg"
                />
              ) : personaggio.images && personaggio.images[0] ? (
                <OptimizedImage
                  src={getImageUrl(personaggio.images[0])}
                  alt={personaggio.name}
                  className="w-full h-full"
                  imgClassName="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="w-full h-full bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-gray-500">No Image</span>
                </div>
              )}
            </div>
            
            <h3 className="text-lg font-semibold text-center text-gray-800 mb-12">
              {personaggio.name || 'Personaggio Name'}
            </h3>
          </div>
        </div>
      </div>

      {/* 2. MODAL PREVIEW - Come appare nella modal con galleria */}
      <div>
        <h4 className="text-sm font-semibold text-gray-600 mb-3">Modal Detail View</h4>
        <div className="border rounded-lg p-6 bg-white shadow-sm">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Galleria a sinistra */}
            <div className="flex-1">
              {images && images.length > 0 ? (
                <Galleria 
                  value={images} 
                  numVisible={3} 
                  circular 
                  style={{ maxWidth: '100%' }} 
                  showItemNavigators 
                  showItemNavigatorsOnHover 
                  showIndicators
                  showThumbnails={true} 
                  item={itemTemplate} 
                  thumbnail={thumbnailTemplate}
                  thumbnailsPosition="bottom"
                />
              ) : (
                <div className="w-full h-80 bg-gray-100 rounded-lg flex items-center justify-center">
                  <p className="text-gray-500">Nessuna immagine disponibile</p>
                </div>
              )}
            </div>
            
            {/* Testo descrittivo a destra */}
            <div className="flex-1 md:max-w-md">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-2xl font-bold mb-4 text-gray-800">
                  {personaggio.name || 'Personaggio Name'}
                </h3>
                
                <div className="space-y-4 text-gray-700">
                  <p>
                    <strong>{personaggio.name || 'Personaggio'}</strong>{' '}
                    {personaggio.description || 'Descrizione non disponibile.'}
                  </p>
                  
                  <div className="bg-white p-4 rounded border-l-4 border-blue-500">
                    <h4 className="font-semibold mb-2">Caratteristiche</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Stile artistico unico</li>
                      <li>Palette colori distintiva</li>
                      <li>Espressione emotiva</li>
                      <li>Tecnica pittorica</li>
                    </ul>
                  </div>
                  
                  {personaggio.images && personaggio.images.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded">
                      <span className="text-sm font-medium text-blue-800">
                        {personaggio.images.length} {personaggio.images.length === 1 ? 'immagine' : 'immagini'} disponibili
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
