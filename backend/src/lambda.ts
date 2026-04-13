import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { DynamoDBOptimized } from './services/dynamodb/DynamoDBOptimized';
import { CategoryRepository } from './services/dynamodb/repositories/CategoryRepository';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';
import { NotificationService } from './services/NotificationService';
import { AuditService } from './services/AuditService';
import { S3Service } from './services/s3/S3Service';
import { MockPaymentProvider } from './services/payment/MockPaymentProvider';
import { config } from './config';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../services/product-service/src/types';
import { successResponse, errorResponse } from '../services/product-service/src/types';
import * as productHandlers from '../services/product-service/src/handlers/product.handler';
import * as variantHandlers from '../services/product-service/src/handlers/variant.handler';
import * as imageHandlers from '../services/product-service/src/handlers/image.handler';
import * as cartHandlers from '../services/cart-service/src/handlers/cart.handler';
import * as discountHandlers from '../services/discount-service/src/handlers/discount.handler';
import * as notificationHandlers from '../services/notification-service/src/handlers/notification.handler';
import * as personaggiHandlers from '../services/content-service/src/handlers/personaggi.handler';
import * as fumettiHandlers from '../services/content-service/src/handlers/fumetti.handler';
import * as uploadHandlers from '../services/content-service/src/handlers/upload.handler';
import * as integrationHandlers from '../services/integration-service/src/handlers/etsy.handler';

interface HttpApiV2Event {
	version?: string;
	routeKey?: string;
	rawPath?: string;
	rawQueryString?: string;
	cookies?: string[];
	headers?: Record<string, string | undefined>;
	queryStringParameters?: Record<string, string> | null;
	requestContext?: {
		http?: {
			method?: string;
			path?: string;
		};
	};
	body?: string | null;
	isBase64Encoded?: boolean;
}

interface MultipartFile {
	filename: string;
	contentType: string;
	buffer: Buffer;
}

const categoryRepository = new CategoryRepository(
	new DynamoDBOptimized({
		tableName: process.env.CONTENT_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME || 'content',
		region: process.env.AWS_REGION_CUSTOM,
		maxRetries: 3,
		retryDelay: 100,
	})
);
const productService = new ProductService();
const notificationService = new NotificationService();
const orderService = new OrderService(new MockPaymentProvider(1, false), notificationService);
const auditService = new AuditService();
const s3Service = new S3Service();

function extractBearerToken(headers: Record<string, string>): string | null {
	const authorization = headers.authorization || headers.Authorization;
	if (!authorization?.startsWith('Bearer ')) {
		return null;
	}

	return authorization.slice('Bearer '.length).trim();
}

function requireAdminAuth(event: APIGatewayProxyEvent): APIGatewayProxyResult | null {
	const token = extractBearerToken(event.headers || {});
	if (!token) {
		return errorResponse('Unauthorized', 401);
	}

	try {
		jwt.verify(token, config.jwtSecret);
		return null;
	} catch {
		return errorResponse('Unauthorized', 401);
	}
}

function getAllowedOrigin(headers: Record<string, string>): string {
	const origin = headers.origin || headers.Origin;
	if (!origin) {
		return config.corsAllowedOrigins[0] || '*';
	}

	return config.corsAllowedOrigins.includes(origin) ? origin : (config.corsAllowedOrigins[0] || origin);
}

function withCors(result: APIGatewayProxyResult, headers: Record<string, string>): APIGatewayProxyResult {
	const origin = getAllowedOrigin(headers);
	return {
		...result,
		headers: {
			'Access-Control-Allow-Origin': origin,
			'Access-Control-Allow-Credentials': 'true',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Cart-Session, x-session-id, Stripe-Signature',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
			...(result.headers || {}),
		},
	};
}

