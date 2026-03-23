/**
 * Tests for src/config/index.ts
 *
 * The config module evaluates at load time, so branch coverage for the env-var
 * helpers requires reloading the module (jest.resetModules + require).
 * The exported utility functions (isProduction, etc.) can be tested by
 * mutating the already-loaded config object directly.
 */

// Reload config module with current env vars and return it.
function loadConfig(): typeof import('./index') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./index') as typeof import('./index');
}

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.resetModules();
});

// ── isProduction / isStaging / isDevelopment ──────────────────────────────

describe('isProduction', () => {
  it('returns true when environment is production', () => {
    const mod = loadConfig();
    mod.config.server.environment = 'production';
    expect(mod.isProduction()).toBe(true);
  });

  it('returns false when environment is not production', () => {
    const mod = loadConfig();
    mod.config.server.environment = 'development';
    expect(mod.isProduction()).toBe(false);
  });
});

describe('isStaging', () => {
  it('returns true when environment is staging', () => {
    const mod = loadConfig();
    mod.config.server.environment = 'staging';
    expect(mod.isStaging()).toBe(true);
  });

  it('returns false when environment is not staging', () => {
    const mod = loadConfig();
    mod.config.server.environment = 'development';
    expect(mod.isStaging()).toBe(false);
  });
});

describe('isDevelopment', () => {
  it('returns true when environment is development', () => {
    const mod = loadConfig();
    mod.config.server.environment = 'development';
    expect(mod.isDevelopment()).toBe(true);
  });

  it('returns false when environment is not development', () => {
    const mod = loadConfig();
    mod.config.server.environment = 'production';
    expect(mod.isDevelopment()).toBe(false);
  });
});

// ── isEtsyEnabled ─────────────────────────────────────────────────────────

describe('isEtsyEnabled', () => {
  it('returns false when etsy config fields are empty (default)', () => {
    const mod = loadConfig();
    expect(mod.isEtsyEnabled()).toBe(false);
  });

  it('returns true when all required etsy config values are present', () => {
    const mod = loadConfig();
    mod.config.etsy.apiKey = 'test-key';
    mod.config.etsy.apiSecret = 'test-secret';
    mod.config.etsy.shopId = 'test-shop';
    mod.config.etsy.syncEnabled = true;
    expect(mod.isEtsyEnabled()).toBe(true);
  });

  it('returns false when syncEnabled is false even if keys are set', () => {
    const mod = loadConfig();
    mod.config.etsy.apiKey = 'test-key';
    mod.config.etsy.apiSecret = 'test-secret';
    mod.config.etsy.shopId = 'test-shop';
    mod.config.etsy.syncEnabled = false;
    expect(mod.isEtsyEnabled()).toBe(false);
  });
});

// ── getEnv (truthy branch) ────────────────────────────────────────────────

describe('getEnv', () => {
  it('returns the env var value when the variable is set', () => {
    process.env.LOG_LEVEL = 'debug';
    const mod = loadConfig();
    expect(mod.config.logging.level).toBe('debug');
    delete process.env.LOG_LEVEL;
  });
});

// ── getEnvInt (truthy branch) ─────────────────────────────────────────────

describe('getEnvInt', () => {
  it('parses the env var as an integer when the variable is set', () => {
    process.env.PORT = '9090';
    const mod = loadConfig();
    expect(mod.config.server.port).toBe(9090);
    delete process.env.PORT;
  });
});

// ── getEnvBool (both truthy branches) ────────────────────────────────────

describe('getEnvBool', () => {
  it('returns true when the env var is set to "true"', () => {
    process.env.ETSY_SYNC_ENABLED = 'true';
    const mod = loadConfig();
    expect(mod.config.etsy.syncEnabled).toBe(true);
    delete process.env.ETSY_SYNC_ENABLED;
  });

  it('returns false when the env var is set to a non-"true" string', () => {
    process.env.ETSY_SYNC_ENABLED = 'false';
    const mod = loadConfig();
    expect(mod.config.etsy.syncEnabled).toBe(false);
    delete process.env.ETSY_SYNC_ENABLED;
  });
});

// ── getJwtSecret ──────────────────────────────────────────────────────────

describe('getJwtSecret', () => {
  it('returns the JWT_SECRET env var when it is set', () => {
    process.env.JWT_SECRET = 'my-test-secret';
    const mod = loadConfig();
    expect(mod.config.jwtSecret).toBe('my-test-secret');
    delete process.env.JWT_SECRET;
  });

  it('throws in production when JWT_SECRET is not set', () => {
    process.env.ENVIRONMENT = 'production';
    delete process.env.JWT_SECRET;
    expect(() => loadConfig()).toThrow('JWT_SECRET must be set in production/staging environments');
    delete process.env.ENVIRONMENT;
  });

  it('throws in staging when JWT_SECRET is not set', () => {
    process.env.ENVIRONMENT = 'staging';
    delete process.env.JWT_SECRET;
    expect(() => loadConfig()).toThrow('JWT_SECRET must be set in production/staging environments');
    delete process.env.ENVIRONMENT;
  });

  it('returns the default secret in development when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    delete process.env.ENVIRONMENT;
    const mod = loadConfig();
    expect(mod.config.jwtSecret).toBe('your-secret-key-change-in-production');
  });
});
