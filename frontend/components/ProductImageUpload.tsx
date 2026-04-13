'use client';

import { useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { FileUpload, FileUploadHandlerEvent } from 'primereact/fileupload';
import { InputText } from 'primereact/inputtext';
import { Image } from 'primereact/image';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { adminShopAPI, ProductImage } from '@/services/AdminShopAPIService';

interface ProductImageUploadProps {
  productId: number;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
  maxImages?: number;
}

export default function ProductImageUpload({
  productId,
  images,
  onImagesChange,
  maxImages = 10,
}: ProductImageUploadProps) {
  const toast = useRef<Toast>(null);
  const fileUploadRef = useRef<FileUpload>(null);
  const [uploading, setUploading] = useState(false);
  const [editingAltText, setEditingAltText] = useState<{ [key: number]: string }>({});

  // Handle file upload (supporta multipli)
  const handleUpload = async (event: FileUploadHandlerEvent) => {
    if (!productId) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Attenzione',
        detail: 'Salva prima il prodotto',
        life: 3000,
      });
      return;
    }

    const files = event.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const file of files) {
        try {
          // Validate file
          const { validateImageFile } = await import('@/services/validation');
          const validation = validateImageFile(file, 10);
          if (validation.hasErrors()) {
            toast.current?.show({
              severity: 'error',
              summary: 'Errore Validazione',
              detail: `${file.name}: ${validation.getErrorMessage()}`,
              life: 3000,
            });
            errorCount++;
            continue;
          }

          const position = images.length + successCount;
          const result = await adminShopAPI.uploadProductImage(
            productId,
            file,
            '',
            position
          );

          // Add the new image to the array
          onImagesChange([...images, result.image]);
          successCount++;
        } catch (error) {
          console.error(`Upload error for ${file.name}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.current?.show({
          severity: 'success',
          summary: 'Successo',
          detail: `${successCount} immagine/i caricate`,
          life: 2000,
        });
      }

      if (errorCount > 0) {
        toast.current?.show({
          severity: 'error',
          summary: 'Errore',
          detail: `${errorCount} immagine/i non caricate`,
          life: 3000,
        });
      }

      // Reset file upload
      if (fileUploadRef.current) {
        fileUploadRef.current.clear();
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Errore',
        detail: 'Errore durante upload',
        life: 3000,
      });
    } finally {
      setUploading(false);
    }
  };

  // Remove image
  const handleRemove = async (image: ProductImage, index: number) => {
    // Estrai nome file dall'URL
    const fileName = image.url.split('/').pop() || `Immagine #${index + 1}`;
    
    confirmDialog({
      message: `Vuoi rimuovere "${fileName}"?`,
      header: 'Conferma Eliminazione',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sì, rimuovi',
      rejectLabel: 'Annulla',
      accept: async () => {
        try {
          await adminShopAPI.deleteProductImage(productId, image.id);
          const newImages = images.filter((_, i) => i !== index);
          onImagesChange(newImages);
          
          toast.current?.show({
            severity: 'success',
            summary: 'Rimossa',
            detail: `${fileName} rimossa`,
            life: 2000,
          });
        } catch (error) {
          console.error('Delete error:', error);
          toast.current?.show({
            severity: 'error',
            summary: 'Errore',
            detail: 'Errore eliminazione immagine',
            life: 3000,
          });
        }
      },
    });
  };

  // Move image up
  const moveUp = async (index: number) => {
    if (index === 0) return;
    
    const newImages = [...images];
    [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    
    try {
      // Update positions in backend
      await Promise.all([
        adminShopAPI.updateProductImage(productId, newImages[index - 1].id, { position: index - 1 }),
        adminShopAPI.updateProductImage(productId, newImages[index].id, { position: index }),
      ]);
      
      onImagesChange(newImages);
    } catch (error) {
      console.error('Move error:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Errore',
        detail: 'Errore riordino immagini',
        life: 3000,
      });
    }
  };

  // Move image down
  const moveDown = async (index: number) => {
    if (index === images.length - 1) return;
    
    const newImages = [...images];
    [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
    
    try {
      // Update positions in backend
      await Promise.all([
        adminShopAPI.updateProductImage(productId, newImages[index].id, { position: index }),
        adminShopAPI.updateProductImage(productId, newImages[index + 1].id, { position: index + 1 }),
      ]);
      
      onImagesChange(newImages);
    } catch (error) {
      console.error('Move error:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Errore',
        detail: 'Errore riordino immagini',
        life: 3000,
      });
    }
  };

  // Update alt text
  const updateAltText = async (image: ProductImage, newAltText: string) => {
    try {
      await adminShopAPI.updateProductImage(productId, image.id, { alt_text: newAltText });
      
      const updatedImages = images.map(img => 
        img.id === image.id ? { ...img, alt_text: newAltText } : img
      );
      onImagesChange(updatedImages);
      
      // Clear editing state
      setEditingAltText(prev => {
        const newState = { ...prev };
        delete newState[image.id];
        return newState;
      });
      
      toast.current?.show({
        severity: 'success',
        summary: 'Aggiornato',
        detail: 'Testo alternativo aggiornato',
        life: 2000,
      });
    } catch (error) {
      console.error('Update error:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Errore',
        detail: 'Errore aggiornamento testo alternativo',
        life: 3000,
      });
    }
  };

  const getImageUrl = (url: string) => {
    if (url.startsWith('http')) {
      return url;
    }
    return `${API_BASE_URL}${url}`;
  };

  return (
    <div className="space-y-4">
      <Toast ref={toast} />
      <ConfirmDialog />

      <label className="block text-sm font-medium mb-2">Immagini Prodotto</label>

      {/* Upload Section */}
      <div>
        <label className="block text-xs text-gray-600 mb-2">Carica Immagini</label>
        <FileUpload
          ref={fileUploadRef}
          mode="basic"
          name="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/avif"
          maxFileSize={10000000}
          customUpload
          uploadHandler={handleUpload}
          multiple={true}
          disabled={uploading || images.length >= maxImages}
          chooseLabel={uploading ? 'Caricamento...' : 'Scegli File (multipli)'}
          className="w-full"
        />
        <small className="text-gray-500">Max 10MB, JPG/PNG/GIF/WEBP/SVG/AVIF. Fino a {maxImages} immagini.</small>
      </div>

      {/* Images Preview */}
      {images.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-3">
            Immagini ({images.length}/{maxImages})
          </h4>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {images.map((img, index) => (
              <div
                key={img.id}
                className="relative group border border-gray-200 rounded-lg p-3 hover:border-blue-500 transition-colors"
              >
                {/* Position Badge */}
                <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded z-10">
                  #{index + 1}
                </div>

                {/* Image */}
                <div className="aspect-square bg-gray-100 rounded overflow-hidden mb-3">
                  <Image
                    src={getImageUrl(img.url)}
                    alt={img.alt_text || `Product image ${index + 1}`}
                    className="w-full h-full object-cover"
                    preview
                  />
                </div>

                {/* Alt Text Input */}
                <div className="mb-2">
                  <InputText
                    value={editingAltText[img.id] ?? img.alt_text ?? ''}
                    onChange={(e) => setEditingAltText(prev => ({
                      ...prev,
                      [img.id]: e.target.value
                    }))}
                    placeholder="Alt text (for SEO)"
                    className="w-full text-sm"
                    onBlur={() => {
                      const newAltText = editingAltText[img.id];
                      if (newAltText !== undefined && newAltText !== img.alt_text) {
                        updateAltText(img, newAltText);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const newAltText = editingAltText[img.id];
                        if (newAltText !== undefined && newAltText !== img.alt_text) {
                          updateAltText(img, newAltText);
                        }
                      }
                    }}
                  />
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <Button
                      icon="pi pi-arrow-up"
                      size="small"
                      text
                      rounded
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      tooltip="Move up"
                    />
                    <Button
                      icon="pi pi-arrow-down"
                      size="small"
                      text
                      rounded
                      onClick={() => moveDown(index)}
                      disabled={index === images.length - 1}
                      tooltip="Move down"
                    />
                  </div>
                  <Button
                    icon="pi pi-trash"
                    size="small"
                    severity="danger"
                    text
                    rounded
                    onClick={() => handleRemove(img, index)}
                    tooltip="Remove"
                  />
                </div>

                {/* URL Display */}
                <div className="mt-2 text-xs text-gray-500 truncate" title={img.url}>
                  {img.url}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {images.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
          <i className="pi pi-image text-4xl mb-2 block"></i>
          <p>Nessuna immagine. Carica immagini per mostrare il tuo prodotto.</p>
        </div>
      )}
    </div>
  );
}
