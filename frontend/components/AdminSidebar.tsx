'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useState } from 'react';

interface MenuItem {
  label: string;
  icon: string;
  path: string;
  badge?: number;
}

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems: MenuItem[] = [
    {
      label: 'Personaggi',
      icon: 'pi pi-users',
      path: `/${locale}/admin/personaggi`,
    },
    {
      label: 'Fumetti',
      icon: 'pi pi-book',
      path: `/${locale}/admin/fumetti`,
    },
    {
      label: 'Products',
      icon: 'pi pi-shopping-cart',
      path: `/${locale}/admin/shop-products`,
    },
    {
      label: 'Orders',
      icon: 'pi pi-list',
      path: `/${locale}/admin/shop-orders`,
    },
  ];

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    router.push(`/${locale}/admin/login`);
  };

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <div
      className={`bg-gray-900 text-white h-screen flex flex-col transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-700">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <i className="pi pi-user text-white text-xl"></i>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Admin Panel</h3>
              <p className="text-xs text-gray-400">Art Management</p>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <i className={`pi ${collapsed ? 'pi-angle-right' : 'pi-angle-left'} text-gray-400`}></i>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              <button
                onClick={() => router.push(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all ${
                  isActive(item.path)
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <i className={`${item.icon} text-xl`}></i>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left font-medium">{item.label}</span>
                    {item.badge && (
                      <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-gray-300 hover:bg-red-600 hover:text-white transition-all ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? 'Logout' : undefined}
        >
          <i className="pi pi-sign-out text-xl"></i>
          {!collapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </div>
  );
}
