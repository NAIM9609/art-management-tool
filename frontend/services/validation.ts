/**
 * Frontend validation utilities to match backend validation
 * Ensures consistent validation between frontend and backend
 */

export interface ValidationError {
  field: string;
  message: string;
}

export class ValidationResult {
  private errors: ValidationError[] = [];

  addError(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  getErrors(): ValidationError[] {
    return [...this.errors];
  }

  getErrorMessage(): string {
    return this.errors.map(e => `${e.field}: ${e.message}`).join('; ');
  }

  getFieldError(field: string): string | undefined {
    const error = this.errors.find(e => e.field === field);
    return error?.message;
  }
}

export class Validator {
  private result: ValidationResult = new ValidationResult();

  required(field: string, value: string | undefined | null): this {
    if (!value || value.trim() === '') {
      this.result.addError(field, 'is required');
    }
    return this;
  }

  minLength(field: string, value: string, min: number): this {
    if (value && value.trim().length < min) {
      this.result.addError(field, `must be at least ${min} characters`);
    }
    return this;
  }

  maxLength(field: string, value: string, max: number): this {
    if (value && value.length > max) {
      this.result.addError(field, `must not exceed ${max} characters`);
    }
    return this;
  }

  minValue(field: string, value: number, min: number): this {
    if (value < min) {
      this.result.addError(field, `must be at least ${min}`);
    }
    return this;
  }

  maxValue(field: string, value: number, max: number): this {
    if (value > max) {
      this.result.addError(field, `must not exceed ${max}`);
    }
    return this;
  }

  pattern(field: string, value: string, pattern: RegExp, message?: string): this {
    if (value && !pattern.test(value)) {
      this.result.addError(field, message || 'has invalid format');
    }
    return this;
  }

  oneOf(field: string, value: string, allowed: string[]): this {
    if (value && !allowed.includes(value)) {
      this.result.addError(field, `must be one of: ${allowed.join(', ')}`);
    }
    return this;
  }

  url(field: string, value: string): this {
    if (value && value.trim() !== '') {
      if (!value.startsWith('http://') && !value.startsWith('https://') && !value.startsWith('/')) {
        this.result.addError(field, 'must be a valid URL');
      }
    }
    return this;
  }

  email(field: string, value: string): this {
    if (value && value.trim() !== '') {
      const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailPattern.test(value)) {
        this.result.addError(field, 'must be a valid email address');
      }
    }
    return this;
  }

  colorHex(field: string, value: string): this {
    if (value && value.trim() !== '') {
      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      if (!hexPattern.test(value)) {
        this.result.addError(field, 'must be a valid hex color (e.g., #FF0000)');
      }
    }
    return this;
  }

  getResult(): ValidationResult {
    return this.result;
  }
}

/**
 * Validate Personaggio input
 */
export interface PersonaggioValidationInput {
  name: string;
  description?: string;
  icon?: string;
  images: string[];
  backgroundColor?: string;
  backgroundType?: 'solid' | 'gradient' | 'image';
  gradientFrom?: string;
  gradientTo?: string;
  backgroundImage?: string;
  order?: number;
}

export function validatePersonaggio(data: PersonaggioValidationInput): ValidationResult {
  const validator = new Validator();

  validator
    .required('name', data.name)
    .minLength('name', data.name, 1)
    .maxLength('name', data.name, 100);

  if (data.description) {
    validator.maxLength('description', data.description, 2000);
  }

  if (data.icon) {
    validator.url('icon', data.icon);
  }

  if (data.images.length > 20) {
    validator.getResult().addError('images', 'cannot exceed 20 images');
  }

  data.images.forEach((img, i) => {
    validator.url(`images[${i}]`, img);
  });

  if (data.backgroundColor) {
    validator.colorHex('backgroundColor', data.backgroundColor);
  }

  if (data.backgroundType) {
    validator.oneOf('backgroundType', data.backgroundType, ['solid', 'gradient', 'image']);
  }

  if (data.backgroundType === 'gradient') {
    if (data.gradientFrom) {
      validator.colorHex('gradientFrom', data.gradientFrom);
    }
    if (data.gradientTo) {
      validator.colorHex('gradientTo', data.gradientTo);
    }
  }

  if (data.backgroundType === 'image' && data.backgroundImage) {
    // Valida l'URL solo se è stato fornito
    validator.url('backgroundImage', data.backgroundImage);
  }

  if (data.order !== undefined && data.order < 0) {
    validator.getResult().addError('order', 'must be a non-negative integer');
  }

  return validator.getResult();
}

