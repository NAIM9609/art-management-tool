'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { shopAPI, Product } from '@/services/ShopAPIService';
import { PersonaggiAPIService, PersonaggioDTO } from '@/services/PersonaggiAPIService';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Dropdown } from 'primereact/dropdown';
import { Card } from 'primereact/card';
import { Toast } from 'primereact/toast';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import ProdottoModal from '@/components/ProdottoModal';

export default function ShopPage() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const toast = useRef<Toast>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [personaggi, setPersonaggi] = useState<PersonaggioDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPersonaggi, setLoadingPersonaggi] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<{ sort: string; order: string }>({ sort: 'created_at', order: 'DESC' });
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>(undefined);
  const perPage = 12;
  
  useEffect(() => {
    const characterParam = searchParams.get('character_value');
    if (characterParam) {
      setSelectedCharacter(characterParam);
    }
  }, [searchParams]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      console.log('🔄 Fetching products from API...', {
        mode: 'Next.js Proxy',
        endpoint: '/api/shop/products',
        proxiesTo: 'http://giorgiopriviteralab.com:8080/api/shop/products',
      });
      
      const response = await shopAPI.listProducts({
        status: 'published',
        search: searchQuery || undefined,
        character_value: selectedCharacter || undefined,
        sort_by: sortBy.sort,
        sort_order: sortBy.order,
        page,
        per_page: perPage,
        // RIMOSSO: in_stock: true - Ora mostriamo tutti i prodotti published, anche senza stock
      });
      
      console.log('✅ Products fetched successfully:', response);
      setProducts(response.products || []);
      setTotalProducts(response.total || 0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load products';
      console.error('❌ Error fetching products:', error);
      setApiError(errorMessage);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCharacter, sortBy, page, perPage]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    loadPersonaggi();
  }, []);

  const loadPersonaggi = async () => {
    try {
      const data = await PersonaggiAPIService.getAllPersonaggi();
      setPersonaggi(data);
    } catch (error) {
      console.error('Error loading personaggi:', error);
    } finally {
      setLoadingPersonaggi(false);
    }
  };

  const addToCart = async (productId: number) => {
    try {
      await shopAPI.addToCart({
        product_id: productId,
        quantity: 1,
      });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Product added to cart!',
        life: 3000,
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add product to cart',
        life: 3000,
      });
    }
  };

  const sortOptions = [
    { label: 'Newest', value: { sort: 'created_at', order: 'DESC' } },
    { label: 'Price: Low to High', value: { sort: 'base_price', order: 'ASC' } },
    { label: 'Price: High to Low', value: { sort: 'base_price', order: 'DESC' } },
    { label: 'Title', value: { sort: 'title', order: 'ASC' } },
  ];

  const totalPages = Math.ceil(totalProducts / perPage);

  const getStockQuantity = (product: Product): number => {
    if (product.variants && product.variants.length > 0) {
      return product.variants.reduce((sum, v) => sum + v.stock, 0);
    }
    return 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <Toast ref={toast} />
          <div className="flex items-center justify-center h-64">
            <i className="pi pi-spin pi-spinner text-4xl text-blue-600"></i>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Toast ref={toast} />
      
      {/* Filters - Minimale */}
      <div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold mb-6 mx-12" style={{ color: "#EFE0C4" }}>Shop</h1>
          <div className="flex flex-col md:flex-row md:flex-wrap gap-2 md:items-center text-sm mx-12">
            {/* Search */}
            <span className="p-input-icon-left flex-1 w-full md:min-w-[200px]">
              <IconField iconPosition="left">
                  <InputIcon className="pi pi-search"> </InputIcon>
                  <InputText
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setPage(1); // Reset page on search
                      }
                    }}
                    placeholder="Cerca..."
                    className="w-full p-inputtext-sm"
                  />
              </IconField>
            </span>

            <div className="flex gap-2 items-center flex-wrap">
              {/* Character Filter */}
              <Dropdown
                value={selectedCharacter}
                options={[
                  { label: 'Tutti', value: null },
                  ...personaggi.map(p => ({ label: p.name, value: p.name }))
                ]}
                onChange={(e) => setSelectedCharacter(e.value)}
                className="flex-1 md:w-40"
                placeholder="Personaggio"
              />

              {/* Sort */}
              <Dropdown
                value={sortBy}
                options={sortOptions}
                onChange={(e) => setSortBy(e.value)}
                className="flex-1 md:w-36"
              />

              {/* Clear */}
              {(searchQuery || selectedCharacter) && (
                <Button
                  icon="pi pi-times"
                  className="p-button-text p-button-sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCharacter(null);
                    setPage(1);
                  }}
                />
              )}
            </div>

            {/* Results */}
            <span className="w-full md:w-auto md:ml-auto text-right md:text-left" style={{ color: "#EFE0C4" }}>
              {totalProducts} prodotti
            </span>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto md:px-42">
        {products.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
              {products.map((product) => {
                const stockQty = getStockQuantity(product);
                const inStock = stockQty > 0;
                
                return (
                  <div 
                    key={product.id}
                    className="bg-white border border-gray-200 rounded cursor-pointer hover:border-gray-400 transition-all group"
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedProduct(product);
                      setModalVisible(true);
                    }}
                  >
                    {/* Immagine */}
                    <div className="relative bg-gray-50 aspect-square overflow-hidden">
                      {product.images && product.images.length > 0 ? (
                        <>
                          {product.images.length > 1 && (
                            <img
                              src={product.images[1].url}
                              alt={product.title}
                              className="w-full h-full object-cover absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            />
                          )}
                          <img
                            src={product.images[0].url}
                            alt={product.title}
                            className="w-full h-full object-cover absolute inset-0 group-hover:opacity-0 transition-opacity duration-300"
                          />
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <i className="pi pi-image text-4xl text-gray-300"></i>
                        </div>
                      )}
                      {!inStock && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <span className="text-white font-medium text-sm">Esaurito</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Info prodotto */}
                    <div className="p-3">
                      <h3 className="text-sm font-medium text-black line-clamp-2 mb-2 min-h-[2.5rem]">
                        {product.title}
                      </h3>
                      <div className="text-lg font-bold text-black">
                        €{(typeof product.base_price === 'string' ? parseFloat(product.base_price) : product.base_price).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2">
                <Button
                  icon="pi pi-chevron-left"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  outlined
                />
                <span className="px-4 py-2 text-gray-700">
                  Page {page} of {totalPages}
                </span>
                <Button
                  icon="pi pi-chevron-right"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  outlined
                />
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 bg-white rounded-lg shadow-sm">
            <i className="pi pi-inbox text-6xl text-gray-400 mb-4"></i>
            <p className="text-xl text-gray-600">No products available at the moment.</p>
          </div>
        )}
      </main>

      {/* Modal Prodotto */}
      <ProdottoModal 
        visible={modalVisible} 
        onHide={() => {
          setModalVisible(false);
          setSelectedProduct(undefined);
        }}
        prodotto={selectedProduct}
      />
    </div>
  );
}
