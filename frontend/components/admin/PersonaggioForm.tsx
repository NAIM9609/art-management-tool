'use client';

import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import ImageUpload from '@/components/ImageUpload';
import { PersonaggioDTO } from '@/services/PersonaggiAPIService';

interface PersonaggioFormProps {
  formData: Partial<PersonaggioDTO>;
  setFormData: (data: Partial<PersonaggioDTO>) => void;
  editingPersonaggio: PersonaggioDTO | null;
}

const backgroundTypeOptions = [
  { label: 'Solid Color', value: 'solid' },
  { label: 'Gradient', value: 'gradient' },
  { label: 'Image', value: 'image' },
];

export default function PersonaggioForm({
  formData,
  setFormData,
  editingPersonaggio,
}: PersonaggioFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="font-semibold">
          Name *
        </label>
        <InputText
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter name"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="description" className="font-semibold">
          Description
        </label>
        <InputTextarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={5}
          placeholder="Enter description"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="icon" className="font-semibold">
          Icon URL
        </label>
        <InputText
          id="icon"
          value={formData.icon}
          onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
          placeholder="Enter icon URL"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="order" className="font-semibold">
          Order
        </label>
        <InputNumber
          id="order"
          value={formData.order}
          onValueChange={(e) => setFormData({ ...formData, order: e.value || 0 })}
          placeholder="Display order"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="backgroundType" className="font-semibold">
          Background Type
        </label>
        <Dropdown
          id="backgroundType"
          value={formData.backgroundType}
          options={backgroundTypeOptions}
          onChange={(e) => setFormData({ ...formData, backgroundType: e.value })}
          placeholder="Select background type"
        />
      </div>

      {formData.backgroundType === 'solid' ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="backgroundColor" className="font-semibold">
            Background Color
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              id="backgroundColor"
              value={formData.backgroundColor}
              onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
              className="h-10 w-20 rounded border"
            />
            <InputText
              value={formData.backgroundColor}
              onChange={(e) => setFormData({ ...formData, backgroundColor: e.target.value })}
              placeholder="#E0E7FF"
            />
          </div>
        </div>
      ) : formData.backgroundType === 'gradient' ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="gradientFrom" className="font-semibold">
              Gradient From
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                id="gradientFrom"
                value={formData.gradientFrom}
                onChange={(e) => setFormData({ ...formData, gradientFrom: e.target.value })}
                className="h-10 w-20 rounded border"
              />
              <InputText
                value={formData.gradientFrom}
                onChange={(e) => setFormData({ ...formData, gradientFrom: e.target.value })}
                placeholder="#FF0000"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="gradientTo" className="font-semibold">
              Gradient To
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                id="gradientTo"
                value={formData.gradientTo}
                onChange={(e) => setFormData({ ...formData, gradientTo: e.target.value })}
                className="h-10 w-20 rounded border"
              />
              <InputText
                value={formData.gradientTo}
                onChange={(e) => setFormData({ ...formData, gradientTo: e.target.value })}
                placeholder="#0000FF"
              />
            </div>
          </div>
        </>
      ) : formData.backgroundType === 'image' ? (
        <ImageUpload
          label="Background Image"
          images={formData.backgroundImage ? [formData.backgroundImage] : []}
          onImagesChange={(images) => setFormData({ ...formData, backgroundImage: images[0] || '' })}
          maxImages={1}
          type="background"
          uploadEntity="personaggi"
          personaggioId={editingPersonaggio?.id}
        />
      ) : null}

      <ImageUpload
        label="Icon Image"
        images={formData.icon ? [formData.icon] : []}
        onImagesChange={(images) => setFormData({ ...formData, icon: images[0] || '' })}
        maxImages={1}
        type="icon"
        uploadEntity="personaggi"
        personaggioId={editingPersonaggio?.id}
      />

      <ImageUpload
        label="Gallery Images"
        images={formData.images || []}
        onImagesChange={(images) => setFormData({ ...formData, images })}
        maxImages={10}
        type="gallery"
        uploadEntity="personaggi"
        personaggioId={editingPersonaggio?.id}
      />

      <div className="flex flex-col gap-2">
        <label className="font-semibold">Preview</label>
        <div
          className="w-full h-32 rounded border border-gray-300"
          style={
            formData.backgroundType === 'gradient' && formData.gradientFrom && formData.gradientTo
              ? { background: `linear-gradient(135deg, ${formData.gradientFrom}, ${formData.gradientTo})` }
              : formData.backgroundType === 'image' && formData.backgroundImage
              ? { backgroundImage: `url(${formData.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : { backgroundColor: formData.backgroundColor }
          }
        />
      </div>
    </div>
  );
}
