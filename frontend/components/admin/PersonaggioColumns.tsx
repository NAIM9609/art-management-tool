'use client';

import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { PersonaggioDTO } from '@/services/PersonaggiAPIService';
import OptimizedImage from '@/components/OptimizedImage';

interface PersonaggioColumnsProps {
  onPreview: (personaggio: PersonaggioDTO) => void;
  onEdit: (personaggio: PersonaggioDTO) => void;
  onDelete: (personaggio: PersonaggioDTO) => void;
}

export const getActivePersonaggioColumns = ({ onPreview, onEdit, onDelete }: PersonaggioColumnsProps) => {
  const actionBodyTemplate = (rowData: PersonaggioDTO) => (
    <div className="flex gap-2">
      <Button
        icon="pi pi-eye"
        rounded
        outlined
        severity="secondary"
        onClick={() => onPreview(rowData)}
        tooltip="Preview"
      />
      <Button
        icon="pi pi-pencil"
        rounded
        outlined
        severity="info"
        onClick={() => onEdit(rowData)}
        tooltip="Edit"
      />
      <Button
        icon="pi pi-trash"
        rounded
        outlined
        severity="danger"
        onClick={() => onDelete(rowData)}
        tooltip="Delete"
      />
    </div>
  );

  const backgroundPreviewTemplate = (rowData: PersonaggioDTO) => {
    const style: React.CSSProperties = {};
    if (rowData.backgroundType === 'gradient' && rowData.gradientFrom && rowData.gradientTo) {
      style.background = `linear-gradient(135deg, ${rowData.gradientFrom}, ${rowData.gradientTo})`;
    } else if (rowData.backgroundColor) {
      style.backgroundColor = rowData.backgroundColor;
    }

    return (
      <div
        className="w-20 h-10 rounded border border-gray-300"
        style={style}
      />
    );
  };

  const iconBodyTemplate = (rowData: PersonaggioDTO) =>
    rowData.icon ? (
      <OptimizedImage
        src={rowData.icon}
        alt={rowData.name}
        width={48}
        height={48}
        imgClassName="object-cover rounded"
      />
    ) : (
      <span className="text-gray-400">No icon</span>
    );

  const descriptionBodyTemplate = (rowData: PersonaggioDTO) => (
    <div className="overflow-hidden text-ellipsis whitespace-nowrap" title={rowData.description}>
      {rowData.description}
    </div>
  );

  return [
    <Column key="id" field="id" header="ID" sortable style={{ width: '5%' }} />,
    <Column key="name" field="name" header="Name" sortable style={{ width: '15%' }} />,
    <Column key="description" field="description" header="Description" style={{ width: '20%' }} body={descriptionBodyTemplate} />,
    <Column key="icon" field="icon" header="Icon" style={{ width: '10%' }} body={iconBodyTemplate} />,
    <Column key="background" field="backgroundType" header="Background" style={{ width: '15%' }} body={backgroundPreviewTemplate} />,
    <Column key="order" field="order" header="Order" sortable style={{ width: '10%' }} />,
    <Column key="actions" header="Actions" body={actionBodyTemplate} style={{ width: '20%' }} />,
  ];
};

export const getDeletedPersonaggioColumns = (onRestore: (personaggio: PersonaggioDTO) => void) => {
  const restoreActionTemplate = (rowData: PersonaggioDTO) => (
    <Button
      icon="pi pi-refresh"
      rounded
      outlined
      severity="success"
      onClick={() => onRestore(rowData)}
      tooltip="Restore"
    />
  );

  const descriptionBodyTemplate = (rowData: PersonaggioDTO) => (
    <div className="overflow-hidden text-ellipsis whitespace-nowrap" title={rowData.description}>
      {rowData.description}
    </div>
  );

  const deletedAtBodyTemplate = (rowData: PersonaggioDTO) => 
    new Date(rowData.deletedAt!).toLocaleString();

  return [
    <Column key="id" field="id" header="ID" sortable style={{ width: '5%' }} />,
    <Column key="name" field="name" header="Name" sortable style={{ width: '20%' }} />,
    <Column key="description" field="description" header="Description" style={{ width: '25%' }} body={descriptionBodyTemplate} />,
    <Column key="deletedAt" field="deletedAt" header="Deleted At" sortable style={{ width: '20%' }} body={deletedAtBodyTemplate} />,
    <Column key="actions" header="Actions" body={restoreActionTemplate} style={{ width: '15%' }} />,
  ];
};
