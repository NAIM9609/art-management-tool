import OptimizedImage from "@/components/OptimizedImage";
import type { PersonaggioDTO } from "@/services/PersonaggiAPIService";

interface PersonaggioCardProps {
  personaggio: PersonaggioDTO;
  onClick: () => void;
}

export default function PersonaggioCard({ personaggio, onClick }: PersonaggioCardProps) {
  // Generate background style based on type
  const getBackgroundStyle = () => {
    if (personaggio.backgroundType === 'gradient' && personaggio.gradientFrom && personaggio.gradientTo) {
      return {
        background: `linear-gradient(to bottom right, ${personaggio.gradientFrom}, ${personaggio.gradientTo})`
      };
    }
    return {
      backgroundColor: personaggio.backgroundColor || '#E0E7FF'
    };
  };

  return (
    <div 
      className="w-full rounded-lg p-5 cursor-pointer border-2 border-transparent hover:border-blue-500 transition-all duration-150"
      style={getBackgroundStyle()}
      onClick={onClick}
    >
      <div className="relative w-full aspect-square mb-4">
        {personaggio.icon ? (
          <OptimizedImage
            src={personaggio.icon}
            alt={`${personaggio.name} Icon`}
            className="w-full h-full"
            imgClassName="object-contain rounded-lg w-full h-full"
          />
        ) : personaggio.images && personaggio.images[0] ? (
          <OptimizedImage
            src={personaggio.images[0]}
            alt={personaggio.name}
            className="w-full h-full"
            imgClassName="object-contain rounded-lg w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 rounded-lg flex items-center justify-center">
            <span className="text-gray-500">No Image</span>
          </div>
        )}
      </div>
      
      <h3 className="text-lg font-semibold text-center text-gray-800">
        {personaggio.name}
      </h3>
    </div>
  );
}
