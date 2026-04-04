"use client";

import OptimizedImage from "@/components/OptimizedImage";
import { useState, useEffect } from "react";
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { FumettiAPIService, type FumettoDTO } from "@/services/FumettiAPIService";

export default function FumettiPage() {
  const t = useTranslations('fumetti');
  const locale = useLocale();
  const router = useRouter();
  const [fumetti, setFumetti] = useState<FumettoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchFumetti = async () => {
      setLoading(true);
      const data = await FumettiAPIService.getAllFumetti();
      // Filtra solo i fumetti che hanno pagine
      const fumettiWithPages = data.filter((f: FumettoDTO) => f.pages && f.pages.length > 0);
      // Ordina dalla più recente alla più vecchia (da sinistra a destra)
      const sortedFumetti = fumettiWithPages.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA; // più recente prima
      });
      setFumetti(sortedFumetti);
      setLoading(false);
    };
    
    fetchFumetti();
  }, []);
  
  if (loading) {
    return (
      <div className="w-full px-4 py-12">
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Caricamento fumetti...</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full min-h-screen">
      {/* Titolo centrato con sfondo bianco */}
      <div className="w-full py-20 px-4">
        <h1 className="junglefever-title text-black text-center">{t('title')}</h1>
      </div>

      {/* Griglia fumetti: 2 colonne con fumetti più piccoli */}
      <div className="w-full max-w-4xl mx-auto px-[72px] py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
          {fumetti.map((fumetto) => {
            const year = fumetto.createdAt 
              ? new Date(fumetto.createdAt).getFullYear()
              : '';

            return (
              <div
                key={fumetto.id}
                className="cursor-pointer group flex flex-col items-center"
                onClick={() => {
                  router.push(`/${locale}/fumetti/${fumetto.slug || fumetto.id}`);
                }}
              >
                {/* Immagine più piccola */}
                <div className="relative w-48 h-64 overflow-hidden mb-3">
                  {fumetto.coverImage ? (
                    <OptimizedImage
                      src={fumetto.coverImage}
                      alt={`${fumetto.title} Cover`}
                      className="w-full h-full"
                      imgClassName="object-contain transition-opacity group-hover:opacity-90 w-full h-full"
                    />
                  ) : fumetto.pages && fumetto.pages[0] ? (
                    <OptimizedImage
                      src={fumetto.pages[0]}
                      alt={fumetto.title}
                      className="w-full h-full"
                      imgClassName="object-contain transition-opacity group-hover:opacity-90 w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <span className="text-sm text-gray-400">No Cover</span>
                    </div>
                  )}
                </div>

                {/* Titolo con anno */}
                <p className="text-sm font-semibold text-black text-center group-hover:underline" style={{ color: "#EFE0C4" }}>
                  {fumetto.title} {year && `(${year})`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Messaggio se non ci sono fumetti */}
      {fumetti.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-base">Nessun fumetto disponibile al momento.</p>
        </div>
      )}
    </div>
  );
}
