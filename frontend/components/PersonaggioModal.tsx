import React, { useState, useEffect } from 'react';
import { Dialog } from 'primereact/dialog';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { PersonaggioDTO } from '@/services/PersonaggiAPIService';
import OptimizedImage from '@/components/OptimizedImage';

interface PersonaggioModalProps {
    visible: boolean;
    onHide: () => void;
    personaggio: PersonaggioDTO | null;
}

export default function PersonaggioModal({ visible, onHide, personaggio }: PersonaggioModalProps) {
    const t = useTranslations('personaggi.modal');
    const locale = useLocale();
    const router = useRouter();
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [images, setImages] = useState<string[]>([]);

    useEffect(() => {
        // Usa le immagini del personaggio selezionato
        if (personaggio && personaggio.images && personaggio.images.length > 0) {
            setImages(personaggio.images);
            setCurrentImageIndex(0);
        } else {
            setImages([]);
            setCurrentImageIndex(0);
        }
    }, [personaggio, visible]);

    const nextImage = () => {
        setCurrentImageIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = () => {
        setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    const goToImage = (index: number) => {
        setCurrentImageIndex(index);
    };

    // Split del nome personaggio per mostrarlo su più righe se necessario
    const getTitleLines = (name: string | undefined) => {
        if (!name) return ['', ''];
        const words = name.split(' ');
        if (words.length <= 1) return [name, ''];
        const mid = Math.ceil(words.length / 2);
        return [
            words.slice(0, mid).join(' '),
            words.slice(mid).join(' ')
        ];
    };

    const titleLines = getTitleLines(personaggio?.name);

    return (
        <Dialog
            visible={visible}
            onHide={onHide}
            header={null}
            style={{ 
                width: '90vw',
                maxHeight: '90vw',
                minHeight: '700px',
            }}
            modal
            draggable={false}
            resizable={false}
            className="p-dialog-mobile-optimized"
            pt={{
                root: {
                    className: 'bg-transparent'
                },
                content: {
                    className: 'p-0 bg-transparent'
                },
                header: {
                    className: 'hidden'
                },
                closeButton: {
                    className: 'hidden'
                },
                closeButtonIcon: {
                    className: 'hidden'
                }
            }}
            closable={true}
        >
            <div className="relative bg-white rounded-2xl overflow-hidden" style={{ minHeight: '600px' }}>

                <div className="flex flex-col md:flex-row h-full md:overflow-hidden">
                    {/* Sezione sinistra - Carousel */}
                    <div className="w-full md:w-2/3 bg-white flex items-center justify-center p-4 md:p-8">
                        {images && images.length > 0 ? (
                            <div className="w-full h-full flex flex-col justify-center">
                                {/* Immagine principale */}
                                <div className="relative w-full h-[400px] md:h-[500px] flex items-center justify-center">
                                    <OptimizedImage 
                                        src={images[currentImageIndex]} 
                                        alt={`${personaggio?.name} - Image ${currentImageIndex + 1}`}
                                        className="w-full h-full"
                                        imgClassName="max-w-full max-h-full object-contain"
                                        height={500}
                                    />
                                    
                                    {/* Navigazione immagini (frecce) */}
                                    {images.length > 1 && (
                                        <>
                                            <button
                                                onClick={prevImage}
                                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-gray-800/90 hover:bg-gray-800 text-white p-2 rounded-full shadow-md transition-all duration-200 hover:scale-110"
                                                aria-label="Immagine precedente"
                                            >
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={nextImage}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-800/90 hover:bg-gray-800 text-white p-2 rounded-full shadow-md transition-all duration-200 hover:scale-110"
                                                aria-label="Immagine successiva"
                                            >
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                    
                                    {/* Indicatori punti (in alto) */}
                                    {images.length > 1 && (
                                        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2">
                                            {images.map((_, index) => (
                                                <button
                                                    key={index}
                                                    onClick={() => goToImage(index)}
                                                    className={`h-2 rounded-full transition-all duration-200 ${
                                                        index === currentImageIndex 
                                                            ? 'bg-gray-800 w-8' 
                                                            : 'bg-gray-400 hover:bg-gray-600 w-2'
                                                    }`}
                                                    aria-label={`Vai all'immagine ${index + 1}`}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                {/* Carousel thumbnails (in basso) */}
                                {images.length > 1 && (
                                    <div className="mt-4">
                                        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                                            {images.map((img, index) => (
                                                <button
                                                    key={index}
                                                    onClick={() => goToImage(index)}
                                                    className={`flex-shrink-0 relative w-16 h-16 rounded-lg border-2 transition-all duration-200 ${
                                                        index === currentImageIndex 
                                                            ? 'border-gray-800 ring-2 ring-gray-400' 
                                                            : 'border-gray-300 hover:border-gray-500'
                                                    }`}
                                                    aria-label={`Anteprima ${index + 1}`}
                                                >
                                                    <OptimizedImage 
                                                        src={img} 
                                                        alt={`Thumbnail ${index + 1}`}
                                                        width={64}
                                                        height={64}
                                                        imgClassName="w-full h-full object-cover rounded"
                                                    />
                                                    {index === currentImageIndex && (
                                                        <div className="absolute inset-0 bg-gray-800/10" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="w-full h-[500px] flex items-center justify-center">
                                <p className="text-gray-500">Nessuna immagine disponibile</p>
                            </div>
                        )}
                    </div>
                    
                    {/* Sezione destra - Contenuto su sfondo bianco */}
                    <div className="w-full md:w-1/3 bg-white p-6 md:p-8 flex flex-col h-full md:overflow-hidden" style={{ minHeight: '600px' }}>
                        {/* Titolo con effetto outlined */}
                        <div className="mb-4 md:mb-6 flex-shrink-0">
                            <h2 
                                className="text-3xl md:text-4xl font-bold leading-tight"
                                style={{
                                    fontFamily: 'var(--font-junglefever), sans-serif',
                                    color: 'black',
                                    WebkitTextFillColor: 'black',
                                }}
                            >
                                {titleLines[0] && (
                                    <div>{titleLines[0]}</div>
                                )}
                                {titleLines[1] && (
                                    <div>{titleLines[1]}</div>
                                )}
                            </h2>
                        </div>
                        
                        {/* Descrizione scrollabile - solo su desktop */}
                        {personaggio?.description && (
                            <div className="flex-1 overflow-y-auto md:overflow-y-auto mb-4 md:mb-6 md:max-h-[300px] md:min-h-0">
                                <p className="text-base md:text-lg leading-relaxed text-black whitespace-pre-wrap">
                                    {personaggio.description}
                                </p>
                            </div>
                        )}
                        
                        {/* Pulsante Shop centrato in basso */}
                        {personaggio && personaggio.id && (
                            <div className="flex justify-center mt-auto flex-shrink-0">
                                <button
                                    onClick={() => {
                                        router.push(`/${locale}/shop?character=${personaggio.id}`);
                                        onHide();
                                    }}
                                    className="relative hover:scale-105 transition-transform duration-200"
                                    style={{ minWidth: '160px' }}
                                >
                                    <Image
                                        src="/assets/pulsante_shop.svg"
                                        alt="Shop"
                                        width={160}
                                        height={48}
                                        className="object-contain"
                                    />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Dialog>
    );
}