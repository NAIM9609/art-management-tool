'use client';

import { useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { FileUpload, FileUploadHandlerEvent } from 'primereact/fileupload';
import { InputText } from 'primereact/inputtext';
import { Image } from 'primereact/image';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { getApiBaseUrl } from '@/services/apiUtils';

const IMAGE_UPLOAD_CONFIRM_GROUP = 'image-upload-confirm';

interface ImageUploadProps {
  label: string;
  images: string[];
  onImagesChange: (images: string[]) => void;
  maxImages?: number;
  type?: 'icon' | 'gallery' | 'background' | 'cover' | 'page';
  uploadEntity?: 'personaggi' | 'fumetti';
  personaggioId?: number;
  fumettoId?: number;
}

export default function ImageUpload({
  label,
  images,
  onImagesChange,
  maxImages = 10,
  type = 'gallery',
  uploadEntity,
  personaggioId,
  fumettoId,
}: ImageUploadProps) {
  const toast = useRef<Toast>(null);
  const fileUploadRef = useRef<FileUpload>(null);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);

  const API_BASE_URL = getApiBaseUrl();

  const getUploadEndpoint = (): 'personaggi' | 'fumetti' => {
    if (uploadEntity) {
      return uploadEntity;
    }
    if (type === 'icon' || type === 'gallery' || type === 'background') {
      return 'personaggi';
    }
    if (type === 'cover' || type === 'page') {
      return 'fumetti';
    }
    return personaggioId ? 'personaggi' : 'fumetti';
  };

  // Upload file to S3 via the entity-less temp endpoint.
  // The returned URL is stored in form state and included when the entity is saved.
  const handleUpload = async (event: FileUploadHandlerEvent) => {
    const uploadEndpoint = getUploadEndpoint();
    const files = event.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    const newUrls: string[] = [];

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

          const formData = new FormData();
          formData.append('file', file);
          formData.append('type', type);
          formData.append('entity', uploadEndpoint);

          const token = localStorage.getItem('adminToken');
          const response = await fetch(`${API_BASE_URL}/api/upload/temp`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Upload failed (${response.status})`);
          }

            const data = await response.json();

            let cdnUrl: string;
            if (data.upload_url) {
              // Lambda / production: presigned URL — PUT file directly to S3.
              const s3Response = await fetch(data.upload_url, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file,
              });
              if (!s3Response.ok) {
                throw new Error(`Direct S3 upload failed (${s3Response.status})`);
              }
              cdnUrl = data.cdn_url;
            } else {
              // Docker / local: backend already uploaded the file.
              cdnUrl = data.url;
            }

            newUrls.push(cdnUrl);
            successCount++;
          } catch (error) {
            console.error(`Upload error for ${file.name}:`, error);
            errorCount++;
          }
      }

      // Aggiorna lo stato del form locale con i nuovi URL
      if (newUrls.length > 0) {
        if (type === 'icon' || type === 'background' || type === 'cover') {
          onImagesChange([newUrls[newUrls.length - 1]]);
        } else {
          onImagesChange([...images, ...newUrls]);
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

  // Aggiungi URL (solo locale, non salva sul backend)
  const handleAddUrl = async () => {
    if (!urlInput.trim()) {
      return;
    }

    // Validate URL format
    const { Validator } = await import('@/services/validation');
    const validator = new Validator();
    validator.url('url', urlInput.trim());
    const validation = validator.getResult();
    
    if (validation.hasErrors()) {
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: validation.getErrorMessage(),
        life: 3000,
      });
      return;
    }

    if (type === 'icon' || type === 'background' || type === 'cover') {
      onImagesChange([urlInput.trim()]);
    } else {
      if (images.length >= maxImages) {
        toast.current?.show({
          severity: 'warn',
          summary: 'Limit Reached',
          detail: `Maximum ${maxImages} images allowed`,
          life: 3000,
        });
        return;
      }
      onImagesChange([...images, urlInput.trim()]);
    }

    setUrlInput('');
    
    toast.current?.show({
      severity: 'success',
      summary: 'Added',
      detail: 'URL added. Remember to save!',
      life: 2000,
    });
  };

  // Rimuovi immagine
  const handleRemove = (index: number, imageUrl: string) => {
    // Estrai nome file dall'URL
    const fileName = imageUrl.split('/').pop() || 'immagine';
    
    confirmDialog({
      group: IMAGE_UPLOAD_CONFIRM_GROUP,
      message: `Vuoi rimuovere "${fileName}"?`,
      header: 'Conferma Eliminazione',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sì, rimuovi',
      rejectLabel: 'Annulla',
      accept: async () => {
        const uploadEndpoint = getUploadEndpoint();
        const currentEntityId = uploadEndpoint === 'personaggi' ? personaggioId : fumettoId;

        // If the entity is already saved, attempt to remove from DB + S3.
        // Silently ignore failures — the image may not be linked to the entity yet
        // (e.g. it was temp-uploaded but the form hasn't been saved).
        if (currentEntityId) {
          try {
            const token = localStorage.getItem('adminToken');
            const deletePath =
              uploadEndpoint === 'personaggi'
                ? `${API_BASE_URL}/api/personaggi/${currentEntityId}/images`
                : `${API_BASE_URL}/api/fumetti/${currentEntityId}/pages`;
            const deleteBody =
              uploadEndpoint === 'personaggi'
                ? { imageUrl, type }
                : { pageUrl: imageUrl, type };

            await fetch(deletePath, {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(deleteBody),
            });
          } catch {
            // Silently ignore — image may not be in entity yet.
          }
        }

        const newImages = images.filter((_, i) => i !== index);
        onImagesChange(newImages);

        toast.current?.show({
          severity: 'success',
          summary: 'Rimossa',
          detail: `${fileName} rimossa`,
          life: 2000,
        });
      },
    });
  };

  // Sposta immagine su
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newImages = [...images];
    [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    onImagesChange(newImages);
  };

  // Sposta immagine giù
  const moveDown = (index: number) => {
    if (index === images.length - 1) return;
    const newImages = [...images];
    [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
    onImagesChange(newImages);
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
      <ConfirmDialog group={IMAGE_UPLOAD_CONFIRM_GROUP} />

      <label className="block text-sm font-medium mb-2">{label}</label>

      {/* Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* File Upload */}
        <div>
          <label className="block text-xs text-gray-600 mb-2">Upload from Device</label>
          <FileUpload
            ref={fileUploadRef}
            mode="basic"
            name="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml,image/avif"
            maxFileSize={10000000}
            customUpload
            uploadHandler={handleUpload}
            multiple={type !== 'icon' && type !== 'cover' && type !== 'background'}
            disabled={uploading || ((type === 'icon' || type === 'cover' || type === 'background') && images.length > 0) || images.length >= maxImages}
            chooseLabel={uploading ? 'Caricamento...' : (type === 'icon' || type === 'cover' || type === 'background' ? 'Scegli File' : 'Scegli File (multipli)')}
            className="w-full"
          />
          <small className="text-gray-500">Max 10MB, JPG/PNG/GIF/WEBP/SVG/AVIF</small>
        </div>

        {/* URL Input */}
        <div>
          <label className="block text-xs text-gray-600 mb-2">Or Add Image URL</label>
          <div className="flex gap-2">
            <InputText
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1"
              disabled={(type === 'icon' || type === 'cover') && images.length > 0}
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <Button
              icon="pi pi-plus"
              onClick={handleAddUrl}
              disabled={!urlInput.trim() || ((type === 'icon' || type === 'cover') && images.length > 0) || images.length >= maxImages}
              tooltip="Add URL"
            />
          </div>
        </div>
      </div>

      {/* Images Preview */}
      {images.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-3">
            {(type === 'icon' || type === 'cover') ? `${type === 'icon' ? 'Icon' : 'Cover'} Preview` : `Images (${images.length}/${maxImages})`}
          </h4>
          <div className={`grid gap-4 ${(type === 'icon' || type === 'cover') ? 'grid-cols-1 max-w-xs' : 'grid-cols-2 md:grid-cols-4'}`}>
            {images.map((img, index) => (
              <div
                key={index}
                className="relative group border border-gray-200 rounded-lg p-2 hover:border-blue-500 transition-colors"
              >
                {/* Image */}
                <div className="aspect-square bg-gray-100 rounded overflow-hidden mb-2">
                  <Image
                    src={getImageUrl(img)}
                    alt={`${label} ${index + 1}`}
                    className="w-full h-full object-cover"
                    preview
                  />
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between gap-1">
                  {(type === 'gallery' || type === 'page') && (
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
                  )}
                  <Button
                    icon="pi pi-trash"
                    size="small"
                    severity="danger"
                    text
                    rounded
                    onClick={() => handleRemove(index, img)}
                    tooltip="Rimuovi"
                    className="ml-auto"
                  />
                </div>

                {/* URL Display */}
                <div className="mt-2 text-xs text-gray-500 truncate" title={img}>
                  {img}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {images.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
          <i className="pi pi-image text-4xl mb-2 block"></i>
          <p>No images yet. Upload a file or add an image URL.</p>
        </div>
      )}
    </div>
  );
}
