import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { DiscountDTO } from '@/services/DiscountAPIService';

export function getDiscountColumns(
  onEdit: (discount: DiscountDTO) => void,
  onDelete: (discount: DiscountDTO) => void
) {
  const codeBodyTemplate = (rowData: DiscountDTO) => {
    return <span className="font-mono font-bold">{rowData.code}</span>;
  };

  const typeBodyTemplate = (rowData: DiscountDTO) => {
    return rowData.type === 'percentage' ? 'Percentage' : 'Fixed Amount';
  };

  const valueBodyTemplate = (rowData: DiscountDTO) => {
    return rowData.type === 'percentage' 
      ? `${rowData.value}%` 
      : `€${(typeof rowData.value === 'string' ? parseFloat(rowData.value) : rowData.value).toFixed(2)}`;
  };

  const statusBodyTemplate = (rowData: DiscountDTO) => {
    const now = new Date();
    let status = 'inactive';
    let severity: 'success' | 'warning' | 'danger' | 'info' = 'danger';

    if (!rowData.active) {
      status = 'Inactive';
      severity = 'danger';
    } else if (rowData.starts_at && new Date(rowData.starts_at) > now) {
      status = 'Scheduled';
      severity = 'info';
    } else if (rowData.expires_at && new Date(rowData.expires_at) < now) {
      status = 'Expired';
      severity = 'warning';
    } else if (rowData.max_uses && rowData.used_count && rowData.used_count >= rowData.max_uses) {
      status = 'Used Up';
      severity = 'warning';
    } else {
      status = 'Active';
      severity = 'success';
    }

    return <Tag value={status} severity={severity} />;
  };

  const usageBodyTemplate = (rowData: DiscountDTO) => {
    if (!rowData.max_uses) return <span className="text-gray-500">Unlimited</span>;
    return `${rowData.used_count || 0} / ${rowData.max_uses}`;
  };

  const expiryBodyTemplate = (rowData: DiscountDTO) => {
    if (!rowData.expires_at) return <span className="text-gray-500">No expiry</span>;
    return new Date(rowData.expires_at).toLocaleDateString();
  };

  const actionsBodyTemplate = (rowData: DiscountDTO) => {
    return (
      <div className="flex gap-2">
        <Button
          icon="pi pi-pencil"
          className="p-button-rounded p-button-text p-button-info"
          onClick={() => onEdit(rowData)}
          tooltip="Edit"
        />
        <Button
          icon="pi pi-trash"
          className="p-button-rounded p-button-text p-button-danger"
          onClick={() => onDelete(rowData)}
          tooltip="Delete"
        />
      </div>
    );
  };

  return [
    <Column key="code" field="code" header="Code" body={codeBodyTemplate} sortable />,
    <Column key="type" header="Type" body={typeBodyTemplate} />,
    <Column key="value" header="Value" body={valueBodyTemplate} />,
    <Column 
      key="min_purchase" 
      field="min_purchase" 
      header="Min Purchase" 
      body={(data) => data.min_purchase ? `€${data.min_purchase}` : '—'} 
    />,
    <Column key="usage" header="Usage" body={usageBodyTemplate} />,
    <Column key="expires" header="Expires" body={expiryBodyTemplate} />,
    <Column key="status" header="Status" body={statusBodyTemplate} />,
    <Column key="actions" header="Actions" body={actionsBodyTemplate} style={{ width: '120px' }} />,
  ];
}