function normalizeHeaders(headers?: Record<string, string | undefined>, cookies?: string[]): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers || {})) {
		if (typeof value === 'string') {
			normalized[key] = value;
		}
	}

	if (cookies && cookies.length > 0 && !normalized.cookie && !normalized.Cookie) {
		normalized.cookie = cookies.join('; ');
	}

	return normalized;
}

function parseQuery(rawEvent: HttpApiV2Event): Record<string, string> {
	if (rawEvent.queryStringParameters) {
		return { ...rawEvent.queryStringParameters };
	}

	const query = new URLSearchParams(rawEvent.rawQueryString || '');
	return Object.fromEntries(query.entries());
}

function normalizeEvent(rawEvent: HttpApiV2Event): APIGatewayProxyEvent {
	const headers = normalizeHeaders(rawEvent.headers, rawEvent.cookies);
	const method = rawEvent.requestContext?.http?.method || headers['x-http-method-override'] || 'GET';
	const path = rawEvent.rawPath || rawEvent.requestContext?.http?.path || '/';

	return {
		httpMethod: method.toUpperCase(),
		path,
		headers,
		queryStringParameters: parseQuery(rawEvent),
		body: rawEvent.body || null,
		isBase64Encoded: Boolean(rawEvent.isBase64Encoded),
		pathParameters: null,
	};
}

function decodeBody(event: APIGatewayProxyEvent): Buffer {
	const body = event.body || '';
	return event.isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8');
}

function parseMultipart(event: APIGatewayProxyEvent): { fields: Record<string, string>; file?: MultipartFile } {
	const contentTypeHeader = event.headers?.['content-type'] || event.headers?.['Content-Type'] || '';
	const boundaryMatch = contentTypeHeader.match(/boundary=(.+)$/i);
	if (!boundaryMatch) {
		return { fields: {} };
	}

	const boundary = `--${boundaryMatch[1]}`;
	const raw = decodeBody(event).toString('latin1');
	const parts = raw.split(boundary).slice(1, -1);
	const fields: Record<string, string> = {};
	let file: MultipartFile | undefined;

	for (const part of parts) {
		const trimmed = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
		if (!trimmed) continue;

		const separatorIndex = trimmed.indexOf('\r\n\r\n');
		if (separatorIndex === -1) continue;

		const rawHeaders = trimmed.slice(0, separatorIndex);
		const rawValue = trimmed.slice(separatorIndex + 4).replace(/\r\n$/, '');
		const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
		if (!nameMatch) continue;

		const fieldName = nameMatch[1];
		const fileNameMatch = rawHeaders.match(/filename="([^"]*)"/i);

		if (fileNameMatch) {
			const partContentType = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
			file = {
				filename: fileNameMatch[1],
				contentType: partContentType,
				buffer: Buffer.from(rawValue, 'latin1'),
			};
			continue;
		}

		fields[fieldName] = rawValue;
	}

	return { fields, file };
}

function matchPath(path: string, pattern: RegExp): RegExpMatchArray | null {
	return path.match(pattern);
}

function buildDelegatedEvent(
	event: APIGatewayProxyEvent,
	overrides: Partial<APIGatewayProxyEvent> = {}
): APIGatewayProxyEvent {
	return {
		...event,
		...overrides,
		headers: overrides.headers || event.headers,
		queryStringParameters: overrides.queryStringParameters || event.queryStringParameters,
		pathParameters: overrides.pathParameters ?? event.pathParameters,
	};
}

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	if (!event.body) {
		return errorResponse('Request body is required', 400);
	}

	const { username, password } = JSON.parse(event.body) as { username?: string; password?: string };
	const ipAddress = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'];
	const isValidUser =
		username === config.adminUsername &&
		config.adminPasswordHash &&
		password &&
		(await bcrypt.compare(password, config.adminPasswordHash));

	if (!isValidUser) {
		auditService.logAction('unknown', 'LOGIN_FAILED', 'User', 'unknown', { username }, ipAddress).catch(() => undefined);
		return errorResponse('Invalid credentials', 401);
	}

	const token = jwt.sign({ id: 1, username }, config.jwtSecret, { expiresIn: '24h' });
	auditService.logAction('1', 'LOGIN', 'User', '1', undefined, ipAddress).catch(() => undefined);
	return successResponse({ token, user: username });
}

