/**
 * Unit tests for Content Service Lambda Handlers (Personaggi and Fumetti)
 *
 * All service calls are mocked at the module level so no DynamoDB or S3
 * connection is required.
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-content';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import jwt from 'jsonwebtoken';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────────

const mockPersonaggioFindAll = jest.fn();
const mockPersonaggioFindById = jest.fn();
const mockPersonaggioCreate = jest.fn();
const mockPersonaggioUpdate = jest.fn();
const mockPersonaggioSoftDelete = jest.fn();

jest.mock('../../../../src/services/dynamodb/repositories/PersonaggioRepository', () => ({
  PersonaggioRepository: jest.fn().mockImplementation(() => ({
    findAll: mockPersonaggioFindAll,
    findById: mockPersonaggioFindById,
    create: mockPersonaggioCreate,
    update: mockPersonaggioUpdate,
    softDelete: mockPersonaggioSoftDelete,
  })),
}));

const mockFumettoFindAll = jest.fn();
const mockFumettoFindById = jest.fn();
const mockFumettoCreate = jest.fn();
const mockFumettoUpdate = jest.fn();
const mockFumettoSoftDelete = jest.fn();

jest.mock('../../../../src/services/dynamodb/repositories/FumettoRepository', () => ({
  FumettoRepository: jest.fn().mockImplementation(() => ({
    findAll: mockFumettoFindAll,
    findById: mockFumettoFindById,
    create: mockFumettoCreate,
    update: mockFumettoUpdate,
    softDelete: mockFumettoSoftDelete,
  })),
}));

const mockGeneratePresignedUploadUrl = jest.fn();

jest.mock('../../../../src/services/s3/S3Service', () => ({
  S3Service: jest.fn().mockImplementation(() => ({
    generatePresignedUploadUrl: mockGeneratePresignedUploadUrl,
  })),
}));

jest.mock('../../../../src/services/dynamodb/DynamoDBOptimized', () => ({
  DynamoDBOptimized: jest.fn().mockImplementation(() => ({})),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import handlers AFTER mocks are set up
// ──────────────────────────────────────────────────────────────────────────────

import {
  listPersonaggi,
  getPersonaggio,
  createPersonaggio,
  updatePersonaggio,
  deletePersonaggio,
  uploadImage,
} from '../handlers/personaggi.handler';

import {
  listFumetti,
  getFumetto,
  createFumetto,
  updateFumetto,
  deleteFumetto,
  uploadPage,
} from '../handlers/fumetti.handler';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeAdminToken(): string {
  return jwt.sign({ id: 1, username: 'admin' }, 'test-secret');
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'GET',
    path: '/',
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    body: null,
    ...overrides,
  };
}

const ADMIN_HEADERS = { Authorization: `Bearer ${makeAdminToken()}` };

// ──────────────────────────────────────────────────────────────────────────────
// Shared mock data
// ──────────────────────────────────────────────────────────────────────────────

const MOCK_PERSONAGGIO = {
  id: 1,
  name: 'Mario',
  description: 'A famous character',
  images: ['https://cdn.example.com/mario.jpg'],
  order: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_FUMETTO = {
  id: 1,
  title: 'Avventura #1',
  description: 'First adventure',
  coverImage: 'https://cdn.example.com/cover.jpg',
  pages: ['https://cdn.example.com/page1.jpg'],
  order: 0,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const MOCK_PRESIGNED = {
  uploadUrl: 'https://s3.example.com/upload?sig=abc',
  cdnUrl: 'https://cdn.example.com/new-image.jpg',
  key: 'personaggi/1/new-image.jpg',
};

// ──────────────────────────────────────────────────────────────────────────────
// Personaggi Handlers
// ──────────────────────────────────────────────────────────────────────────────

describe('Personaggi Handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── listPersonaggi ──────────────────────────────────────────────────────────

  describe('listPersonaggi', () => {
    it('returns 200 with sorted personaggi', async () => {
      const personaggi = [MOCK_PERSONAGGIO];
      mockPersonaggioFindAll.mockResolvedValueOnce(personaggi);

      const result = await listPersonaggi(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.personaggi).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(result.headers?.['Cache-Control']).toBe('public, max-age=3600');
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('calls findAll with includeDeleted=false', async () => {
      mockPersonaggioFindAll.mockResolvedValueOnce([]);

      await listPersonaggi(makeEvent());

      expect(mockPersonaggioFindAll).toHaveBeenCalledWith(false);
    });

    it('returns 500 on service error', async () => {
      mockPersonaggioFindAll.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await listPersonaggi(makeEvent());

      expect(result.statusCode).toBe(500);
    });
  });

  // ── getPersonaggio ──────────────────────────────────────────────────────────

  describe('getPersonaggio', () => {
    it('returns 200 with personaggio', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(MOCK_PERSONAGGIO);

      const result = await getPersonaggio(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual(MOCK_PERSONAGGIO);
      expect(result.headers?.['Cache-Control']).toBe('public, max-age=86400');
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('returns 404 when not found', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(null);

      const result = await getPersonaggio(makeEvent({ pathParameters: { id: '99' } }));

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toContain('not found');
    });

    it('returns 400 when id is missing', async () => {
      const result = await getPersonaggio(makeEvent());

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for non-numeric id', async () => {
      const result = await getPersonaggio(makeEvent({ pathParameters: { id: 'abc' } }));

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for zero id', async () => {
      const result = await getPersonaggio(makeEvent({ pathParameters: { id: '0' } }));

      expect(result.statusCode).toBe(400);
    });

    it('returns 500 on service error', async () => {
      mockPersonaggioFindById.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await getPersonaggio(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(500);
    });
  });

  // ── createPersonaggio ───────────────────────────────────────────────────────

  describe('createPersonaggio', () => {
    const validBody = { name: 'Luigi' };

    it('returns 201 on success', async () => {
      const created = { ...MOCK_PERSONAGGIO, name: 'Luigi', id: 2 };
      mockPersonaggioCreate.mockResolvedValueOnce(created);

      const result = await createPersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify(validBody) })
      );

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual(created);
    });

    it('passes optional fields to repository', async () => {
      mockPersonaggioCreate.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      const body = { name: 'Luigi', description: 'Green hat', images: ['img1.jpg'], order: 2 };

      await createPersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify(body) })
      );

      expect(mockPersonaggioCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Luigi',
          description: 'Green hat',
          images: ['img1.jpg'],
          order: 2,
        })
      );
    });

    it('returns 401 without token', async () => {
      const result = await createPersonaggio(
        makeEvent({ body: JSON.stringify(validBody) })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when name is missing', async () => {
      const result = await createPersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify({ description: 'No name' }) })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('name');
    });

    it('returns 400 when name is empty string', async () => {
      const result = await createPersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify({ name: '   ' }) })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const result = await createPersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, body: 'not-json' })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await createPersonaggio(makeEvent({ headers: ADMIN_HEADERS }));

      expect(result.statusCode).toBe(400);
    });
  });

  // ── updatePersonaggio ───────────────────────────────────────────────────────

  describe('updatePersonaggio', () => {
    it('returns 200 on success', async () => {
      const updated = { ...MOCK_PERSONAGGIO, name: 'Mario Updated' };
      mockPersonaggioUpdate.mockResolvedValueOnce(updated);

      const result = await updatePersonaggio(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ name: 'Mario Updated' }),
        })
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(updated);
    });

    it('returns 404 when personaggio not found', async () => {
      mockPersonaggioUpdate.mockResolvedValueOnce(null);

      const result = await updatePersonaggio(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '99' },
          body: JSON.stringify({ name: 'Ghost' }),
        })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 401 without token', async () => {
      const result = await updatePersonaggio(
        makeEvent({
          pathParameters: { id: '1' },
          body: JSON.stringify({ name: 'x' }),
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      const result = await updatePersonaggio(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'abc' },
          body: JSON.stringify({ name: 'x' }),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for empty body', async () => {
      const result = await updatePersonaggio(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({}),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await updatePersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const result = await updatePersonaggio(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: 'invalid-json',
        })
      );

      expect(result.statusCode).toBe(400);
    });
  });

  // ── deletePersonaggio ───────────────────────────────────────────────────────

  describe('deletePersonaggio', () => {
    it('returns 200 on success', async () => {
      mockPersonaggioSoftDelete.mockResolvedValueOnce(MOCK_PERSONAGGIO);

      const result = await deletePersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toContain('deleted');
    });

    it('returns 404 when not found', async () => {
      mockPersonaggioSoftDelete.mockResolvedValueOnce(null);

      const result = await deletePersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '99' } })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 401 without token', async () => {
      const result = await deletePersonaggio(
        makeEvent({ pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      const result = await deletePersonaggio(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'abc' } })
      );

      expect(result.statusCode).toBe(400);
    });
  });

  // ── uploadImage ─────────────────────────────────────────────────────────────

  describe('uploadImage', () => {
    it('returns 200 with upload URL and CDN URL', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce(MOCK_PRESIGNED);
      mockPersonaggioUpdate.mockResolvedValueOnce({
        ...MOCK_PERSONAGGIO,
        images: [...MOCK_PERSONAGGIO.images, MOCK_PRESIGNED.cdnUrl],
      });

      const result = await uploadImage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.upload_url).toBe(MOCK_PRESIGNED.uploadUrl);
      expect(body.cdn_url).toBe(MOCK_PRESIGNED.cdnUrl);
      expect(body.key).toBe(MOCK_PRESIGNED.key);
      expect(body.expires_in).toBe(300);
    });

    it('appends CDN URL to images array in DynamoDB', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce(MOCK_PRESIGNED);
      mockPersonaggioUpdate.mockResolvedValueOnce(MOCK_PERSONAGGIO);

      await uploadImage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(mockPersonaggioUpdate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          images: [...MOCK_PERSONAGGIO.images, MOCK_PRESIGNED.cdnUrl],
        })
      );
    });

    it('uses content_type from query string', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(MOCK_PERSONAGGIO);
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce(MOCK_PRESIGNED);
      mockPersonaggioUpdate.mockResolvedValueOnce(MOCK_PERSONAGGIO);

      await uploadImage(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          queryStringParameters: { content_type: 'image/png' },
        })
      );

      expect(mockGeneratePresignedUploadUrl).toHaveBeenCalledWith(
        expect.any(String),
        'image/png',
        expect.any(String)
      );
    });

    it('returns 400 for invalid content_type', async () => {
      const result = await uploadImage(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          queryStringParameters: { content_type: 'application/pdf' },
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 404 when personaggio not found', async () => {
      mockPersonaggioFindById.mockResolvedValueOnce(null);

      const result = await uploadImage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '99' } })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 401 without token', async () => {
      const result = await uploadImage(
        makeEvent({ pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      const result = await uploadImage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'abc' } })
      );

      expect(result.statusCode).toBe(400);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Fumetti Handlers
// ──────────────────────────────────────────────────────────────────────────────

describe('Fumetti Handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── listFumetti ─────────────────────────────────────────────────────────────

  describe('listFumetti', () => {
    it('returns 200 with sorted fumetti', async () => {
      const fumetti = [MOCK_FUMETTO];
      mockFumettoFindAll.mockResolvedValueOnce({
        items: fumetti,
        count: 1,
        lastEvaluatedKey: undefined,
      });

      const result = await listFumetti(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.fumetti).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(result.headers?.['Cache-Control']).toBe('public, max-age=3600');
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('passes limit from query string', async () => {
      mockFumettoFindAll.mockResolvedValueOnce({ items: [], count: 0 });

      await listFumetti(makeEvent({ queryStringParameters: { limit: '10' } }));

      expect(mockFumettoFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 })
      );
    });

    it('clamps limit to MAX_LIMIT of 100', async () => {
      mockFumettoFindAll.mockResolvedValueOnce({ items: [], count: 0 });

      await listFumetti(makeEvent({ queryStringParameters: { limit: '999' } }));

      expect(mockFumettoFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });

    it('passes lastEvaluatedKey from query string', async () => {
      mockFumettoFindAll.mockResolvedValueOnce({ items: [], count: 0 });
      const key = { PK: 'FUMETTO#1', SK: 'METADATA' };

      await listFumetti(
        makeEvent({ queryStringParameters: { last_key: JSON.stringify(key) } })
      );

      expect(mockFumettoFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ lastEvaluatedKey: key })
      );
    });

    it('returns 400 for invalid last_key', async () => {
      const result = await listFumetti(
        makeEvent({ queryStringParameters: { last_key: 'not-json' } })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 500 on service error', async () => {
      mockFumettoFindAll.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await listFumetti(makeEvent());

      expect(result.statusCode).toBe(500);
    });
  });

  // ── getFumetto ──────────────────────────────────────────────────────────────

  describe('getFumetto', () => {
    it('returns 200 with fumetto', async () => {
      mockFumettoFindById.mockResolvedValueOnce(MOCK_FUMETTO);

      const result = await getFumetto(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body).toEqual(MOCK_FUMETTO);
      expect(result.headers?.['Cache-Control']).toBe('public, max-age=86400');
      expect(result.headers?.['ETag']).toBeTruthy();
    });

    it('returns 404 when not found', async () => {
      mockFumettoFindById.mockResolvedValueOnce(null);

      const result = await getFumetto(makeEvent({ pathParameters: { id: '99' } }));

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).error).toContain('not found');
    });

    it('returns 400 when id is missing', async () => {
      const result = await getFumetto(makeEvent());

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for non-numeric id', async () => {
      const result = await getFumetto(makeEvent({ pathParameters: { id: 'xyz' } }));

      expect(result.statusCode).toBe(400);
    });

    it('returns 500 on service error', async () => {
      mockFumettoFindById.mockRejectedValueOnce(new Error('DynamoDB error'));

      const result = await getFumetto(makeEvent({ pathParameters: { id: '1' } }));

      expect(result.statusCode).toBe(500);
    });
  });

  // ── createFumetto ───────────────────────────────────────────────────────────

  describe('createFumetto', () => {
    const validBody = { title: 'Avventura #2' };

    it('returns 201 on success', async () => {
      const created = { ...MOCK_FUMETTO, title: 'Avventura #2', id: 2 };
      mockFumettoCreate.mockResolvedValueOnce(created);

      const result = await createFumetto(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify(validBody) })
      );

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toEqual(created);
    });

    it('passes optional fields to repository', async () => {
      mockFumettoCreate.mockResolvedValueOnce(MOCK_FUMETTO);
      const body = {
        title: 'New Comic',
        description: 'A comic',
        coverImage: 'cover.jpg',
        pages: ['page1.jpg'],
        order: 5,
      };

      await createFumetto(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify(body) })
      );

      expect(mockFumettoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Comic',
          description: 'A comic',
          coverImage: 'cover.jpg',
          pages: ['page1.jpg'],
          order: 5,
        })
      );
    });

    it('returns 401 without token', async () => {
      const result = await createFumetto(
        makeEvent({ body: JSON.stringify(validBody) })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 when title is missing', async () => {
      const result = await createFumetto(
        makeEvent({
          headers: ADMIN_HEADERS,
          body: JSON.stringify({ description: 'No title' }),
        })
      );

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('title');
    });

    it('returns 400 when title is empty string', async () => {
      const result = await createFumetto(
        makeEvent({ headers: ADMIN_HEADERS, body: JSON.stringify({ title: '  ' }) })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const result = await createFumetto(
        makeEvent({ headers: ADMIN_HEADERS, body: 'not-json' })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await createFumetto(makeEvent({ headers: ADMIN_HEADERS }));

      expect(result.statusCode).toBe(400);
    });
  });

  // ── updateFumetto ───────────────────────────────────────────────────────────

  describe('updateFumetto', () => {
    it('returns 200 on success', async () => {
      const updated = { ...MOCK_FUMETTO, title: 'Updated Comic' };
      mockFumettoUpdate.mockResolvedValueOnce(updated);

      const result = await updateFumetto(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({ title: 'Updated Comic' }),
        })
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(updated);
    });

    it('returns 404 when fumetto not found', async () => {
      mockFumettoUpdate.mockResolvedValueOnce(null);

      const result = await updateFumetto(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '99' },
          body: JSON.stringify({ title: 'Ghost' }),
        })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 401 without token', async () => {
      const result = await updateFumetto(
        makeEvent({
          pathParameters: { id: '1' },
          body: JSON.stringify({ title: 'x' }),
        })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      const result = await updateFumetto(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: 'abc' },
          body: JSON.stringify({ title: 'x' }),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for empty body', async () => {
      const result = await updateFumetto(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: JSON.stringify({}),
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when body is missing', async () => {
      const result = await updateFumetto(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 for invalid JSON body', async () => {
      const result = await updateFumetto(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          body: 'invalid-json',
        })
      );

      expect(result.statusCode).toBe(400);
    });
  });

  // ── deleteFumetto ───────────────────────────────────────────────────────────

  describe('deleteFumetto', () => {
    it('returns 200 on success', async () => {
      mockFumettoSoftDelete.mockResolvedValueOnce(MOCK_FUMETTO);

      const result = await deleteFumetto(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toContain('deleted');
    });

    it('returns 404 when not found', async () => {
      mockFumettoSoftDelete.mockResolvedValueOnce(null);

      const result = await deleteFumetto(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '99' } })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 401 without token', async () => {
      const result = await deleteFumetto(
        makeEvent({ pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      const result = await deleteFumetto(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'abc' } })
      );

      expect(result.statusCode).toBe(400);
    });
  });

  // ── uploadPage ──────────────────────────────────────────────────────────────

  describe('uploadPage', () => {
    const MOCK_PAGE_PRESIGNED = {
      uploadUrl: 'https://s3.example.com/upload?sig=def',
      cdnUrl: 'https://cdn.example.com/new-page.jpg',
      key: 'fumetti/1/new-page.jpg',
    };

    it('returns 200 with upload URL and CDN URL', async () => {
      mockFumettoFindById.mockResolvedValueOnce(MOCK_FUMETTO);
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce(MOCK_PAGE_PRESIGNED);
      mockFumettoUpdate.mockResolvedValueOnce({
        ...MOCK_FUMETTO,
        pages: [...(MOCK_FUMETTO.pages || []), MOCK_PAGE_PRESIGNED.cdnUrl],
      });

      const result = await uploadPage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.upload_url).toBe(MOCK_PAGE_PRESIGNED.uploadUrl);
      expect(body.cdn_url).toBe(MOCK_PAGE_PRESIGNED.cdnUrl);
      expect(body.key).toBe(MOCK_PAGE_PRESIGNED.key);
      expect(body.expires_in).toBe(300);
    });

    it('appends CDN URL to pages array in DynamoDB', async () => {
      mockFumettoFindById.mockResolvedValueOnce(MOCK_FUMETTO);
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce(MOCK_PAGE_PRESIGNED);
      mockFumettoUpdate.mockResolvedValueOnce(MOCK_FUMETTO);

      await uploadPage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '1' } })
      );

      expect(mockFumettoUpdate).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          pages: [...(MOCK_FUMETTO.pages || []), MOCK_PAGE_PRESIGNED.cdnUrl],
        })
      );
    });

    it('uses content_type from query string', async () => {
      mockFumettoFindById.mockResolvedValueOnce(MOCK_FUMETTO);
      mockGeneratePresignedUploadUrl.mockResolvedValueOnce(MOCK_PAGE_PRESIGNED);
      mockFumettoUpdate.mockResolvedValueOnce(MOCK_FUMETTO);

      await uploadPage(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          queryStringParameters: { content_type: 'image/webp' },
        })
      );

      expect(mockGeneratePresignedUploadUrl).toHaveBeenCalledWith(
        expect.any(String),
        'image/webp',
        expect.any(String)
      );
    });

    it('returns 400 for invalid content_type', async () => {
      const result = await uploadPage(
        makeEvent({
          headers: ADMIN_HEADERS,
          pathParameters: { id: '1' },
          queryStringParameters: { content_type: 'text/plain' },
        })
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 404 when fumetto not found', async () => {
      mockFumettoFindById.mockResolvedValueOnce(null);

      const result = await uploadPage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: '99' } })
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 401 without token', async () => {
      const result = await uploadPage(
        makeEvent({ pathParameters: { id: '1' } })
      );

      expect(result.statusCode).toBe(401);
    });

    it('returns 400 for invalid id', async () => {
      const result = await uploadPage(
        makeEvent({ headers: ADMIN_HEADERS, pathParameters: { id: 'bad' } })
      );

      expect(result.statusCode).toBe(400);
    });
  });
});
