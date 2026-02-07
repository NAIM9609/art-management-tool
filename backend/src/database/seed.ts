import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './connection';
import { Category } from '../entities/Category';
import { EnhancedProduct, ProductStatus } from '../entities/EnhancedProduct';
import { ProductImage } from '../entities/ProductImage';
import { ProductVariant } from '../entities/ProductVariant';
import { Personaggio } from '../entities/Personaggio';
import { Fumetto } from '../entities/Fumetto';
import { Order, PaymentStatus, FulfillmentStatus } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { Notification, NotificationType } from '../entities/Notification';
import { DiscountCode, DiscountType } from '../entities/DiscountCode';
import { AuditLog } from '../entities/AuditLog';

async function seed() {
  console.log('🌱 Starting database seed...\n');

  await initializeDatabase();

  // ==================== CATEGORIES ====================
  console.log('📁 Seeding categories...');
  const categoryRepo = AppDataSource.getRepository(Category);

  const artPrints = categoryRepo.create({ name: 'Art Prints', slug: 'art-prints', description: 'High-quality art prints on premium paper' });
  const originals = categoryRepo.create({ name: 'Original Art', slug: 'original-art', description: 'One-of-a-kind original artworks' });
  const comics = categoryRepo.create({ name: 'Comics', slug: 'comics', description: 'Comic books and graphic novels' });
  const merchandise = categoryRepo.create({ name: 'Merchandise', slug: 'merchandise', description: 'T-shirts, mugs, stickers and more' });
  const stickers = categoryRepo.create({ name: 'Stickers', slug: 'stickers', description: 'Vinyl and paper stickers', parent: merchandise });

  await categoryRepo.save([artPrints, originals, comics, merchandise]);
  stickers.parent_id = merchandise.id;
  await categoryRepo.save(stickers);
  console.log(`  ✓ ${5} categories created`);

  // ==================== PRODUCTS ====================
  console.log('🛒 Seeding products...');
  const productRepo = AppDataSource.getRepository(EnhancedProduct);
  const imageRepo = AppDataSource.getRepository(ProductImage);
  const variantRepo = AppDataSource.getRepository(ProductVariant);

  const product1 = productRepo.create({
    slug: 'jungle-fever-print-a3',
    title: 'Jungle Fever — A3 Art Print',
    short_description: 'Vibrant jungle-themed illustration printed on 300gsm matte paper',
    long_description: 'A stunning A3-sized art print featuring the iconic Jungle Fever design. Printed on 300gsm acid-free matte paper with archival inks for long-lasting color vibrancy. Each print is hand-signed by the artist.',
    base_price: 25.00,
    currency: 'EUR',
    sku: 'JF-PRINT-A3',
    status: ProductStatus.PUBLISHED,
    categories: [artPrints],
  });

  const product2 = productRepo.create({
    slug: 'cosmic-dream-original',
    title: 'Cosmic Dream — Original Painting',
    short_description: 'Acrylic on canvas, 50x70cm',
    long_description: 'An original acrylic painting on stretched canvas. This one-of-a-kind piece features swirling cosmic colors and dreamy textures. Certificate of authenticity included.',
    base_price: 450.00,
    currency: 'EUR',
    sku: 'CD-ORIG-001',
    status: ProductStatus.PUBLISHED,
    categories: [originals],
  });

  const product3 = productRepo.create({
    slug: 'neon-city-sticker-pack',
    title: 'Neon City — Sticker Pack (5 pcs)',
    short_description: 'Set of 5 waterproof vinyl stickers',
    long_description: 'A pack of 5 die-cut vinyl stickers featuring characters from the Neon City series. Waterproof and UV-resistant, perfect for laptops, water bottles, and notebooks.',
    base_price: 8.50,
    currency: 'EUR',
    sku: 'NC-STICKER-5PK',
    status: ProductStatus.PUBLISHED,
    categories: [merchandise, stickers],
  });

  const product4 = productRepo.create({
    slug: 'urban-legends-comic-vol1',
    title: 'Urban Legends — Volume 1',
    short_description: 'First volume of the Urban Legends comic series, 48 pages',
    long_description: 'The first volume of the Urban Legends comic series. 48 full-color pages telling the story of street art coming alive in a fictional Italian city. Softcover, A4 format.',
    base_price: 15.00,
    currency: 'EUR',
    sku: 'UL-COMIC-V1',
    status: ProductStatus.PUBLISHED,
    categories: [comics],
  });

  const product5 = productRepo.create({
    slug: 'abstract-flow-canvas',
    title: 'Abstract Flow — Canvas Print',
    short_description: 'Gallery-wrapped canvas print, 40x60cm',
    long_description: 'A gallery-wrapped canvas print featuring abstract flowing shapes in warm earth tones. Ready to hang, no framing needed. Printed with fade-resistant inks.',
    base_price: 65.00,
    currency: 'EUR',
    sku: 'AF-CANVAS-4060',
    status: ProductStatus.DRAFT,
    categories: [artPrints],
  });

  await productRepo.save([product1, product2, product3, product4, product5]);
  console.log(`  ✓ ${5} products created`);

  // ==================== PRODUCT IMAGES ====================
  console.log('🖼️  Seeding product images...');
  const images = [
    // Product 1 images
    imageRepo.create({ product_id: product1.id, url: 'https://picsum.photos/seed/jf1/800/800', alt_text: 'Jungle Fever front view', position: 0 }),
    imageRepo.create({ product_id: product1.id, url: 'https://picsum.photos/seed/jf2/800/800', alt_text: 'Jungle Fever detail', position: 1 }),
    imageRepo.create({ product_id: product1.id, url: 'https://picsum.photos/seed/jf3/800/800', alt_text: 'Jungle Fever framed', position: 2 }),
    // Product 2 images
    imageRepo.create({ product_id: product2.id, url: 'https://picsum.photos/seed/cd1/800/800', alt_text: 'Cosmic Dream full view', position: 0 }),
    imageRepo.create({ product_id: product2.id, url: 'https://picsum.photos/seed/cd2/800/800', alt_text: 'Cosmic Dream close-up', position: 1 }),
    // Product 3 images
    imageRepo.create({ product_id: product3.id, url: 'https://picsum.photos/seed/nc1/800/800', alt_text: 'Neon City sticker pack', position: 0 }),
    // Product 4 images
    imageRepo.create({ product_id: product4.id, url: 'https://picsum.photos/seed/ul1/800/800', alt_text: 'Urban Legends cover', position: 0 }),
    imageRepo.create({ product_id: product4.id, url: 'https://picsum.photos/seed/ul2/800/800', alt_text: 'Urban Legends page spread', position: 1 }),
    // Product 5 images
    imageRepo.create({ product_id: product5.id, url: 'https://picsum.photos/seed/af1/800/800', alt_text: 'Abstract Flow canvas', position: 0 }),
  ];
  await imageRepo.save(images);
  console.log(`  ✓ ${images.length} product images created`);

  // ==================== PRODUCT VARIANTS ====================
  console.log('📦 Seeding product variants...');
  const variants = [
    // Product 1 — size variants
    variantRepo.create({ product_id: product1.id, sku: 'JF-PRINT-A3-STD', name: 'Standard (no frame)', attributes: { frame: 'none' }, price_adjustment: 0, stock: 50 }),
    variantRepo.create({ product_id: product1.id, sku: 'JF-PRINT-A3-WHT', name: 'White Frame', attributes: { frame: 'white' }, price_adjustment: 15, stock: 20 }),
    variantRepo.create({ product_id: product1.id, sku: 'JF-PRINT-A3-BLK', name: 'Black Frame', attributes: { frame: 'black' }, price_adjustment: 15, stock: 18 }),
    // Product 2 — single variant (original)
    variantRepo.create({ product_id: product2.id, sku: 'CD-ORIG-001-DEF', name: 'Original (unframed)', attributes: { size: '50x70cm' }, price_adjustment: 0, stock: 1 }),
    // Product 3 — sticker variants
    variantRepo.create({ product_id: product3.id, sku: 'NC-STICKER-5PK-STD', name: 'Matte Finish', attributes: { finish: 'matte' }, price_adjustment: 0, stock: 100 }),
    variantRepo.create({ product_id: product3.id, sku: 'NC-STICKER-5PK-GLS', name: 'Glossy Finish', attributes: { finish: 'glossy' }, price_adjustment: 1.50, stock: 75 }),
    // Product 4 — comic language variants
    variantRepo.create({ product_id: product4.id, sku: 'UL-COMIC-V1-IT', name: 'Italian Edition', attributes: { language: 'italian' }, price_adjustment: 0, stock: 30 }),
    variantRepo.create({ product_id: product4.id, sku: 'UL-COMIC-V1-EN', name: 'English Edition', attributes: { language: 'english' }, price_adjustment: 0, stock: 25 }),
  ];
  await variantRepo.save(variants);
  console.log(`  ✓ ${variants.length} product variants created`);

  // ==================== PERSONAGGI ====================
  console.log('🎭 Seeding personaggi...');
  const personaggioRepo = AppDataSource.getRepository(Personaggio);
  const personaggi = [
    personaggioRepo.create({
      name: 'Luna',
      description: 'A mysterious night wanderer who harnesses moonlight. Luna moves silently through the city, painting murals that glow under UV light.',
      icon: 'https://picsum.photos/seed/luna-icon/200/200',
      images: ['https://picsum.photos/seed/luna1/600/800', 'https://picsum.photos/seed/luna2/600/800', 'https://picsum.photos/seed/luna3/600/800'],
      backgroundColor: '#1E1B4B',
      backgroundType: 'gradient',
      gradientFrom: '#1E1B4B',
      gradientTo: '#7C3AED',
      order: 0,
    }),
    personaggioRepo.create({
      name: 'Fuoco',
      description: 'A fiery spirit born from the volcanic soil of Sicily. Fuoco creates art using heat and ash, leaving temporary masterpieces that fade with the wind.',
      icon: 'https://picsum.photos/seed/fuoco-icon/200/200',
      images: ['https://picsum.photos/seed/fuoco1/600/800', 'https://picsum.photos/seed/fuoco2/600/800'],
      backgroundColor: '#DC2626',
      backgroundType: 'gradient',
      gradientFrom: '#DC2626',
      gradientTo: '#F59E0B',
      order: 1,
    }),
    personaggioRepo.create({
      name: 'Verde',
      description: 'The guardian of urban gardens. Covered in vines and flowers, Verde brings nature back to the concrete jungle, one rooftop at a time.',
      icon: 'https://picsum.photos/seed/verde-icon/200/200',
      images: ['https://picsum.photos/seed/verde1/600/800', 'https://picsum.photos/seed/verde2/600/800', 'https://picsum.photos/seed/verde3/600/800', 'https://picsum.photos/seed/verde4/600/800'],
      backgroundColor: '#166534',
      backgroundType: 'solid',
      order: 2,
    }),
    personaggioRepo.create({
      name: 'Onda',
      description: 'A fluid shapeshifter from the coast of Liguria. Onda creates sculptures from sea glass and driftwood, telling stories of the Mediterranean.',
      icon: 'https://picsum.photos/seed/onda-icon/200/200',
      images: ['https://picsum.photos/seed/onda1/600/800'],
      backgroundColor: '#0284C7',
      backgroundType: 'gradient',
      gradientFrom: '#0284C7',
      gradientTo: '#67E8F9',
      order: 3,
    }),
  ];
  await personaggioRepo.save(personaggi);
  console.log(`  ✓ ${personaggi.length} personaggi created`);

  // ==================== FUMETTI ====================
  console.log('📖 Seeding fumetti...');
  const fumettoRepo = AppDataSource.getRepository(Fumetto);
  const fumetti = [
    fumettoRepo.create({
      title: 'Urban Legends: Chapter 1 — The Awakening',
      description: 'The first chapter of Urban Legends. A street artist discovers that their paintings have come alive overnight, and the city will never be the same.',
      coverImage: 'https://picsum.photos/seed/ul-ch1-cover/400/600',
      pages: [
        'https://picsum.photos/seed/ul-ch1-p1/800/1200',
        'https://picsum.photos/seed/ul-ch1-p2/800/1200',
        'https://picsum.photos/seed/ul-ch1-p3/800/1200',
        'https://picsum.photos/seed/ul-ch1-p4/800/1200',
        'https://picsum.photos/seed/ul-ch1-p5/800/1200',
        'https://picsum.photos/seed/ul-ch1-p6/800/1200',
      ],
      order: 0,
    }),
    fumettoRepo.create({
      title: 'Urban Legends: Chapter 2 — Neon Nights',
      description: 'The story continues as Luna and Fuoco join forces to uncover a conspiracy threatening the city\'s creative underground.',
      coverImage: 'https://picsum.photos/seed/ul-ch2-cover/400/600',
      pages: [
        'https://picsum.photos/seed/ul-ch2-p1/800/1200',
        'https://picsum.photos/seed/ul-ch2-p2/800/1200',
        'https://picsum.photos/seed/ul-ch2-p3/800/1200',
        'https://picsum.photos/seed/ul-ch2-p4/800/1200',
      ],
      order: 1,
    }),
    fumettoRepo.create({
      title: 'Jungle Fever: Origins',
      description: 'A standalone illustrated short story exploring the tropical world that inspired the Jungle Fever art series.',
      coverImage: 'https://picsum.photos/seed/jf-origins-cover/400/600',
      pages: [
        'https://picsum.photos/seed/jf-orig-p1/800/1200',
        'https://picsum.photos/seed/jf-orig-p2/800/1200',
        'https://picsum.photos/seed/jf-orig-p3/800/1200',
      ],
      order: 2,
    }),
  ];
  await fumettoRepo.save(fumetti);
  console.log(`  ✓ ${fumetti.length} fumetti created`);

  // ==================== DISCOUNT CODES ====================
  console.log('🏷️  Seeding discount codes...');
  const discountRepo = AppDataSource.getRepository(DiscountCode);
  const discounts = [
    discountRepo.create({
      code: 'WELCOME10',
      type: DiscountType.PERCENTAGE,
      value: 10,
      min_order_value: 20,
      max_uses: 100,
      times_used: 12,
      is_active: true,
      valid_from: new Date('2025-01-01'),
      valid_until: new Date('2026-12-31'),
    }),
    discountRepo.create({
      code: 'SUMMER5',
      type: DiscountType.FIXED,
      value: 5,
      min_order_value: 30,
      max_uses: 50,
      times_used: 3,
      is_active: true,
      valid_from: new Date('2026-06-01'),
      valid_until: new Date('2026-08-31'),
    }),
    discountRepo.create({
      code: 'EXPIRED20',
      type: DiscountType.PERCENTAGE,
      value: 20,
      max_uses: 10,
      times_used: 10,
      is_active: false,
      valid_from: new Date('2024-01-01'),
      valid_until: new Date('2024-12-31'),
    }),
  ];
  await discountRepo.save(discounts);
  console.log(`  ✓ ${discounts.length} discount codes created`);

  // ==================== ORDERS ====================
  console.log('📋 Seeding orders...');
  const orderRepo = AppDataSource.getRepository(Order);
  const orderItemRepo = AppDataSource.getRepository(OrderItem);

  const order1 = orderRepo.create({
    order_number: 'ORD-00000001',
    customer_email: 'mario.rossi@example.com',
    customer_name: 'Mario Rossi',
    subtotal: 40.00,
    tax: 8.80,
    discount: 4.00,
    total: 44.80,
    currency: 'EUR',
    payment_status: PaymentStatus.PAID,
    payment_method: 'stripe',
    payment_intent_id: 'pi_test_abc123',
    fulfillment_status: FulfillmentStatus.FULFILLED,
    shipping_address: {
      street: 'Via Roma 42',
      city: 'Milano',
      province: 'MI',
      zip: '20121',
      country: 'IT',
    },
    billing_address: {
      street: 'Via Roma 42',
      city: 'Milano',
      province: 'MI',
      zip: '20121',
      country: 'IT',
    },
    notes: 'Gift wrapping requested',
  });

  const order2 = orderRepo.create({
    order_number: 'ORD-00000002',
    customer_email: 'giulia.bianchi@example.com',
    customer_name: 'Giulia Bianchi',
    subtotal: 450.00,
    tax: 99.00,
    discount: 0,
    total: 549.00,
    currency: 'EUR',
    payment_status: PaymentStatus.PAID,
    payment_method: 'stripe',
    payment_intent_id: 'pi_test_def456',
    fulfillment_status: FulfillmentStatus.UNFULFILLED,
    shipping_address: {
      street: 'Corso Italia 15',
      city: 'Roma',
      province: 'RM',
      zip: '00185',
      country: 'IT',
    },
  });

  const order3 = orderRepo.create({
    order_number: 'ORD-00000003',
    customer_email: 'hans.mueller@example.de',
    customer_name: 'Hans Müller',
    subtotal: 33.50,
    tax: 7.37,
    discount: 0,
    total: 40.87,
    currency: 'EUR',
    payment_status: PaymentStatus.PENDING,
    fulfillment_status: FulfillmentStatus.UNFULFILLED,
    shipping_address: {
      street: 'Berliner Str. 10',
      city: 'Berlin',
      zip: '10115',
      country: 'DE',
    },
  });

  const order4 = orderRepo.create({
    order_number: 'ORD-00000004',
    customer_email: 'sara.verdi@example.com',
    customer_name: 'Sara Verdi',
    subtotal: 15.00,
    tax: 3.30,
    discount: 0,
    total: 18.30,
    currency: 'EUR',
    payment_status: PaymentStatus.REFUNDED,
    payment_method: 'stripe',
    payment_intent_id: 'pi_test_ghi789',
    fulfillment_status: FulfillmentStatus.UNFULFILLED,
    notes: 'Customer requested refund — wrong item ordered',
  });

  await orderRepo.save([order1, order2, order3, order4]);

  // Order items
  const orderItems = [
    // Order 1: 1x Jungle Fever (framed) + 1x sticker pack
    orderItemRepo.create({ order_id: order1.id, product_id: product1.id, variant_id: variants[1].id, product_name: 'Jungle Fever — A3 Art Print', variant_name: 'White Frame', sku: 'JF-PRINT-A3-WHT', quantity: 1, unit_price: 40.00, total_price: 40.00 }),
    // Order 2: 1x Cosmic Dream original
    orderItemRepo.create({ order_id: order2.id, product_id: product2.id, variant_id: variants[3].id, product_name: 'Cosmic Dream — Original Painting', variant_name: 'Original (unframed)', sku: 'CD-ORIG-001-DEF', quantity: 1, unit_price: 450.00, total_price: 450.00 }),
    // Order 3: 1x Print (standard) + 1x Comic (IT) + 1x Sticker (glossy)
    orderItemRepo.create({ order_id: order3.id, product_id: product1.id, variant_id: variants[0].id, product_name: 'Jungle Fever — A3 Art Print', variant_name: 'Standard (no frame)', sku: 'JF-PRINT-A3-STD', quantity: 1, unit_price: 25.00, total_price: 25.00 }),
    orderItemRepo.create({ order_id: order3.id, product_id: product3.id, variant_id: variants[5].id, product_name: 'Neon City — Sticker Pack (5 pcs)', variant_name: 'Glossy Finish', sku: 'NC-STICKER-5PK-GLS', quantity: 1, unit_price: 10.00, total_price: 10.00 }),
    // Order 4: 1x Comic (EN) — refunded
    orderItemRepo.create({ order_id: order4.id, product_id: product4.id, variant_id: variants[7].id, product_name: 'Urban Legends — Volume 1', variant_name: 'English Edition', sku: 'UL-COMIC-V1-EN', quantity: 1, unit_price: 15.00, total_price: 15.00 }),
  ];
  await orderItemRepo.save(orderItems);
  console.log(`  ✓ ${4} orders with ${orderItems.length} items created`);

  // ==================== NOTIFICATIONS ====================
  console.log('🔔 Seeding notifications...');
  const notifRepo = AppDataSource.getRepository(Notification);
  const notifications = [
    notifRepo.create({
      type: NotificationType.ORDER_PAID,
      title: 'New order paid — ORD-00000001',
      message: 'Mario Rossi placed an order for €44.80. Payment confirmed via Stripe.',
      metadata: { order_id: order1.id, order_number: 'ORD-00000001' },
      is_read: true,
      read_at: new Date(),
    }),
    notifRepo.create({
      type: NotificationType.ORDER_PAID,
      title: 'New order paid — ORD-00000002',
      message: 'Giulia Bianchi purchased "Cosmic Dream — Original Painting" for €549.00.',
      metadata: { order_id: order2.id, order_number: 'ORD-00000002' },
      is_read: false,
    }),
    notifRepo.create({
      type: NotificationType.ORDER_CREATED,
      title: 'New order pending — ORD-00000003',
      message: 'Hans Müller created an order for €40.87. Awaiting payment.',
      metadata: { order_id: order3.id, order_number: 'ORD-00000003' },
      is_read: false,
    }),
    notifRepo.create({
      type: NotificationType.LOW_STOCK,
      title: 'Low stock alert — Cosmic Dream',
      message: 'Product "Cosmic Dream — Original Painting" has only 1 item left in stock.',
      metadata: { product_id: product2.id, variant_id: variants[3].id, stock: 1 },
      is_read: false,
    }),
    notifRepo.create({
      type: NotificationType.SYSTEM,
      title: 'Database backup completed',
      message: 'Automated database backup was completed successfully at 03:00 AM.',
      is_read: true,
      read_at: new Date(),
    }),
  ];
  await notifRepo.save(notifications);
  console.log(`  ✓ ${notifications.length} notifications created`);

  // ==================== AUDIT LOGS ====================
  console.log('📝 Seeding audit logs...');
  const auditRepo = AppDataSource.getRepository(AuditLog);
  const auditLogs = [
    auditRepo.create({
      user_id: 1,
      action: 'CREATE',
      entity_type: 'Product',
      entity_id: product1.id,
      changes: { title: 'Jungle Fever — A3 Art Print', base_price: 25.00 },
      ip_address: '192.168.0.103',
    }),
    auditRepo.create({
      user_id: 1,
      action: 'UPDATE',
      entity_type: 'Product',
      entity_id: product1.id,
      changes: { status: { from: 'draft', to: 'published' } },
      ip_address: '192.168.0.103',
    }),
    auditRepo.create({
      user_id: 1,
      action: 'CREATE',
      entity_type: 'Personaggio',
      entity_id: personaggi[0].id,
      changes: { name: 'Luna' },
      ip_address: '192.168.0.103',
    }),
    auditRepo.create({
      user_id: 1,
      action: 'UPDATE',
      entity_type: 'Order',
      entity_id: order1.id,
      changes: { fulfillment_status: { from: 'unfulfilled', to: 'fulfilled' } },
      ip_address: '192.168.0.103',
    }),
  ];
  await auditRepo.save(auditLogs);
  console.log(`  ✓ ${auditLogs.length} audit logs created`);

  // ==================== SUMMARY ====================
  console.log('\n✅ Seed completed! Summary:');
  console.log('  • 5 categories (1 nested)');
  console.log('  • 5 products (4 published, 1 draft)');
  console.log(`  • ${images.length} product images`);
  console.log(`  • ${variants.length} product variants`);
  console.log(`  • ${personaggi.length} personaggi`);
  console.log(`  • ${fumetti.length} fumetti`);
  console.log(`  • ${discounts.length} discount codes (2 active, 1 expired)`);
  console.log('  • 4 orders (2 paid, 1 pending, 1 refunded)');
  console.log(`  • ${orderItems.length} order items`);
  console.log(`  • ${notifications.length} notifications`);
  console.log(`  • ${auditLogs.length} audit logs`);

  await closeDatabase();
  console.log('\n🏁 Done!');
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
