import { Column } from 'primereact/column';
import { Button } from 'primereact/button';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: number;
}

interface ProductColumnsProps {
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

export function ProductColumns({ onEdit, onDelete }: ProductColumnsProps) {
  const actionBodyTemplate = (rowData: Product) => {
    return (
      <div className="flex gap-2">
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
  };

  const priceBodyTemplate = (rowData: Product) => {
    const price = typeof rowData.price === 'string' ? parseFloat(rowData.price) : rowData.price;
    return `$${price.toFixed(2)}`;
  };

  const descriptionBodyTemplate = (rowData: Product) => {
    return <div className="max-w-xs truncate">{rowData.description}</div>;
  };

  return (
    <>
      <Column field="id" header="ID" sortable style={{ width: '10%' }} />
      <Column field="name" header="Name" sortable style={{ width: '20%' }} />
      <Column
        field="description"
        header="Description"
        style={{ width: '25%' }}
        body={descriptionBodyTemplate}
      />
      <Column
        field="price"
        header="Price"
        sortable
        style={{ width: '15%' }}
        body={priceBodyTemplate}
      />
      <Column field="stock" header="Stock" sortable style={{ width: '10%' }} />
      <Column
        header="Actions"
        body={actionBodyTemplate}
        style={{ width: '15%' }}
      />
    </>
  );
}
