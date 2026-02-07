"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import Image from "next/image";
import { FumettiAPIService, type FumettoDTO } from "@/services/FumettiAPIService";

export default function FumettoDetailClient() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const slug = params.slug as string;
  
  const [fumetto, setFumetto] = useState<FumettoDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFumetto = async () => {
      try {
        const allFumetti = await FumettiAPIService.getAllFumetti();
        const found = allFumetti.find((f) => f.slug === slug || f.id?.toString() === slug);
        if (found && found.pages && found.pages.length > 0) {
          setFumetto(found);
        } else {
          router.push(`/${locale}/fumetti`);
        }
      } catch (error) {
        console.error("Error loading fumetto:", error);
        router.push(`/${locale}/fumetti`);
      } finally {
        setLoading(false);
      }
    };

    fetchFumetto();
  }, [slug, locale, router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          <p className="mt-4 text-gray-600">Caricamento fumetto...</p>
        </div>
      </div>
    );
  }

  if (!fumetto) {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Fumetto centrato con margini laterali ampi */}
      <div className="flex justify-center px-8 md:px-32 lg:px-96 py-12">
        <div className="w-full max-w-3xl">
          <div className="space-y-0">
            {fumetto.pages?.map((page, index) => (
              <div key={index} className="relative px-8 md:px-24 lg:px-32">
                <Image
                  src={page}
                  alt={`${fumetto.title} - Pagina ${index + 1}`}
                  width={0}
                  height={0}
                  sizes="100vw"
                  className="w-full h-auto"
                  style={{ width: '100%', height: 'auto' }}
                  priority={index === 0}
                  quality={100}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