async function handleLogout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const token = extractBearerToken(event.headers || {});
	if (token) {
		try {
			const decoded = jwt.verify(token, config.jwtSecret) as { id: number };
			const ipAddress = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'];
			auditService.logAction(decoded.id.toString(), 'LOGOUT', 'User', decoded.id.toString(), undefined, ipAddress).catch(() => undefined);
		} catch {
			// ignore invalid token on logout
		}
	}

	return successResponse({ message: 'Logged out successfully' });
}

async function listCategoriesAdmin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const query = event.queryStringParameters || {};
	const includeChildren = query.include_children === 'true';
	const includeParent = query.include_parent === 'true';
	const parentId = query.parent_id === 'null' ? null : (query.parent_id ? parseInt(query.parent_id, 10) : undefined);

	const categories = parentId === undefined
		? await categoryRepository.findAllFlat(false)
		: (await categoryRepository.findByParentId(parentId, { limit: 100 })).items;

	const result = await Promise.all(categories.map(async (category) => {
		const value: Record<string, unknown> = { ...category };
		if (includeParent && category.parent_id) {
			value.parent = await categoryRepository.findById(category.parent_id);
		}
		if (includeChildren) {
			value.children = (await categoryRepository.findByParentId(category.id, { limit: 100 })).items;
		}
		return value;
	}));

	return successResponse({ categories: result, total: result.length });
}

async function listCategoriesPublic(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const includeChildren = event.queryStringParameters?.include_children === 'true';
	const roots = (await categoryRepository.findRootCategories({ limit: 100 })).items;

	const categories = await Promise.all(roots.map(async (category) => {
		const value: Record<string, unknown> = { ...category };
		if (includeChildren) {
			value.children = (await categoryRepository.findByParentId(category.id, { limit: 100 })).items;
		}
		return value;
	}));

	return successResponse({ categories, total: categories.length });
}

async function getCategoryById(event: APIGatewayProxyEvent, id: number): Promise<APIGatewayProxyResult> {
	const category = await categoryRepository.findById(id);
	if (!category) {
		return errorResponse('Category not found', 404);
	}

	return successResponse(category);
}

async function createCategory(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	if (!event.body) {
		return errorResponse('Request body is required', 400);
	}
	const body = JSON.parse(event.body) as Record<string, unknown>;
	const category = await categoryRepository.create({
		name: String(body.name || ''),
		slug: String(body.slug || ''),
		description: typeof body.description === 'string' ? body.description : undefined,
		parent_id: typeof body.parent_id === 'number' ? body.parent_id : undefined,
	});
	return successResponse(category, 201);
}

async function updateCategory(event: APIGatewayProxyEvent, id: number): Promise<APIGatewayProxyResult> {
	if (!event.body) {
		return errorResponse('Request body is required', 400);
	}
	const body = JSON.parse(event.body) as Record<string, unknown>;
	const category = await categoryRepository.update(id, {
		name: typeof body.name === 'string' ? body.name : undefined,
		slug: typeof body.slug === 'string' ? body.slug : undefined,
		description: typeof body.description === 'string' ? body.description : undefined,
		parent_id: typeof body.parent_id === 'number' ? body.parent_id : undefined,
	});

	return category ? successResponse(category) : errorResponse('Category not found', 404);
}

async function deleteCategory(id: number): Promise<APIGatewayProxyResult> {
	const category = await categoryRepository.softDelete(id);
	return category ? successResponse({ message: 'Category deleted', id }) : errorResponse('Category not found', 404);
}

