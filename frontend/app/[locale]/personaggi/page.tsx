"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useTranslations } from 'next-intl';
import PersonaggioModal from "@/components/PersonaggioModal";
import PersonaggioCard from "@/components/personaggi/PersonaggioCard";
import { PersonaggiAPIService, type PersonaggioDTO } from "@/services/PersonaggiAPIService";

export default function PersonaggiPage() {
  const t = useTranslations('personaggi');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPersonaggio, setSelectedPersonaggio] = useState<PersonaggioDTO | null>(null);
  const [personaggi, setPersonaggi] = useState<PersonaggioDTO[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchPersonaggi = async () => {
      try {
        console.debug('[PersonaggiPage] fetchPersonaggi: start');
        setLoading(true);
        console.debug('[PersonaggiPage] fetchPersonaggi: calling API getAllPersonaggi');
        const data = await PersonaggiAPIService.getAllPersonaggi();
        console.debug('[PersonaggiPage] fetchPersonaggi: API resolved', {
          isArray: Array.isArray(data),
          length: Array.isArray(data) ? data.length : undefined,
          firstItem: Array.isArray(data) && data.length > 0 ? data[0] : null,
        });
        // Filtra solo i personaggi che hanno immagini
        //const personaggiWithImages = data.filter((p: PersonaggioDTO) => p.images && p.images.length > 0 && p.name !== "eliminare");
        console.debug('[PersonaggiPage] fetchPersonaggi: setPersonaggi(data)');
        setPersonaggi(data);
      } catch (error) {
        console.error("Errore durante il fetch dei personaggi:", error);
        console.error('[PersonaggiPage] fetchPersonaggi: entering catch with error details', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        setPersonaggi([]);
      } finally {
        console.debug('[PersonaggiPage] fetchPersonaggi: finally -> setLoading(false)');
        setLoading(false);
      }
    };
    
    fetchPersonaggi();
  }, []);
  
  if (loading) {
    return (
      <div className="container mx-auto px-4">
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Caricamento personaggi...</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="w-full">
      {/* Sezione grigia con logo e titolo */}
      <div
        className="w-full py-2 md:py-3"
        style={{
          marginLeft: '30px',
          marginRight: '30px',
          marginTop: '30px',
          marginBottom: '30px',
          width: 'calc(100% - 60px)',
          paddingLeft: 'clamp(60px, 8vw, 120px)',
          paddingRight: 'clamp(60px, 8vw, 120px)',
        }}
      >
        <div className="flex flex-col md:flex-row items-center md:items-center gap-8 md:gap-12">
            {/* Logo Animantra */}
            <div className="flex-shrink-0">
              <div className="relative w-40 h-40 md:w-44 md:h-44 lg:w-48 lg:h-48">
                <Image
                  src="/assets/AnimantraLogo.svg"
                  alt="Animantra Logo"
                  fill
                  className="object-contain"
                />
              </div>
            </div>

            {/* Titolo e descrizione */}
            <div className="flex-1 text-center md:gap-0 gap-4 md:text-left flex flex-col justify-center">
              <h1 
                className="text-black mb-3 md:mb-4 text-left md:text-left"
                style={{
                  fontFamily: 'var(--font-junglefever), sans-serif',
                  fontSize: 'clamp(28px, 2.5vw, 44px)',
                  lineHeight: '1.2',
                  fontWeight: 'normal',
                  color: "#EFE0C4"
                }}
              >
                I PERSONAGGI DELLA CIURMA
              </h1>
              <p 
                className="text-black text-center md:text-left"
                style={{
                  fontFamily: 'var(--font-kranji), sans-serif',
                  fontSize: 'clamp(18px, 2.5vw, 25px)',
                  lineHeight: '1.3',
                  fontWeight: 'normal',
                  color: "#EFE0C4"
                }}
              >
                Scopri i personaggi della ciurma di <strong>ANIMANTRA</strong>: <br />
                le caratteristiche, i gesti, i mantra e tanto altro, trova il tuo preferito e seguine le avventure.
              </p>
            </div>
          </div>
      </div>

      {/* Grid personaggi */}
      <div className="w-full md:px-36 mb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {personaggi.map((personaggio) => (
              <PersonaggioCard
                key={personaggio.id}
                personaggio={personaggio}
                onClick={() => {
                  setSelectedPersonaggio(personaggio);
                  setModalVisible(true);
                }}
              />
            ))}
          </div>

          {/* Messaggio se non ci sono personaggi */}
          {personaggi.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Nessun personaggio disponibile al momento.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal con la galleria */}
      <PersonaggioModal 
        visible={modalVisible} 
        onHide={() => {
          setModalVisible(false);
          setSelectedPersonaggio(null);
        }}
        personaggio={selectedPersonaggio}
      />
    </div>
  );
}
