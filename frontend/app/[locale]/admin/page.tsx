'use client';

import { useEffect, useState } from 'react';
import { Card } from 'primereact/card';
import { Chart } from 'primereact/chart';
import { useLocale } from 'next-intl';

interface Stats {
  totalProducts: number;
  totalOrders: number;
  totalPersonaggi: number;
  totalRevenue: number;
}

interface MonthlySales {
  month: string;
  sales: number;
}

interface Activity {
  type: string;
  description: string;
  time: string;
}

interface DashboardData {
  totalProducts: number;
  totalOrders: number;
  totalPersonaggi: number;
  totalRevenue: number;
  salesData: MonthlySales[];
  recentActivity: Activity[];
}

export default function AdminDashboard() {
  const locale = useLocale();
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalOrders: 0,
    totalPersonaggi: 0,
    totalRevenue: 0,
  });
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const [chartData, setChartData] = useState({
    labels: ['January', 'February', 'March', 'April', 'May', 'June'],
    datasets: [
      {
        label: 'Sales',
        data: [0, 0, 0, 0, 0, 0],
        fill: false,
        borderColor: '#8B5CF6',
        tension: 0.4,
      },
    ],
  });

  const [chartOptions] = useState({
    maintainAspectRatio: false,
    aspectRatio: 0.6,
    plugins: {
      legend: {
        labels: {
          color: '#495057',
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#495057',
        },
        grid: {
          color: '#ebedef',
        },
      },
      y: {
        ticks: {
          color: '#495057',
        },
        grid: {
          color: '#ebedef',
        },
      },
    },
  });

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch('/api/admin/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: DashboardData = await response.json();
        setStats({
          totalProducts: data.totalProducts,
          totalOrders: data.totalOrders,
          totalPersonaggi: data.totalPersonaggi,
          totalRevenue: data.totalRevenue,
        });

        // Update chart data
        if (data.salesData && data.salesData.length > 0) {
          setChartData({
            labels: data.salesData.map((d) => d.month),
            datasets: [
              {
                label: 'Sales',
                data: data.salesData.map((d) => d.sales),
                fill: false,
                borderColor: '#8B5CF6',
                tension: 0.4,
              },
            ],
          });
        }

        // Update recent activity
        if (data.recentActivity) {
          setRecentActivity(data.recentActivity);
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'personaggio':
        return { icon: 'pi pi-users', color: 'purple' };
      case 'product':
        return { icon: 'pi pi-shopping-cart', color: 'blue' };
      case 'order':
        return { icon: 'pi pi-check-circle', color: 'green' };
      default:
        return { icon: 'pi pi-info-circle', color: 'gray' };
    }
  };

  const formatTimeAgo = (timeString: string) => {
    const date = new Date(timeString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };


  const statCards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: 'pi pi-shopping-cart',
      color: 'from-blue-500 to-blue-600',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Total Orders',
      value: stats.totalOrders,
      icon: 'pi pi-list',
      color: 'from-green-500 to-green-600',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Personaggi',
      value: stats.totalPersonaggi,
      icon: 'pi pi-users',
      color: 'from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Total Revenue',
      value: `$${stats.totalRevenue.toFixed(2)}`,
      icon: 'pi pi-dollar',
      color: 'from-orange-500 to-orange-600',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <i className="pi pi-spin pi-spinner text-4xl text-purple-600 mb-4"></i>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-black">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back to the admin panel</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index} className="shadow-lg border-0 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-2">{stat.title}</p>
                <h3 className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</h3>
              </div>
              <div
                className={`w-16 h-16 rounded-full ${stat.bgColor} flex items-center justify-center`}
              >
                <i className={`${stat.icon} text-2xl ${stat.textColor}`}></i>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Sales Overview" className="shadow-lg">
          <Chart type="line" data={chartData} options={chartOptions} style={{ height: '300px' }} />
        </Card>

        <Card title="Quick Actions" className="shadow-lg">
          <div className="space-y-3">
            <button
              onClick={() => (window.location.href = `/${locale}/admin/personaggi`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-users text-2xl"></i>
                <span className="font-medium">Manage Personaggi</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button>
{/* 
            <button
              onClick={() => (window.location.href = `/${locale}/admin/products`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-shopping-cart text-2xl"></i>
                <span className="font-medium">Manage Products (Legacy)</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button> */}

            <button
              onClick={() => (window.location.href = `/${locale}/admin/shop-products`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-shopping-bag text-2xl"></i>
                <span className="font-medium">Shop Products</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button>

            {/* <button
              onClick={() => (window.location.href = `/${locale}/admin/orders`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-list text-2xl"></i>
                <span className="font-medium">View Orders (Legacy)</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button> */}

            <button
              onClick={() => (window.location.href = `/${locale}/admin/shop-orders`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-teal-500 to-green-500 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-box text-2xl"></i>
                <span className="font-medium">Shop Orders</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button>

            <button
              onClick={() => (window.location.href = `/${locale}/admin/notifications`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-bell text-2xl"></i>
                <span className="font-medium">Notifications</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button>

            <button
              onClick={() => (window.location.href = `/${locale}/admin/settings`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-cog text-2xl"></i>
                <span className="font-medium">Settings</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button>

            <button
              onClick={() => (window.location.href = `/${locale}/admin/etsy-sync`)}
              className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <div className="flex items-center gap-3">
                <i className="pi pi-sync text-2xl"></i>
                <span className="font-medium">Etsy Sync</span>
              </div>
              <i className="pi pi-arrow-right"></i>
            </button>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card title="Recent Activity" className="shadow-lg">
        <div className="space-y-4">
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <i className="pi pi-inbox text-4xl mb-2"></i>
              <p>No recent activity</p>
            </div>
          ) : (
            recentActivity.map((activity, index) => {
              const { icon, color } = getActivityIcon(activity.type);
              return (
                <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                  <div
                    className={`w-10 h-10 rounded-full bg-${color}-100 flex items-center justify-center`}
                  >
                    <i className={`${icon} text-${color}-600`}></i>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{activity.description}</p>
                    <p className="text-sm text-gray-500">{formatTimeAgo(activity.time)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
