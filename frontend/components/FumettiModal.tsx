import React, { useState, useEffect } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { useTranslations } from 'next-intl';
import type { FumettoDTO } from '@/services/FumettiAPIService';
import OptimizedImage from '@/components/OptimizedImage';

interface FumettiModalProps {
    visible: boolean;
    onHide: () => void;
    fumetto: FumettoDTO | null;
}

export default function FumettiModal({ visible, onHide, fumetto }: FumettiModalProps) {
    const t = useTranslations('fumetti.modal');
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [pages, setPages] = useState<string[]>([]);

    useEffect(() => {
        // Resetta l'indice quando cambia il fumetto
        if (fumetto && fumetto.pages && fumetto.pages.length > 0) {
            setPages(fumetto.pages);
            setCurrentPageIndex(0);
        } else {
            setPages([]);
            setCurrentPageIndex(0);
        }
    }, [fumetto, visible]);

    const goToNextPage = () => {
        if (currentPageIndex < pages.length - 1) {
            setCurrentPageIndex(currentPageIndex + 1);
        }
    };

    const goToPreviousPage = () => {
        if (currentPageIndex > 0) {
            setCurrentPageIndex(currentPageIndex - 1);
        }
    };

    const goToPage = (index: number) => {
        if (index >= 0 && index < pages.length) {
            setCurrentPageIndex(index);
        }
    };

    if (!fumetto) {
        return null;
    }

    return (
        <Dialog 
            visible={visible} 
            onHide={onHide}
            header={fumetto?.title || t('title')}
            style={{ width: '95vw', maxWidth: '1400px' }}
            modal
            draggable={false}
            resizable={false}
            maximizable
        >
            <div className="flex flex-col gap-4">
                {/* Galleria Orizzontale - Immagine Principale */}
                <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                    {pages && pages.length > 0 ? (
                        <div className="relative">
                            <OptimizedImage 
                                src={pages[currentPageIndex]} 
                                alt={`${fumetto.title} - Pagina ${currentPageIndex + 1}`} 
                                className="w-full"
                                imgClassName="w-full max-h-[70vh] object-contain mx-auto"
                            />
                            
                            {/* Navigazione Pagine - Frecce sui lati */}
                            {pages.length > 1 && (
                                <>
                                    <Button
                                        icon="pi pi-chevron-left"
                                        onClick={goToPreviousPage}
                                        disabled={currentPageIndex === 0}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 hover:bg-white shadow-lg rounded-full"
                                        aria-label="Pagina precedente"
                                    />
                                    <Button
                                        icon="pi pi-chevron-right"
                                        onClick={goToNextPage}
                                        disabled={currentPageIndex === pages.length - 1}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 hover:bg-white shadow-lg rounded-full"
                                        aria-label="Pagina successiva"
                                    />
                                </>
                            )}

                            {/* Indicatore Pagina */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium">
                                {t('page')} {currentPageIndex + 1} / {pages.length}
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-96 flex items-center justify-center">
                            <p className="text-gray-500">{t('noPages')}</p>
                        </div>
                    )}
                </div>
                
                {/* Thumbnails Orizzontali - Navigazione Rapida */}
                {pages && pages.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {pages.map((page, index) => (
                            <div
                                key={index}
                                onClick={() => goToPage(index)}
                                className={`flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                                    currentPageIndex === index 
                                        ? 'border-blue-500 scale-105 shadow-lg' 
                                        : 'border-gray-300 hover:border-blue-300'
                                }`}
                                style={{ width: '80px', height: '100px' }}
                            >
                                <OptimizedImage 
                                    src={page} 
                                    alt={`Pagina ${index + 1}`} 
                                    width={80}
                                    height={100}
                                    imgClassName="w-full h-full object-cover"
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* Informazioni Fumetto */}
                {fumetto.description && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-gray-800 mb-2">{t('about')}</h4>
                        <p className="text-gray-700 text-sm leading-relaxed">
                            {fumetto.description}
                        </p>
                    </div>
                )}
            </div>
        </Dialog>
    );
}

