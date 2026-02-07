import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { Button } from 'primereact/button';
import { FumettoDTO } from '@/services/FumettiAPIService';
import ImageUpload from '@/components/ImageUpload';
import { TabView, TabPanel } from 'primereact/tabview';

interface FumettoFormProps {
  visible: boolean;
  formData: Partial<FumettoDTO>;
  isEditing: boolean;
  onHide: () => void;
  onSave: () => void;
  onChange: (field: keyof FumettoDTO, value: string | string[] | number | null) => void;
  onSaveForUpload: () => Promise<number | undefined>;
  onSaveAfterUpload: () => Promise<void>;
}

export default function FumettoForm({
  visible,
  formData,
  isEditing,
  onHide,
  onSave,
  onChange,
  onSaveForUpload,
  onSaveAfterUpload,
}: FumettoFormProps) {
  const dialogFooter = (
    <div>
      <Button label="Cancel" icon="pi pi-times" onClick={onHide} className="p-button-text" />
      <Button label="Save" icon="pi pi-check" onClick={onSave} autoFocus />
    </div>
  );

  return (
    <Dialog
      visible={visible}
      style={{ width: '800px' }}
      header={isEditing ? 'Edit Fumetto' : 'Create New Fumetto'}
      modal
      className="p-fluid"
      footer={dialogFooter}
      onHide={onHide}
    >
      <TabView>
        <TabPanel header="Details">
          <div className="formgrid grid">
            <div className="field col-12">
              <label htmlFor="title">Title *</label>
              <InputText
                id="title"
                value={formData.title || ''}
                onChange={(e) => onChange('title', e.target.value)}
                required
              />
            </div>

            <div className="field col-12">
              <label htmlFor="description">Description</label>
              <InputTextarea
                id="description"
                value={formData.description || ''}
                onChange={(e) => onChange('description', e.target.value)}
                rows={4}
              />
            </div>

            <div className="field col-12 md:col-6">
              <label htmlFor="order">Order</label>
              <InputNumber
                id="order"
                value={formData.order || 0}
                onValueChange={(e) => onChange('order', e.value || 0)}
                min={0}
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel header="Cover Image">
          <div className="field col-12">
            <label>Cover Image</label>
            <ImageUpload
              label="Upload Cover Image"
              images={formData.coverImage ? [formData.coverImage] : []}
              onImagesChange={(images) => onChange('coverImage', images[0] || '')}
              maxImages={1}
              type="cover"
              fumettoId={formData.id}
              onSaveRequired={onSaveForUpload}
              onUploadComplete={onSaveAfterUpload}
            />
          </div>
        </TabPanel>

        <TabPanel header="Pages">
          <div className="field col-12">
            <label>Comic Pages</label>
            <ImageUpload
              label="Upload Comic Pages"
              images={formData.pages || []}
              onImagesChange={(images) => onChange('pages', images)}
              maxImages={50}
              type="page"
              fumettoId={formData.id}
              onSaveRequired={onSaveForUpload}
              onUploadComplete={onSaveAfterUpload}
            />
          </div>
        </TabPanel>
      </TabView>
    </Dialog>
  );
}
