'use client';

import { useEffect, useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { TabView, TabPanel } from 'primereact/tabview';
import { FumettoDTO, FumettiAPIService } from '@/services/FumettiAPIService';
import FumettiModal from '@/components/FumettiModal';
import OptimizedImage from '@/components/OptimizedImage';
import { useToast } from '@/hooks/useToast';
import { useFormDialog } from '@/hooks/useFormDialog';
import useFumettoManagement from '@/hooks/useFumettoManagement';
import PageHeader from '@/components/admin/PageHeader';
import FumettoForm from '@/components/admin/FumettoForm';

export default function AdminFumettiPage() {
  const { toast, showSuccess, showError, showWarn } = useToast();
  const { showDialog, formData, isEditing, openDialog, closeDialog, updateFormData } = useFormDialog<FumettoDTO>({
    title: '',
    description: '',
    coverImage: '',
    pages: [],
    order: 0,
  });

  const {
    fumetti,
    deletedFumetti,
    loading,
    editingFumetto,
    setEditingFumetto,
    loadFumetti,
    handleSave: saveFumetto,
    handleRestore,
    resetCreateSession,
  } = useFumettoManagement({
    showSuccess,
    showError,
    showWarn,
  });

  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [previewFumetto, setPreviewFumetto] = useState<FumettoDTO | null>(null);

  useEffect(() => {
    loadFumetti();
  }, [loadFumetti]);

  const handleCreate = () => {
    openDialog({
      title: '',
      description: '',
      coverImage: '',
      pages: [],
      order: 0,
    });
    resetCreateSession();
  };

  const handleEdit = (fumetto: FumettoDTO) => {
    openDialog(fumetto);
    setEditingFumetto(fumetto);
  };

  const handleSave = async () => {
    const success = await saveFumetto(formData, editingFumetto);
    if (success) {
      closeDialog();
    }
  };

  const handleDelete = (fumetto: FumettoDTO) => {
    confirmDialog({
      message: `Are you sure you want to delete "${fumetto.title}"?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await FumettiAPIService.deleteFumetto(fumetto.id!);
          showSuccess('Fumetto deleted successfully');
          loadFumetti();
        } catch (error) {
          console.error('Error deleting fumetto:', error);
          showError('Failed to delete fumetto');
        }
      },
    });
  };

  const handlePreview = async (fumetto: FumettoDTO) => {
    try {
      const detailedFumetto = fumetto.id
        ? await FumettiAPIService.getFumettoAdmin(fumetto.id)
        : fumetto;
      setPreviewFumetto(detailedFumetto);
      setShowPreviewDialog(true);
    } catch (error) {
      console.error('Error loading fumetto preview:', error);
      showError('Failed to load fumetto preview');
    }
  };

  const coverImageBodyTemplate = (rowData: FumettoDTO) => {
    return rowData.coverImage ? (
      <OptimizedImage
        src={rowData.coverImage}
        alt={rowData.title}
        width={80}
        height={80}
        imgClassName="object-cover"
      />
    ) : (
      <span className="text-500">No image</span>
    );
  };

  const pagesBodyTemplate = (rowData: FumettoDTO) => {
    return <span>{rowData.pages?.length || 0} pages</span>;
  };

  const actionsBodyTemplate = (rowData: FumettoDTO, isDeleted = false) => {
    if (isDeleted) {
      return (
        <div className="flex gap-2">
          <Button
            icon="pi pi-undo"
            className="p-button-rounded p-button-success"
            onClick={() => handleRestore(rowData)}
            tooltip="Restore"
            tooltipOptions={{ position: 'top' }}
          />
        </div>
      );
    }

    return (
      <div className="flex gap-2">
        <Button
          icon="pi pi-eye"
          className="p-button-rounded p-button-info"
          onClick={() => handlePreview(rowData)}
          tooltip="Preview"
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          icon="pi pi-pencil"
          className="p-button-rounded p-button-warning"
          onClick={() => handleEdit(rowData)}
          tooltip="Edit"
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          icon="pi pi-trash"
          className="p-button-rounded p-button-danger"
          onClick={() => handleDelete(rowData)}
          tooltip="Delete"
          tooltipOptions={{ position: 'top' }}
        />
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {toast}
      <ConfirmDialog />

      <PageHeader
        title="Gestione Fumetti"
        subtitle="Manage comics and their pages"
        actions={[
          {
            label: 'Create New Fumetto',
            icon: 'pi pi-plus',
            onClick: handleCreate,
            severity: 'success',
          },
        ]}
      />

      <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
        <TabPanel header={`Active Fumetti (${fumetti.length})`}>
          <DataTable
            value={fumetti}
            loading={loading}
            paginator
            rows={10}
            rowsPerPageOptions={[5, 10, 25, 50]}
            tableStyle={{ minWidth: '60rem' }}
            emptyMessage="No active fumetti found"
          >
            <Column field="id" header="ID" sortable style={{ width: '80px' }} />
            <Column field="title" header="Title" sortable />
            <Column field="description" header="Description" sortable />
            <Column
              header="Cover Image"
              body={coverImageBodyTemplate}
              style={{ width: '120px' }}
            />
            <Column
              header="Pages"
              body={pagesBodyTemplate}
              sortable
              style={{ width: '100px' }}
            />
            <Column field="order" header="Order" sortable style={{ width: '100px' }} />
            <Column
              header="Actions"
              body={(rowData: FumettoDTO) => actionsBodyTemplate(rowData)}
              exportable={false}
              style={{ width: '180px' }}
            />
          </DataTable>
        </TabPanel>

        <TabPanel header={`Deleted Fumetti (${deletedFumetti.length})`}>
          <DataTable
            value={deletedFumetti}
            loading={loading}
            paginator
            rows={10}
            rowsPerPageOptions={[5, 10, 25, 50]}
            tableStyle={{ minWidth: '60rem' }}
            emptyMessage="No deleted fumetti found"
          >
            <Column field="id" header="ID" sortable style={{ width: '80px' }} />
            <Column field="title" header="Title" sortable />
            <Column field="description" header="Description" sortable />
            <Column
              header="Cover Image"
              body={coverImageBodyTemplate}
              style={{ width: '120px' }}
            />
            <Column
              header="Pages"
              body={pagesBodyTemplate}
              sortable
              style={{ width: '100px' }}
            />
            <Column field="order" header="Order" sortable style={{ width: '100px' }} />
            <Column
              header="Actions"
              body={(rowData: FumettoDTO) => actionsBodyTemplate(rowData, true)}
              exportable={false}
              style={{ width: '180px' }}
            />
          </DataTable>
        </TabPanel>
      </TabView>

      <FumettoForm
        visible={showDialog}
        formData={formData}
        isEditing={isEditing}
        onHide={closeDialog}
        onSave={handleSave}
        onChange={(field, value) => updateFormData({ [field]: value })}
      />

      {previewFumetto && (
        <FumettiModal
          fumetto={previewFumetto}
          visible={showPreviewDialog}
          onHide={() => {
            setShowPreviewDialog(false);
            setPreviewFumetto(null);
          }}
        />
      )}
    </div>
  );
}
