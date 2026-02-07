'use client';

import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';

interface Order {
  id: string;
  customer_email: string;
  total: number;
  status: string;
  created_at: string;
  items?: OrderItem[];
}

interface OrderItem {
  product_name: string;
  quantity: number;
  price: number;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [globalFilter, setGlobalFilter] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/orders', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setOrders(data || []);
      } else {
        console.error('Failed to fetch orders');
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `$${num.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusSeverity = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'danger';
      default:
        return 'info';
    }
  };

  const statusBodyTemplate = (rowData: Order) => {
    return (
      <Tag value={rowData.status} severity={getStatusSeverity(rowData.status)} />
    );
  };

  const priceBodyTemplate = (rowData: Order) => {
    return formatCurrency(rowData.total);
  };

  const dateBodyTemplate = (rowData: Order) => {
    return formatDate(rowData.created_at);
  };

  const actionBodyTemplate = (rowData: Order) => {
    return (
      <Button
        icon="pi pi-eye"
        rounded
        text
        severity="info"
        onClick={() => {
          setSelectedOrder(rowData);
          setShowDetailsDialog(true);
        }}
      />
    );
  };

  const header = (
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold">All Orders</h2>
      <span className="p-input-icon-left">
        <i className="pi pi-search" />
        <InputText
          type="search"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search orders..."
        />
      </span>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-black">Orders Management</h1>
        <p className="text-gray-600 mt-1">View and manage customer orders</p>
      </div>

      <Card className="shadow-lg">
        <DataTable
          value={orders}
          loading={loading}
          paginator
          rows={10}
          header={header}
          globalFilter={globalFilter}
          emptyMessage="No orders found"
          className="p-datatable-sm"
        >
          <Column field="id" header="Order ID" sortable />
          <Column field="customer_email" header="Customer" sortable />
          <Column field="total" header="Total" body={priceBodyTemplate} sortable />
          <Column field="status" header="Status" body={statusBodyTemplate} sortable />
          <Column field="created_at" header="Date" body={dateBodyTemplate} sortable />
          <Column body={actionBodyTemplate} header="Actions" />
        </DataTable>
      </Card>

      <Dialog
        header="Order Details"
        visible={showDetailsDialog}
        style={{ width: '50vw' }}
        onHide={() => setShowDetailsDialog(false)}
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Order ID</label>
                <p className="font-semibold">{selectedOrder.id}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Customer</label>
                <p className="font-semibold">{selectedOrder.customer_email}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Total</label>
                <p className="font-semibold">{formatCurrency(selectedOrder.total)}</p>
              </div>
              <div>
                <label className="text-sm text-gray-600">Status</label>
                <Tag value={selectedOrder.status} severity={getStatusSeverity(selectedOrder.status)} />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600">Date</label>
                <p className="font-semibold">{formatDate(selectedOrder.created_at)}</p>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