async function handleCheckout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	if (!event.body) {
		return errorResponse('Request body is required', 400);
	}

	const body = JSON.parse(event.body) as Record<string, unknown>;
	const headers = event.headers || {};
	const cookieHeader = headers.cookie || headers.Cookie || '';
	const cookieMatch = cookieHeader.match(/(?:^|;\s*)cart_session=([^;]+)/);
	const sessionId = headers['x-cart-session'] || headers['X-Cart-Session'] || headers['x-session-id'] || cookieMatch?.[1];

	if (!sessionId) {
		return errorResponse('Cart session is required', 400);
	}

	const result = await orderService.createOrderFromCart(sessionId, {
		customerEmail: String(body.email || body.customer_email || ''),
		customerName: String(body.name || body.customer_name || ''),
		shippingAddress: (body.shipping_address || {}) as Record<string, unknown>,
		billingAddress: (body.billing_address || body.shipping_address || {}) as Record<string, unknown>,
		paymentMethod: String(body.payment_method || 'mock'),
		notes: typeof body.notes === 'string' ? body.notes : undefined,
	});

	return successResponse({ ...result.order, items: result.items });
}

async function handleInventoryAdjust(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	if (!event.body) {
		return errorResponse('Request body is required', 400);
	}

	const body = JSON.parse(event.body) as { variant_id?: number | string; quantity?: number; operation?: 'set' | 'add' | 'subtract' };
	if (!body.variant_id || typeof body.quantity !== 'number' || !body.operation) {
		return errorResponse('variant_id, quantity and operation are required', 400);
	}

	const variantId = String(body.variant_id);
	if (body.operation === 'set') {
		await productService.updateVariant(variantId, { stock: body.quantity });
	} else {
		const adjustment = body.operation === 'subtract' ? -body.quantity : body.quantity;
		await productService.updateInventory([{ variantId, quantity: adjustment }]);
	}

	return successResponse({ message: 'Inventory updated' });
}

async function handleAdminOrderGet(id: string): Promise<APIGatewayProxyResult> {
	const result = await orderService.getOrderById(id);
	if (!result) {
		return errorResponse('Order not found', 404);
	}
	return successResponse({ ...result.order, items: result.items });
}

async function handleAdminOrderFulfillment(event: APIGatewayProxyEvent, id: string): Promise<APIGatewayProxyResult> {
	if (!event.body) {
		return errorResponse('Request body is required', 400);
	}
	const body = JSON.parse(event.body) as { status?: string };
	if (!body.status) {
		return errorResponse('status is required', 400);
	}

	const authHeader = event.headers?.authorization || event.headers?.Authorization;
	const userId = authHeader ? '1' : undefined;
	const order = await orderService.updateFulfillmentStatus(id, body.status, userId);
	return successResponse(order);
}

async function handleAdminOrderRefund(_event: APIGatewayProxyEvent, id: string): Promise<APIGatewayProxyResult> {
	const order = await orderService.updatePaymentStatus(id, 'refunded', undefined, '1');
	return successResponse(order);
}

async function handleDiscountValidate(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	if (!event.body) {
		return errorResponse('Request body is required', 400);
	}
	const body = JSON.parse(event.body) as Record<string, unknown>;
	return discountHandlers.validateCode(buildDelegatedEvent(event, {
		body: JSON.stringify({
			code: body.code,
			cartTotal: body.cartTotal ?? body.cart_total,
		}),
		path: '/api/discounts/validate',
	}));
}

async function handleTempUpload(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const { fields, file } = parseMultipart(event);
	const contentType = file?.contentType || 'image/jpeg';
	const query = {
		content_type: contentType,
		entity: fields.entity || 'uploads',
	};

	return uploadHandlers.tempUploadPresign(buildDelegatedEvent(event, {
		queryStringParameters: query,
		body: null,
		isBase64Encoded: false,
	}));
}

