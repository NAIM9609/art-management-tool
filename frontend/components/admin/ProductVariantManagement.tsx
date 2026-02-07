import { TabView, TabPanel } from 'primereact/tabview';
import { Tag } from 'primereact/tag';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import ProductImageUpload from '@/components/ProductImageUpload';
import { Product } from '@/services/AdminShopAPIService';

interface VariantData {
  sku: string;
  name: string;
  attributes: string;
  price_adjustment: number;
  stock: number;
}

interface ProductVariantManagementProps {
  product: Product;
  variantData: VariantData;
  onVariantDataChange: (data: VariantData) => void;
  onAddVariant: () => void;
  onUpdateInventory: (variantId: number, quantity: number, operation: 'set' | 'add' | 'subtract') => void;
  onImagesChange: (images: Product['images']) => void;
}

export default function ProductVariantManagement({
  product,
  variantData,
  onVariantDataChange,
  onAddVariant,
  onUpdateInventory,
  onImagesChange,
}: ProductVariantManagementProps) {
  const updateField = (field: keyof VariantData, value: unknown) => {
    onVariantDataChange({ ...variantData, [field]: value });
  };

  return (
    <TabView>
      <TabPanel
        header={
          <span className="flex items-center gap-2">
            <i className="pi pi-images"></i>
            Product Images
            {product.images && product.images.length > 0 && (
              <Tag value={product.images.length} severity="success" />
            )}
          </span>
        }
      >
        <div className="py-4">
          <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
            <div className="flex items-start">
              <i className="pi pi-info-circle text-blue-500 text-xl mr-3 mt-1"></i>
              <div>
                <h4 className="font-semibold text-blue-900 mb-1">Upload Product Images</h4>
                <p className="text-blue-800 text-sm">
                  Upload images from your computer or add image URLs.
                  You can reorder images, add alt text for SEO, and set the display order.
                </p>
              </div>
            </div>
          </div>
          <ProductImageUpload
            productId={product.id}
            images={product.images || []}
            onImagesChange={onImagesChange}
          />
        </div>
      </TabPanel>

      <TabPanel
        header={
          <span className="flex items-center gap-2">
            <i className="pi pi-box"></i>
            Variants & Inventory
            {product.variants && product.variants.length > 0 && (
              <Tag value={product.variants.length} severity="info" />
            )}
          </span>
        }
      >
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Existing Variants</h3>
          {product.variants && product.variants.length > 0 ? (
            <DataTable value={product.variants} className="mb-4">
              <Column field="name" header="Name" />
              <Column field="sku" header="SKU" />
              <Column
                field="price_adjustment"
                header="Price Adjustment"
                body={(rowData) => {
                  const adj = typeof rowData.price_adjustment === 'string' ? parseFloat(rowData.price_adjustment) : rowData.price_adjustment;
                  return `${adj > 0 ? '+' : ''}${adj.toFixed(2)}`;
                }}
              />
              <Column field="stock" header="Stock" />
              <Column
                header="Actions"
                body={(rowData) => (
                  <div className="flex gap-2">
                    <Button
                      icon="pi pi-plus"
                      label="Add 10"
                      size="small"
                      onClick={() => onUpdateInventory(rowData.id, 10, 'add')}
                    />
                    <Button
                      icon="pi pi-minus"
                      label="Remove 10"
                      size="small"
                      severity="warning"
                      onClick={() => onUpdateInventory(rowData.id, 10, 'subtract')}
                    />
                  </div>
                )}
              />
            </DataTable>
          ) : (
            <p className="text-gray-500">No variants added yet</p>
          )}
        </div>
      </TabPanel>

      <TabPanel header="Add New Variant">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Variant Name <span className="text-red-500">*</span>
              </label>
              <InputText
                value={variantData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g., Medium, Blue, etc."
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                SKU <span className="text-red-500">*</span>
              </label>
              <InputText
                value={variantData.sku}
                onChange={(e) => updateField('sku', e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Attributes (JSON)</label>
            <InputTextarea
              value={variantData.attributes}
              onChange={(e) => updateField('attributes', e.target.value)}
              placeholder='{"size": "M", "color": "Blue"}'
              rows={3}
              className="w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Price Adjustment</label>
              <InputNumber
                value={variantData.price_adjustment}
                onValueChange={(e) => updateField('price_adjustment', e.value || 0)}
                mode="decimal"
                minFractionDigits={2}
                maxFractionDigits={2}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Initial Stock</label>
              <InputNumber
                value={variantData.stock}
                onValueChange={(e) => updateField('stock', e.value || 0)}
                className="w-full"
              />
            </div>
          </div>

          <Button
            label="Add Variant"
            icon="pi pi-plus"
            onClick={onAddVariant}
            className="w-full"
          />
        </div>
      </TabPanel>
    </TabView>
  );
}
