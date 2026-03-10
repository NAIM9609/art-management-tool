import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { FumettoDTO } from '@/services/FumettiAPIService';
import OptimizedImage from '@/components/OptimizedImage';

interface FumettoColumnsProps {
  onEdit: (fumetto: FumettoDTO) => void;
  onDelete: (fumetto: FumettoDTO) => void;
  onPreview: (fumetto: FumettoDTO) => void;
  onRestore?: (fumetto: FumettoDTO) => void;
  isDeleted?: boolean;
}

export default function FumettoColumns({
  onEdit,
  onDelete,
  onPreview,
  onRestore,
  isDeleted = false,
}: FumettoColumnsProps) {
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

  const actionsBodyTemplate = (rowData: FumettoDTO) => {
    if (isDeleted) {
      return (
        <div className="flex gap-2">
          <Button
            icon="pi pi-undo"
            className="p-button-rounded p-button-success"
            onClick={() => onRestore?.(rowData)}
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
          onClick={() => onPreview(rowData)}
          tooltip="Preview"
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          icon="pi pi-pencil"
          className="p-button-rounded p-button-warning"
          onClick={() => onEdit(rowData)}
          tooltip="Edit"
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          icon="pi pi-trash"
          className="p-button-rounded p-button-danger"
          onClick={() => onDelete(rowData)}
          tooltip="Delete"
          tooltipOptions={{ position: 'top' }}
        />
      </div>
    );
  };

  return (
    <>
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
        body={actionsBodyTemplate}
        exportable={false}
        style={{ width: '180px' }}
      />
    </>
  );
}