async function handleProductImageUpload(event: APIGatewayProxyEvent, productId: number): Promise<APIGatewayProxyResult> {
	const { fields, file } = parseMultipart(event);
	if (!file) {
		return errorResponse('No file uploaded', 400);
	}

	const { cdnUrl } = await s3Service.uploadImage(
		file.buffer,
		'uploads/products',
		file.filename,
		file.contentType
	);

	const image = await productService.addImage(
		productId,
		cdnUrl,
		fields.alt_text || undefined,
		fields.position ? parseInt(fields.position, 10) : undefined
	);

	return successResponse({ message: 'Image uploaded', image }, 201);
}

export async function handler(rawEvent: HttpApiV2Event): Promise<APIGatewayProxyResult> {
	const event = normalizeEvent(rawEvent);
	const headers = event.headers || {};
	const method = event.httpMethod.toUpperCase();
	const path = event.path;

	try {
		if (method === 'OPTIONS') {
			return withCors({ statusCode: 204, headers: {}, body: '' }, headers);
		}

		const requiresAdminAuth =
			path.startsWith('/api/admin/') ||
			(path === '/api/integrations/etsy/auth') ||
			(path.startsWith('/api/personaggi') && method !== 'GET') ||
			(path.startsWith('/api/fumetti') && method !== 'GET');

		if (requiresAdminAuth) {
			const authError = requireAdminAuth(event);
			if (authError) {
				return withCors(authError, headers);
			}
		}

		if (method === 'GET' && path === '/health') {
			return withCors(successResponse({ status: 'ok', timestamp: new Date().toISOString() }), headers);
		}

		if (method === 'POST' && path === '/api/auth/login') {
			return withCors(await handleLogin(event), headers);
		}

		if (method === 'POST' && path === '/api/auth/logout') {
			return withCors(await handleLogout(event), headers);
		}

		if (method === 'GET' && path === '/api/shop/products') {
			return withCors(await productHandlers.listProducts(buildDelegatedEvent(event, { path: '/api/products' })), headers);
		}

		const shopProductMatch = matchPath(path, /^\/api\/shop\/products\/([^/]+)$/);
		if (method === 'GET' && shopProductMatch) {
			return withCors(await productHandlers.getProduct(buildDelegatedEvent(event, {
				path: `/api/products/${shopProductMatch[1]}`,
				pathParameters: { slug: shopProductMatch[1] },
			})), headers);
		}

		if (method === 'GET' && path === '/api/shop/categories') {
			return withCors(await listCategoriesPublic(event), headers);
		}

		const publicCategoryMatch = matchPath(path, /^\/api\/shop\/categories\/(\d+)$/);
		if (method === 'GET' && publicCategoryMatch) {
			return withCors(await getCategoryById(event, parseInt(publicCategoryMatch[1], 10)), headers);
		}

		if (method === 'GET' && path === '/api/shop/cart') {
			return withCors(await cartHandlers.getCart(buildDelegatedEvent(event, { path: '/api/cart' })), headers);
		}

		if (method === 'POST' && path === '/api/shop/cart/items') {
			return withCors(await cartHandlers.addItem(buildDelegatedEvent(event, { path: '/api/cart/items' })), headers);
		}

		const cartItemMatch = matchPath(path, /^\/api\/shop\/cart\/items\/([^/]+)$/);
		if (cartItemMatch && method === 'PATCH') {
			return withCors(await cartHandlers.updateQuantity(buildDelegatedEvent(event, {
				path: `/api/cart/items/${cartItemMatch[1]}`,
				pathParameters: { id: cartItemMatch[1] },
			})), headers);
		}

		if (cartItemMatch && method === 'DELETE') {
			return withCors(await cartHandlers.removeItem(buildDelegatedEvent(event, {
				path: `/api/cart/items/${cartItemMatch[1]}`,
				pathParameters: { id: cartItemMatch[1] },
			})), headers);
		}

		if (method === 'DELETE' && path === '/api/shop/cart') {
			return withCors(await cartHandlers.clearCart(buildDelegatedEvent(event, { path: '/api/cart' })), headers);
		}

		if (method === 'POST' && path === '/api/shop/cart/discount') {
			return withCors(await cartHandlers.applyDiscount(buildDelegatedEvent(event, { path: '/api/cart/discount' })), headers);
		}

		if (method === 'DELETE' && path === '/api/shop/cart/discount') {
			return withCors(await cartHandlers.removeDiscount(buildDelegatedEvent(event, { path: '/api/cart/discount' })), headers);
		}

		if (method === 'POST' && path === '/api/shop/checkout') {
			return withCors(await handleCheckout(event), headers);
		}

		if (method === 'POST' && path === '/api/shop/discounts/validate') {
			return withCors(await handleDiscountValidate(event), headers);
		}

		if (method === 'GET' && path === '/api/admin/categories') {
			return withCors(await listCategoriesAdmin(event), headers);
		}

		if (method === 'POST' && path === '/api/admin/categories') {
			return withCors(await createCategory(event), headers);
		}

		const adminCategoryMatch = matchPath(path, /^\/api\/admin\/categories\/(\d+)$/);
		if (adminCategoryMatch && method === 'GET') {
			return withCors(await getCategoryById(event, parseInt(adminCategoryMatch[1], 10)), headers);
		}
		if (adminCategoryMatch && method === 'PATCH') {
			return withCors(await updateCategory(event, parseInt(adminCategoryMatch[1], 10)), headers);
		}
		if (adminCategoryMatch && method === 'DELETE') {
			return withCors(await deleteCategory(parseInt(adminCategoryMatch[1], 10)), headers);
		}

		if (method === 'GET' && path === '/api/admin/shop/products') {
			return withCors(await productHandlers.listProducts(buildDelegatedEvent(event, { path: '/api/products' })), headers);
		}
		if (method === 'POST' && path === '/api/admin/shop/products') {
			return withCors(await productHandlers.createProduct(buildDelegatedEvent(event, { path: '/api/products' })), headers);
		}

		const adminProductMatch = matchPath(path, /^\/api\/admin\/shop\/products\/(\d+)$/);
		if (adminProductMatch && method === 'GET') {
			return withCors(await productService.getProductById(parseInt(adminProductMatch[1], 10)).then((product) => product ? successResponse(product) : errorResponse('Product not found', 404)), headers);
		}
		if (adminProductMatch && method === 'PATCH') {
			return withCors(await productHandlers.updateProduct(buildDelegatedEvent(event, {
				path: `/api/products/${adminProductMatch[1]}`,
				httpMethod: 'PUT',
				pathParameters: { id: adminProductMatch[1] },
			})), headers);
		}
		if (adminProductMatch && method === 'DELETE') {
			return withCors(await productHandlers.deleteProduct(buildDelegatedEvent(event, {
				path: `/api/products/${adminProductMatch[1]}`,
				pathParameters: { id: adminProductMatch[1] },
			})), headers);
		}

		const productVariantsMatch = matchPath(path, /^\/api\/admin\/shop\/products\/(\d+)\/variants$/);
		if (productVariantsMatch && method === 'POST') {
			return withCors(await variantHandlers.createVariant(buildDelegatedEvent(event, {
				path: `/api/products/${productVariantsMatch[1]}/variants`,
				pathParameters: { id: productVariantsMatch[1] },
			})), headers);
		}

		const adminVariantMatch = matchPath(path, /^\/api\/admin\/shop\/variants\/([^/]+)$/);
		if (adminVariantMatch && method === 'PATCH') {
			return withCors(await variantHandlers.updateVariant(buildDelegatedEvent(event, {
				path: `/api/variants/${adminVariantMatch[1]}`,
				httpMethod: 'PUT',
				pathParameters: { id: adminVariantMatch[1] },
			})), headers);
		}

		if (method === 'POST' && path === '/api/admin/shop/inventory/adjust') {
			return withCors(await handleInventoryAdjust(event), headers);
		}

		const productImagesCollectionMatch = matchPath(path, /^\/api\/admin\/shop\/products\/(\d+)\/images$/);
		if (productImagesCollectionMatch && method === 'POST') {
			return withCors(await handleProductImageUpload(event, parseInt(productImagesCollectionMatch[1], 10)), headers);
		}
		if (productImagesCollectionMatch && method === 'GET') {
			return withCors(await imageHandlers.listImages(buildDelegatedEvent(event, {
				path: `/api/products/${productImagesCollectionMatch[1]}/images`,
				pathParameters: { id: productImagesCollectionMatch[1] },
			})), headers);
		}

		const productImageMatch = matchPath(path, /^\/api\/admin\/shop\/products\/(\d+)\/images\/([^/]+)$/);
		if (productImageMatch && method === 'PATCH') {
			if (!event.body) {
				return withCors(errorResponse('Request body is required', 400), headers);
			}
			const body = JSON.parse(event.body) as { position?: number; alt_text?: string };
			const image = await productService.updateImage(parseInt(productImageMatch[1], 10), productImageMatch[2], body);
			return withCors(successResponse({ message: 'Image updated', image }), headers);
		}
		if (productImageMatch && method === 'DELETE') {
			return withCors(await imageHandlers.deleteImage(buildDelegatedEvent(event, {
				path: `/api/products/${productImageMatch[1]}/images/${productImageMatch[2]}`,
				pathParameters: { id: productImageMatch[1], imageId: productImageMatch[2] },
			})), headers);
		}

		if (method === 'GET' && path === '/api/admin/shop/orders') {
			const page = parseInt(event.queryStringParameters?.page || '1', 10);
			const perPage = parseInt(event.queryStringParameters?.per_page || '20', 10);
			const result = await orderService.listOrders({ paymentStatus: event.queryStringParameters?.payment_status }, page, perPage);
			return withCors(successResponse({ ...result, page, per_page: perPage }), headers);
		}

		const adminOrderMatch = matchPath(path, /^\/api\/admin\/shop\/orders\/([^/]+)$/);
		if (adminOrderMatch && method === 'GET') {
			return withCors(await handleAdminOrderGet(adminOrderMatch[1]), headers);
		}

		const adminFulfillmentMatch = matchPath(path, /^\/api\/admin\/shop\/orders\/([^/]+)\/fulfillment$/);
		if (adminFulfillmentMatch && method === 'PATCH') {
			return withCors(await handleAdminOrderFulfillment(event, adminFulfillmentMatch[1]), headers);
		}

		const adminRefundMatch = matchPath(path, /^\/api\/admin\/shop\/orders\/([^/]+)\/refund$/);
		if (adminRefundMatch && method === 'POST') {
			return withCors(await handleAdminOrderRefund(event, adminRefundMatch[1]), headers);
		}

		if (method === 'GET' && path === '/api/admin/notifications') {
			const notificationQuery: Record<string, string> = {
				unreadOnly: event.queryStringParameters?.unread === 'true' ? 'true' : 'false',
				perPage: event.queryStringParameters?.per_page || '20',
			};

			if (event.queryStringParameters?.type) {
				notificationQuery.type = event.queryStringParameters.type;
			}

			if (event.queryStringParameters?.last_key) {
				notificationQuery.lastEvaluatedKey = event.queryStringParameters.last_key;
			}

			return withCors(await notificationHandlers.listNotifications(buildDelegatedEvent(event, {
				queryStringParameters: notificationQuery,
			})), headers);
		}

		const adminNotificationReadMatch = matchPath(path, /^\/api\/admin\/notifications\/([^/]+)\/read$/);
		if (adminNotificationReadMatch && method === 'PATCH') {
			return withCors(await notificationHandlers.markAsRead(buildDelegatedEvent(event, { pathParameters: { id: adminNotificationReadMatch[1] } })), headers);
		}

		if (method === 'POST' && path === '/api/admin/notifications/read-all') {
			return withCors(await notificationHandlers.markAllAsRead(buildDelegatedEvent(event, { path: '/api/admin/notifications/mark-all-read' })), headers);
		}

		const adminNotificationMatch = matchPath(path, /^\/api\/admin\/notifications\/([^/]+)$/);
		if (adminNotificationMatch && method === 'DELETE') {
			return withCors(await notificationHandlers.deleteNotification(buildDelegatedEvent(event, { pathParameters: { id: adminNotificationMatch[1] } })), headers);
		}

		if (method === 'GET' && path === '/api/personaggi') {
			return withCors(await personaggiHandlers.listPersonaggi(event), headers);
		}
		if (method === 'POST' && path === '/api/personaggi') {
			return withCors(await personaggiHandlers.createPersonaggio(event), headers);
		}
		const personaggioMatch = matchPath(path, /^\/api\/personaggi\/(\d+)$/);
		if (personaggioMatch && method === 'GET') {
			return withCors(await personaggiHandlers.getPersonaggio(buildDelegatedEvent(event, { pathParameters: { id: personaggioMatch[1] } })), headers);
		}
		if (personaggioMatch && method === 'PUT') {
			return withCors(await personaggiHandlers.updatePersonaggio(buildDelegatedEvent(event, { pathParameters: { id: personaggioMatch[1] } })), headers);
		}
		if (personaggioMatch && method === 'DELETE') {
			return withCors(await personaggiHandlers.deletePersonaggio(buildDelegatedEvent(event, { pathParameters: { id: personaggioMatch[1] } })), headers);
		}

		if (method === 'GET' && path === '/api/fumetti') {
			return withCors(await fumettiHandlers.listFumetti(event), headers);
		}
		if (method === 'POST' && path === '/api/fumetti') {
			return withCors(await fumettiHandlers.createFumetto(event), headers);
		}
		const fumettoMatch = matchPath(path, /^\/api\/fumetti\/(\d+)$/);
		if (fumettoMatch && method === 'GET') {
			return withCors(await fumettiHandlers.getFumetto(buildDelegatedEvent(event, { pathParameters: { id: fumettoMatch[1] } })), headers);
		}
		if (fumettoMatch && method === 'PUT') {
			return withCors(await fumettiHandlers.updateFumetto(buildDelegatedEvent(event, { pathParameters: { id: fumettoMatch[1] } })), headers);
		}
		if (fumettoMatch && method === 'DELETE') {
			return withCors(await fumettiHandlers.deleteFumetto(buildDelegatedEvent(event, { pathParameters: { id: fumettoMatch[1] } })), headers);
		}

		if (method === 'POST' && path === '/api/upload/temp') {
			return withCors(await handleTempUpload(event), headers);
		}

		if (method === 'GET' && path === '/api/integrations/etsy/auth') {
			return withCors(await integrationHandlers.initiateOAuth(event), headers);
		}
		if (method === 'GET' && path === '/api/integrations/etsy/callback') {
			return withCors(await integrationHandlers.handleCallback(event), headers);
		}
		if (method === 'POST' && path === '/api/admin/etsy/sync/products') {
			return withCors(await integrationHandlers.syncProducts(event), headers);
		}
		if (method === 'POST' && path === '/api/admin/etsy/sync/inventory') {
			return withCors(await integrationHandlers.syncInventory(event), headers);
		}
		if (method === 'POST' && path === '/api/admin/etsy/sync/orders') {
			return withCors(await integrationHandlers.syncOrders(event), headers);
		}

		return withCors(errorResponse(`Route not found: ${method} ${path}`, 404), headers);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		return withCors(errorResponse(message, 500), headers);
	}
}