/**
 * Validate Product input for creation
 */
export interface ProductValidationInput {
  title: string;
  slug: string;
  short_description?: string;
  long_description?: string;
  base_price: number;
  currency?: string;
  sku?: string;
  gtin?: string;
  status?: 'draft' | 'published' | 'archived';
}

export function validateProductCreate(data: ProductValidationInput): ValidationResult {
  const validator = new Validator();

  validator
    .required('title', data.title)
    .minLength('title', data.title, 1)
    .maxLength('title', data.title, 500);

  validator
    .required('slug', data.slug)
    .minLength('slug', data.slug, 1)
    .maxLength('slug', data.slug, 255)
    .pattern('slug', data.slug, /^[a-z0-9-]+$/, 'must contain only lowercase letters, numbers, and hyphens');

  if (data.short_description) {
    validator.maxLength('short_description', data.short_description, 1000);
  }

  if (data.long_description) {
    validator.maxLength('long_description', data.long_description, 50000);
  }

  validator.minValue('base_price', data.base_price, 0);

  if (data.currency) {
    validator.maxLength('currency', data.currency, 3);
  }

  if (data.sku) {
    validator.maxLength('sku', data.sku, 100);
  }

  if (data.gtin) {
    validator.maxLength('gtin', data.gtin, 50);
  }

  if (data.status) {
    validator.oneOf('status', data.status, ['draft', 'published', 'archived']);
  }

  return validator.getResult();
}

/**
 * Validate Product input for updates
 */
export function validateProductUpdate(data: Partial<ProductValidationInput>): ValidationResult {
  const validator = new Validator();

  if (data.title !== undefined) {
    validator
      .minLength('title', data.title, 1)
      .maxLength('title', data.title, 500);
  }

  if (data.slug !== undefined) {
    validator
      .minLength('slug', data.slug, 1)
      .maxLength('slug', data.slug, 255)
      .pattern('slug', data.slug, /^[a-z0-9-]+$/, 'must contain only lowercase letters, numbers, and hyphens');
  }

  if (data.short_description !== undefined) {
    validator.maxLength('short_description', data.short_description, 1000);
  }

  if (data.long_description !== undefined) {
    validator.maxLength('long_description', data.long_description, 50000);
  }

  if (data.base_price !== undefined) {
    validator.minValue('base_price', data.base_price, 0);
  }

  if (data.currency !== undefined) {
    validator.maxLength('currency', data.currency, 3);
  }

  if (data.sku !== undefined) {
    validator.maxLength('sku', data.sku, 100);
  }

  if (data.gtin !== undefined) {
    validator.maxLength('gtin', data.gtin, 50);
  }

  if (data.status !== undefined) {
    validator.oneOf('status', data.status, ['draft', 'published', 'archived']);
  }

  return validator.getResult();
}

/**
 * Validate Product Variant
 */
export interface VariantValidationInput {
  sku: string;
  name: string;
  attributes?: string;
  price_adjustment?: number;
  stock: number;
}

export function validateVariant(data: VariantValidationInput): ValidationResult {
  const validator = new Validator();

  validator
    .required('sku', data.sku)
    .maxLength('sku', data.sku, 100);

  validator
    .required('name', data.name)
    .maxLength('name', data.name, 255);

  if (data.stock < 0) {
    validator.getResult().addError('stock', 'must be non-negative');
  }

  return validator.getResult();
}

/**
 * Validate Product Image
 */
export interface ImageValidationInput {
  url: string;
  alt_text?: string;
  position?: number;
}

export function validateProductImage(data: ImageValidationInput): ValidationResult {
  const validator = new Validator();

  validator
    .required('url', data.url)
    .maxLength('url', data.url, 1000)
    .url('url', data.url);

  if (data.alt_text) {
    validator.maxLength('alt_text', data.alt_text, 500);
  }

  if (data.position !== undefined && data.position < 0) {
    validator.getResult().addError('position', 'must be non-negative');
  }

  return validator.getResult();
}

/**
 * Helper to check if file is valid image
 */
export function validateImageFile(file: File, maxSizeMB: number = 10): ValidationResult {
  const validator = new Validator();
  const result = validator.getResult();

  // Check file type
  if (!file.type.startsWith('image/')) {
    result.addError('file', 'must be an image file');
  }

  // Check file size
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    result.addError('file', `must not exceed ${maxSizeMB}MB`);
  }

  // Check allowed extensions
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'];
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
  
  if (!hasValidExtension) {
    result.addError('file', `must be one of: ${allowedExtensions.join(', ')}`);
  }

  return result;
}
