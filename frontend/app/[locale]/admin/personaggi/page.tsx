'use client';

import { useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { TabView, TabPanel } from 'primereact/tabview';
import { PersonaggioDTO } from '@/services/PersonaggiAPIService';
import PersonaggioPreview from '@/components/PersonaggioPreview';
import { useToast } from '@/hooks/useToast';
import PageHeader from '@/components/admin/PageHeader';
import PersonaggioForm from '@/components/admin/PersonaggioForm';
import { getActivePersonaggioColumns, getDeletedPersonaggioColumns } from '@/components/admin/PersonaggioColumns';
import { usePersonaggioManagement } from '@/hooks/usePersonaggioManagement';

export default function AdminPersonaggiPage() {
  const { toast } = useToast();
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewData, setPreviewData] = useState<Partial<PersonaggioDTO>>({});
  const [activeTab, setActiveTab] = useState(0);

  const {
    personaggi,
    deletedPersonaggi,
    loading,
    showFormDialog,
    setShowFormDialog,
    editingPersonaggio,
    formData,
    setFormData,
    handleCreate,
    handleEdit,
    handleSave,
    handleDelete,
    handleRestore,
  } = usePersonaggioManagement();

  const handlePreview = (personaggio?: PersonaggioDTO) => {
    if (personaggio) {
      setPreviewData({
        name: personaggio.name,
        description: personaggio.description,
        icon: personaggio.icon,
        images: personaggio.images || [],
        backgroundColor: personaggio.backgroundColor,
        backgroundType: personaggio.backgroundType,
        gradientFrom: personaggio.gradientFrom,
        gradientTo: personaggio.gradientTo,
        backgroundImage: personaggio.backgroundImage,
        order: personaggio.order,
      });
    }
    setShowPreviewDialog(true);
  };

  const handleDeleteWithConfirm = (personaggio: PersonaggioDTO) => {
    confirmDialog({
      message: `Are you sure you want to delete "${personaggio.name}"?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      accept: () => handleDelete(personaggio),
    });
  };

  const activeColumns = getActivePersonaggioColumns({
    onPreview: handlePreview,
    onEdit: handleEdit,
    onDelete: handleDeleteWithConfirm,
  });

  const deletedColumns = getDeletedPersonaggioColumns(handleRestore);

  const formDialogFooter = (
    <div>
      <Button label="Cancel" icon="pi pi-times" onClick={() => setShowFormDialog(false)} className="p-button-text" />
      <Button label="Save" icon="pi pi-check" onClick={handleSave} autoFocus />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {toast}
      <ConfirmDialog />

      <PageHeader
        title="Gestione Personaggi"
        subtitle="Manage characters and their properties"
        actions={[{
          label: "Create New Personaggio",
          icon: "pi pi-plus",
          onClick: handleCreate,
          severity: "success" as const
        }]}
      />

      <TabView activeIndex={activeTab} onTabChange={(e) => setActiveTab(e.index)}>
        <TabPanel header={`Active Personaggi (${personaggi.length})`}>
          <DataTable
            value={personaggi}
            loading={loading}
            paginator
            rows={10}
            rowsPerPageOptions={[5, 10, 25, 50]}
            tableStyle={{ maxWidth: '60rem' }}
            emptyMessage="No active personaggi found"
          >
            {activeColumns}
          </DataTable>
        </TabPanel>

        <TabPanel header={`Deleted Personaggi (${deletedPersonaggi.length})`}>
          <DataTable
            value={deletedPersonaggi}
            loading={loading}
            paginator
            rows={10}
            rowsPerPageOptions={[5, 10, 25, 50]}
            tableStyle={{ minWidth: '60rem' }}
            emptyMessage="No deleted personaggi found"
          >
            {deletedColumns}
          </DataTable>
        </TabPanel>
      </TabView>

      <Dialog
        header={editingPersonaggio ? 'Edit Personaggio' : 'Create New Personaggio'}
        visible={showFormDialog}
        style={{ width: '50vw' }}
        onHide={() => setShowFormDialog(false)}
        footer={formDialogFooter}
        draggable={false}
        resizable={false}
      >
        <PersonaggioForm
          formData={formData}
          setFormData={setFormData}
          editingPersonaggio={editingPersonaggio}
        />
      </Dialog>

      <Dialog
        visible={showPreviewDialog}
        onHide={() => setShowPreviewDialog(false)}
        header="Personaggio Preview"
        modal
        style={{ width: '95vw', maxWidth: '1400px' }}
        draggable={false}
        resizable={false}
      >
        <PersonaggioPreview personaggio={previewData} />
      </Dialog>
    </div>
  );
}
