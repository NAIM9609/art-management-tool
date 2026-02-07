'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { adminShopAPI, Order } from '@/services/AdminShopAPIService';

export default function ShopOrdersManagement() {
  const toast = useRef<Toast>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchEmail, setSearchEmail] = useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('');
  const [filterFulfillmentStatus, setFilterFulfillmentStatus] = useState('');

  const paymentStatusOptions = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Paid', value: 'paid' },
    { label: 'Failed', value: 'failed' },
    { label: 'Refunded', value: 'refunded' },
  ];

  const fulfillmentStatusOptions = [
    { label: 'All', value: '' },
    { label: 'Unfulfilled', value: 'unfulfilled' },
    { label: 'Fulfilled', value: 'fulfilled' },
    { label: 'Partially Fulfilled', value: 'partially_fulfilled' },
  ];

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminShopAPI.listOrders({
        customer_email: searchEmail || undefined,
        payment_status: filterPaymentStatus || undefined,
        fulfillment_status: filterFulfillmentStatus || undefined,
        page,
        per_page: 10,
      });
      setOrders(response.orders || []);
      setTotalRecords(response.total || 0);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load orders',
        life: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [page, searchEmail, filterPaymentStatus, filterFulfillmentStatus]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleViewDetails = async (order: Order) => {
    try {
      const fullOrder = await adminShopAPI.getOrder(order.id);
      setSelectedOrder(fullOrder);
      setShowDetailsDialog(true);
    } catch {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load order details',
        life: 3000,
      });
    }
  };

  const handleUpdateFulfillment = async (
    orderId: number,
    status: 'unfulfilled' | 'fulfilled' | 'partially_fulfilled'
  ) => {
    try {
      await adminShopAPI.updateFulfillmentStatus(orderId, status);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Fulfillment status updated successfully',
        life: 3000,
      });
      fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        const updated = await adminShopAPI.getOrder(orderId);
        setSelectedOrder(updated);
      }
    } catch (error: unknown) {
      console.error('Error updating fulfillment:', error);
      const message = error instanceof Error ? error.message : 'Failed to update fulfillment status';
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: message,
        life: 3000,
      });
    }
  };

  const handleRefund = (order: Order) => {
    confirmDialog({
      message: `Are you sure you want to refund order ${order.order_number}?`,
      header: 'Confirm Refund',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await adminShopAPI.refundOrder(order.id);
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Order refunded successfully',
            life: 3000,
          });
          fetchOrders();
          if (selectedOrder && selectedOrder.id === order.id) {
            setShowDetailsDialog(false);
          }
        } catch (error: unknown) {
          console.error('Error refunding order:', error);
          const message = error instanceof Error ? error.message : 'Failed to refund order';
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: message,
            life: 3000,
          });
        }
      },
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatCurrency = (amount: number | string, currency: string = 'EUR') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `${currency === 'EUR' ? '€' : '$'}${num.toFixed(2)}`;
  };

  const paymentStatusBodyTemplate = (rowData: Order) => {
    const severityMap: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
      paid: 'success',
      pending: 'warning',
      failed: 'danger',
      refunded: 'info',
    };
    return <Tag value={rowData.payment_status} severity={severityMap[rowData.payment_status] || 'info'} />;
  };

  const fulfillmentStatusBodyTemplate = (rowData: Order) => {
    const severityMap: Record<string, 'success' | 'warning' | 'info'> = {
      fulfilled: 'success',
      partially_fulfilled: 'warning',
      unfulfilled: 'info',
    };
    return <Tag value={rowData.fulfillment_status} severity={severityMap[rowData.fulfillment_status] || 'info'} />;
  };

  const totalBodyTemplate = (rowData: Order) => {
    return formatCurrency(rowData.total);
  };

  const dateBodyTemplate = (rowData: Order) => {
    return formatDate(rowData.created_at);
  };

  const actionBodyTemplate = (rowData: Order) => {
    return (
      <div className="flex gap-2">
        <Button
          icon="pi pi-eye"
          rounded
          outlined
          severity="info"
          onClick={() => handleViewDetails(rowData)}
          tooltip="View Details"
        />
        {rowData.payment_status === 'paid' && rowData.fulfillment_status !== 'fulfilled' && (
          <Button
            icon="pi pi-check"
            rounded
            outlined
            severity="success"
            onClick={() => handleUpdateFulfillment(rowData.id, 'fulfilled')}
            tooltip="Mark as Fulfilled"
          />
        )}
        {rowData.payment_status === 'paid' && (
          <Button
            icon="pi pi-refresh"
            rounded
            outlined
            severity="warning"
            onClick={() => handleRefund(rowData)}
            tooltip="Refund Order"
          />
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <Toast ref={toast} />
      <ConfirmDialog />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-black">Shop Orders Management</h1>
          <p className="text-gray-600 mt-1">View and manage customer orders</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Search by Email</label>
          <span className="p-input-icon-left w-full">
            <i className="pi pi-search" />
            <InputText
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="Customer email..."
              className="w-full"
            />
          </span>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Payment Status</label>
          <Dropdown
            value={filterPaymentStatus}
            options={paymentStatusOptions}
            onChange={(e) => setFilterPaymentStatus(e.value)}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Fulfillment Status</label>
          <Dropdown
            value={filterFulfillmentStatus}
            options={fulfillmentStatusOptions}
            onChange={(e) => setFilterFulfillmentStatus(e.value)}
            className="w-full"
          />
        </div>
      </div>

      <DataTable
        value={orders}
        loading={loading}
        paginator
        rows={10}
        totalRecords={totalRecords}
        lazy
        first={(page - 1) * 10}
        onPage={(e) => setPage((e.page || 0) + 1)}
        rowsPerPageOptions={[10, 20, 50]}
        tableStyle={{ minWidth: '60rem' }}
        emptyMessage="No orders found"
      >
        <Column field="order_number" header="Order #" sortable style={{ width: '15%' }} />
        <Column field="customer_email" header="Customer" sortable style={{ width: '20%' }} />
        <Column
          field="total"
          header="Total"
          sortable
          style={{ width: '10%' }}
          body={totalBodyTemplate}
        />
        <Column
          field="payment_status"
          header="Payment"
          sortable
          style={{ width: '12%' }}
          body={paymentStatusBodyTemplate}
        />
        <Column
          field="fulfillment_status"
          header="Fulfillment"
          sortable
          style={{ width: '15%' }}
          body={fulfillmentStatusBodyTemplate}
        />
        <Column
          field="created_at"
          header="Date"
          sortable
          style={{ width: '18%' }}
          body={dateBodyTemplate}
        />
        <Column
          header="Actions"
          style={{ width: '10%' }}
          body={actionBodyTemplate}
        />
      </DataTable>

      <Dialog
        header={`Order Details - ${selectedOrder?.order_number}`}
        visible={showDetailsDialog}
        style={{ width: '70vw' }}
        onHide={() => setShowDetailsDialog(false)}
      >
        {selectedOrder && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-3">Customer Information</h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm text-gray-600">Name:</label>
                    <p className="font-medium">{selectedOrder.customer_name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Email:</label>
                    <p className="font-medium">{selectedOrder.customer_email}</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Order Status</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Payment:</label>
                    <Tag value={selectedOrder.payment_status} severity={
                      selectedOrder.payment_status === 'paid' ? 'success' : 'warning'
                    } />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Fulfillment:</label>
                    <Tag value={selectedOrder.fulfillment_status} severity={
                      selectedOrder.fulfillment_status === 'fulfilled' ? 'success' : 'info'
                    } />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Payment Method:</label>
                    <p className="font-medium">{selectedOrder.payment_method}</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Shipping Address</h3>
              {selectedOrder.shipping_address ? (
                <div className="bg-gray-50 p-4 rounded">
                  <p>{selectedOrder.shipping_address.street}</p>
                  <p>
                    {selectedOrder.shipping_address.city}
                    {selectedOrder.shipping_address.state &&
                      `, ${selectedOrder.shipping_address.state}`}
                    {' '}{selectedOrder.shipping_address.zip_code}
                  </p>
                  <p>{selectedOrder.shipping_address.country}</p>
                </div>
              ) : (
                <p className="text-gray-500 italic">No shipping address provided</p>
              )}
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Order Items</h3>
              <DataTable value={selectedOrder.items}>
                <Column field="product_title" header="Product" />
                <Column field="product_sku" header="SKU" />
                <Column
                  field="variant_name"
                  header="Variant"
                  body={(rowData) => rowData.variant_name || '-'}
                />
                <Column field="quantity" header="Quantity" />
                <Column
                  field="unit_price"
                  header="Unit Price"
                  body={(rowData) => formatCurrency(rowData.unit_price)}
                />
                <Column
                  field="total_price"
                  header="Total"
                  body={(rowData) => formatCurrency(rowData.total_price)}
                />
              </DataTable>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Order Summary</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span className="font-medium">-{formatCurrency(selectedOrder.discount)}</span>
                  </div>
                )}
                {selectedOrder.tax > 0 && (
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span className="font-medium">{formatCurrency(selectedOrder.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-purple-600">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-4 border-t">
              {selectedOrder.payment_status === 'paid' && selectedOrder.fulfillment_status !== 'fulfilled' && (
                <>
                  <Button
                    label="Mark as Fulfilled"
                    icon="pi pi-check"
                    severity="success"
                    onClick={() => handleUpdateFulfillment(selectedOrder.id, 'fulfilled')}
                  />
                  <Button
                    label="Mark as Partially Fulfilled"
                    icon="pi pi-check-circle"
                    severity="warning"
                    onClick={() => handleUpdateFulfillment(selectedOrder.id, 'partially_fulfilled')}
                  />
                </>
              )}
              {selectedOrder.fulfillment_status === 'fulfilled' && (
                <Button
                  label="Mark as Unfulfilled"
                  icon="pi pi-times"
                  severity="info"
                  onClick={() => handleUpdateFulfillment(selectedOrder.id, 'unfulfilled')}
                />
              )}
              {selectedOrder.payment_status === 'paid' && (
                <Button
                  label="Refund Order"
                  icon="pi pi-refresh"
                  severity="danger"
                  outlined
                  onClick={() => handleRefund(selectedOrder)}
                />
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
