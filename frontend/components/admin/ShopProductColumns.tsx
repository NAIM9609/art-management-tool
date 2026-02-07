import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { Column } from 'primereact/column';
import { Product } from '@/services/AdminShopAPIService';

interface ShopProductColumnsProps {
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onManageVariants: (product: Product) => void;
}

export const statusBodyTemplate = (rowData: Product) => {
  const severity = rowData.status === 'published' ? 'success' : rowData.status === 'draft' ? 'warning' : 'danger';
  return <Tag value={rowData.status} severity={severity} />;
};

export const priceBodyTemplate = (rowData: Product) => {
  const price = typeof rowData.base_price === 'string' ? parseFloat(rowData.base_price) : rowData.base_price;
  return `${rowData.currency === 'EUR' ? '€' : '$'}${price.toFixed(2)}`;
};

export const stockBodyTemplate = (rowData: Product) => {
  const totalStock = rowData.variants?.reduce((sum, v) => sum + v.stock, 0) || 0;
  const severity = totalStock > 10 ? 'success' : totalStock > 0 ? 'warning' : 'danger';
  return <Tag value={`${totalStock} units`} severity={severity} />;
};

export const imagesBodyTemplate = (rowData: Product) => {
  const imageCount = rowData.images?.length || 0;
  const severity = imageCount > 0 ? 'success' : 'warning';
  return (
    <div className="flex items-center gap-2">
      <Tag value={`${imageCount} ${imageCount === 1 ? 'image' : 'images'}`} severity={severity} />
      {imageCount === 0 && (
        <i className="pi pi-exclamation-triangle text-orange-500" title="No images uploaded"></i>
      )}
    </div>
  );
};

export const createActionBodyTemplate = ({ onEdit, onDelete, onManageVariants }: ShopProductColumnsProps) => {
  const ActionBodyTemplate = (rowData: Product) => (
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
        icon="pi pi-images"
        rounded
        outlined
        severity="success"
        onClick={() => onManageVariants(rowData)}
        tooltip="Manage Images & Variants"
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
  
  return ActionBodyTemplate;
};

export function getShopProductColumns(props: ShopProductColumnsProps) {
  const actionBodyTemplate = createActionBodyTemplate(props);
  
  return [
    <Column key="id" field="id" header="ID" sortable style={{ width: '5%' }} />,
    <Column key="title" field="title" header="Title" sortable style={{ width: '20%' }} />,
    <Column key="sku" field="sku" header="SKU" style={{ width: '10%' }} />,
    <Column
      key="short_description"
      field="short_description"
      header="Description"
      style={{ width: '20%' }}
      body={(rowData: Product) => (
        <div className="max-w-xs truncate">{rowData.short_description}</div>
      )}
    />,
    <Column
      key="base_price"
      field="base_price"
      header="Base Price"
      sortable
      style={{ width: '10%' }}
      body={priceBodyTemplate}
    />,
    <Column
      key="status"
      field="status"
      header="Status"
      sortable
      style={{ width: '10%' }}
      body={statusBodyTemplate}
    />,
    <Column
      key="stock"
      header="Stock"
      style={{ width: '8%' }}
      body={stockBodyTemplate}
    />,
    <Column
      key="images"
      header="Images"
      style={{ width: '10%' }}
      body={imagesBodyTemplate}
    />,
    <Column
      key="actions"
      header="Actions"
      style={{ width: '15%' }}
      body={actionBodyTemplate}
    />,
  ];
}
