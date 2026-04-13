'use client';

import { useState } from 'react';
import { DataTable } from 'primereact/datatable';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { useToast } from '@/hooks/useToast';
import { useFormDialog } from '@/hooks/useFormDialog';
import { useDataTable } from '@/hooks/useDataTable';
import PageHeader from '@/components/admin/PageHeader';
import FormDialog from '@/components/admin/FormDialog';
import { ProductForm } from '@/components/admin/ProductForm';
import { ProductColumns } from '@/components/admin/ProductColumns';
import { getApiBaseUrl } from '@/services/apiUtils';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  stock: number;
}

const initialFormData = {
  name: '',
  description: '',
  price: 0,
  image_url: '',
  stock: 0,
};

export default function ProductsManagement() {
  const apiBaseUrl = getApiBaseUrl();
  const { toast, showSuccess, showError } = useToast();
  const { showDialog, formData, isEditing, editingItem, openDialog, closeDialog, setFormData } = 
    useFormDialog<typeof initialFormData>(initialFormData);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const { items: products, loading, refresh } = useDataTable<Product>({
    fetchData: async () => {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${apiBaseUrl}/api/admin/shop/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch products: ${errorText || response.statusText}`);
      }
      
      const data = await response.json();
      // Backend returns { products: [...], total: ..., page: ..., per_page: ... }
      return { 
        items: data?.products || [], 
        total: data?.total || 0 
      };
    },
  });

  const handleCreate = () => {
    setEditingProduct(null);
    openDialog(initialFormData);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    openDialog({
      name: product.name,
      description: product.description,
      price: product.price,
      image_url: product.image_url,
      stock: product.stock,
    } as any);
  };

  const handleSave = async () => {
    if (!formData.name) {
      showError('Name is required');
      return;
    }

    const token = localStorage.getItem('adminToken');
    try {
      const url = editingProduct
        ? `${apiBaseUrl}/api/admin/shop/products/${editingProduct.id}`
        : `${apiBaseUrl}/api/admin/shop/products`;
      
      const response = await fetch(url, {
        method: editingProduct ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        showSuccess(`Product ${isEditing ? 'updated' : 'created'} successfully`);
        closeDialog();
        refresh();
      } else {
        showError('Failed to save product');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      showError('Failed to save product');
    }
  };

  const handleDelete = (product: Product) => {
    confirmDialog({
      message: `Are you sure you want to delete "${product.name}"?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        const token = localStorage.getItem('adminToken');
        try {
          const response = await fetch(`${apiBaseUrl}/api/admin/shop/products/${product.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete product: ${errorText || response.statusText}`);
          }
          showSuccess('Product deleted successfully');
          refresh();
        } catch (error) {
          console.error('Error deleting product:', error);
          showError('Failed to delete product');
        }
      },
    });
  };

  return (
    <div className="p-6 space-y-6">
      {toast}
      <ConfirmDialog />

      <PageHeader
        title="Products Management"
        subtitle="Manage your product catalog"
        actions={[
          {
            label: 'Create New Product',
            icon: 'pi pi-plus',
            onClick: handleCreate,
            severity: 'success',
          },
        ]}
      />

      <DataTable
        value={products}
        loading={loading}
        paginator
        rows={10}
        rowsPerPageOptions={[5, 10, 25, 50]}
        tableStyle={{ minWidth: '60rem' }}
        emptyMessage="No products found"
      >
        <ProductColumns onEdit={handleEdit} onDelete={handleDelete} />
      </DataTable>

      <FormDialog
        visible={showDialog}
        title={isEditing ? 'Edit Product' : 'Create New Product'}
        onHide={closeDialog}
        onSave={handleSave}
      >
        <ProductForm formData={formData} onChange={setFormData} />
      </FormDialog>
    </div>
  );
}
