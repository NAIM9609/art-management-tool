import { useState, useCallback } from 'react';
import { FumettoDTO, FumettiAPIService } from '@/services/FumettiAPIService';

interface UseFumettoManagementProps {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarn: (message: string) => void;
}

export default function useFumettoManagement({
  showSuccess,
  showError,
  showWarn,
}: UseFumettoManagementProps) {
  const [fumetti, setFumetti] = useState<FumettoDTO[]>([]);
  const [deletedFumetti, setDeletedFumetti] = useState<FumettoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFumetto, setEditingFumetto] = useState<FumettoDTO | null>(null);


  const loadFumetti = useCallback(async () => {
    setLoading(true);
    try {
      const [activeResult, deletedResult] = await Promise.allSettled([
        FumettiAPIService.getAllFumettiAdmin(),
        FumettiAPIService.getDeletedFumetti(),
      ]);

      if (activeResult.status === 'fulfilled') {
        setFumetti(activeResult.value);
      } else {
        console.error('Error loading active fumetti:', activeResult.reason);
        showError('Failed to load fumetti');
      }

      if (deletedResult.status === 'fulfilled') {
        setDeletedFumetti(deletedResult.value);
      } else {
        console.error('Error loading deleted fumetti:', deletedResult.reason);
      }
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const handleSave = useCallback(
    async (formData: Partial<FumettoDTO>, editingFumetto: FumettoDTO | null) => {
      try {
        if (!formData.title) {
          showWarn('Title is required');
          return;
        }

        const dataToSave = {
          ...formData,
          pages: formData.pages || [],
        };

        if (editingFumetto) {
          await FumettiAPIService.updateFumetto(editingFumetto.id!, dataToSave as FumettoDTO);
          showSuccess('Fumetto updated successfully');
        } else {
          await FumettiAPIService.createFumetto(
            dataToSave as Omit<FumettoDTO, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
          );
          showSuccess('Fumetto created successfully');
        }

        loadFumetti();
        return true;
      } catch (error) {
        console.error('Error saving fumetto:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to save fumetto';
        showError(errorMessage);
        return false;
      }
    },
    [showSuccess, showError, showWarn, loadFumetti]
  );

  const handleRestore = useCallback(
    async (fumetto: FumettoDTO) => {
      try {
        await FumettiAPIService.restoreFumetto(fumetto.id!);
        showSuccess('Fumetto restored successfully');
        loadFumetti();
      } catch (error) {
        console.error('Error restoring fumetto:', error);
        showError('Failed to restore fumetto');
      }
    },
    [showSuccess, showError, loadFumetti]
  );

  const resetCreateSession = useCallback(() => {
    setEditingFumetto(null);
  }, []);

  return {
    fumetti,
    deletedFumetti,
    loading,
    editingFumetto,
    setEditingFumetto,
    loadFumetti,
    handleSave,
    handleRestore,
    resetCreateSession,
  };
}
