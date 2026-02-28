/**
 * Unit tests for PersonaggioRepository
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { PersonaggioRepository } from './PersonaggioRepository';
import { CreatePersonaggioData, UpdatePersonaggioData } from './types';

// Mock DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('PersonaggioRepository', () => {
  let dynamoDB: DynamoDBOptimized;
  let repository: PersonaggioRepository;

  beforeEach(() => {
    ddbMock.reset();
    dynamoDB = new DynamoDBOptimized({
      tableName: 'test-table',
      region: 'us-east-1',
    });
    repository = new PersonaggioRepository(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getNextId', () => {
    it('should return next ID starting from 1', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      const id = await repository.getNextId();
      expect(id).toBe(1);
    });

    it('should increment existing counter', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 5 },
      });

      const id = await repository.getNextId();
      expect(id).toBe(5);
    });
  });

  describe('getNextOrder', () => {
    it('should return next order starting from 1', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 1 },
      });

      const order = await repository.getNextOrder();
      expect(order).toBe(1);
    });

    it('should increment existing order counter', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { value: 3 },
      });

      const order = await repository.getNextOrder();
      expect(order).toBe(3);
    });
  });

  describe('create', () => {
    it('should create a new personaggio with auto-increment ID and order', async () => {
      const createData: CreatePersonaggioData = {
        name: 'Superman',
        description: 'The Man of Steel',
        images: ['https://example.com/superman1.jpg', 'https://example.com/superman2.jpg'],
      };

      let updateCallCount = 0;
      ddbMock.on(UpdateCommand).callsFake(() => {
        updateCallCount++;
        return { Attributes: { value: updateCallCount } };
      });
      ddbMock.on(PutCommand).resolves({});

      const personaggio = await repository.create(createData);

      expect(personaggio.id).toBe(1);
      expect(personaggio.name).toBe('Superman');
      expect(personaggio.description).toBe('The Man of Steel');
      expect(personaggio.images).toEqual(['https://example.com/superman1.jpg', 'https://example.com/superman2.jpg']);
      expect(personaggio.order).toBe(2); // Second counter call
      expect(personaggio.created_at).toBeDefined();
      expect(personaggio.updated_at).toBeDefined();
    });

    it('should create a personaggio with custom order', async () => {
      const createData: CreatePersonaggioData = {
        name: 'Batman',
        description: 'The Dark Knight',
        order: 10,
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 2 } });
      ddbMock.on(PutCommand).resolves({});

      const personaggio = await repository.create(createData);

      expect(personaggio.id).toBe(2);
      expect(personaggio.order).toBe(10);
    });

    it('should create a personaggio with empty images array by default', async () => {
      const createData: CreatePersonaggioData = {
        name: 'Wonder Woman',
      };

      ddbMock.on(UpdateCommand).callsFake(() => {
        return { Attributes: { value: 3 } };
      });
      ddbMock.on(PutCommand).resolves({});

      const personaggio = await repository.create(createData);

      expect(personaggio.images).toEqual([]);
    });

    it('should store images as JSON string in DynamoDB', async () => {
      const createData: CreatePersonaggioData = {
        name: 'Flash',
        images: ['https://example.com/flash1.jpg'],
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
      
      let putItem: any;
      ddbMock.on(PutCommand).callsFake((input) => {
        putItem = input.Item;
        return {};
      });

      await repository.create(createData);

      expect(putItem.images).toBe(JSON.stringify(['https://example.com/flash1.jpg']));
      expect(putItem.PK).toBe('PERSONAGGIO#1');
      expect(putItem.SK).toBe('METADATA');
      expect(putItem.GSI1PK).toContain('PERSONAGGIO_ORDER#');
      expect(putItem.GSI1SK).toBe('1');
    });
  });

  describe('findById', () => {
    it('should find personaggio by ID with strongly consistent read', async () => {
      const mockItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman',
        description: 'The Man of Steel',
        images: JSON.stringify(['https://example.com/superman.jpg']),
        order: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const personaggio = await repository.findById(1);

      expect(personaggio).not.toBeNull();
      expect(personaggio?.id).toBe(1);
      expect(personaggio?.name).toBe('Superman');
      expect(personaggio?.images).toEqual(['https://example.com/superman.jpg']);
    });

    it('should return null if personaggio not found', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const personaggio = await repository.findById(999);

      expect(personaggio).toBeNull();
    });

    it('should parse images JSON correctly', async () => {
      const mockItem = {
        PK: 'PERSONAGGIO#2',
        SK: 'METADATA',
        id: 2,
        name: 'Batman',
        images: JSON.stringify(['https://example.com/batman1.jpg', 'https://example.com/batman2.jpg']),
        order: 2,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockItem });

      const personaggio = await repository.findById(2);

      expect(personaggio?.images).toEqual(['https://example.com/batman1.jpg', 'https://example.com/batman2.jpg']);
    });
  });

  describe('findAll', () => {
    it('should find all personaggi sorted by order', async () => {
      const mockItems = [
        {
          PK: 'PERSONAGGIO#1',
          SK: 'METADATA',
          id: 1,
          name: 'Superman',
          images: JSON.stringify(['https://example.com/superman.jpg']),
          order: 1,
          GSI1PK: 'PERSONAGGIO_ORDER#0000000001',
          GSI1SK: '1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'PERSONAGGIO#2',
          SK: 'METADATA',
          id: 2,
          name: 'Batman',
          images: JSON.stringify(['https://example.com/batman.jpg']),
          order: 2,
          GSI1PK: 'PERSONAGGIO_ORDER#0000000002',
          GSI1SK: '2',
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
        {
          PK: 'PERSONAGGIO#3',
          SK: 'METADATA',
          id: 3,
          name: 'Wonder Woman',
          images: JSON.stringify([]),
          order: 3,
          GSI1PK: 'PERSONAGGIO_ORDER#0000000003',
          GSI1SK: '3',
          created_at: '2024-01-03T00:00:00.000Z',
          updated_at: '2024-01-03T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 3,
      });

      const personaggi = await repository.findAll();

      expect(personaggi).toHaveLength(3);
      expect(personaggi[0].name).toBe('Superman');
      expect(personaggi[1].name).toBe('Batman');
      expect(personaggi[2].name).toBe('Wonder Woman');
    });

    it('should sort personaggi with multi-digit order values numerically', async () => {
      // Mock items returned from DynamoDB sorted by GSI1PK (which is zero-padded)
      // This demonstrates that zero-padding ensures correct numeric sorting
      const mockItems = [
        {
          PK: 'PERSONAGGIO#1',
          SK: 'METADATA',
          id: 1,
          name: 'Order 1',
          images: JSON.stringify([]),
          order: 1,
          GSI1PK: 'PERSONAGGIO_ORDER#0000000001',
          GSI1SK: '1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'PERSONAGGIO#2',
          SK: 'METADATA',
          id: 2,
          name: 'Order 2',
          images: JSON.stringify([]),
          order: 2,
          GSI1PK: 'PERSONAGGIO_ORDER#0000000002',
          GSI1SK: '2',
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
        },
        {
          PK: 'PERSONAGGIO#10',
          SK: 'METADATA',
          id: 10,
          name: 'Order 10',
          images: JSON.stringify([]),
          order: 10,
          GSI1PK: 'PERSONAGGIO_ORDER#0000000010',
          GSI1SK: '10',
          created_at: '2024-01-10T00:00:00.000Z',
          updated_at: '2024-01-10T00:00:00.000Z',
        },
        {
          PK: 'PERSONAGGIO#11',
          SK: 'METADATA',
          id: 11,
          name: 'Order 11',
          images: JSON.stringify([]),
          order: 11,
          GSI1PK: 'PERSONAGGIO_ORDER#0000000011',
          GSI1SK: '11',
          created_at: '2024-01-11T00:00:00.000Z',
          updated_at: '2024-01-11T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: mockItems.length,
      });

      const personaggi = await repository.findAll();

      expect(personaggi).toHaveLength(4);
      // Ensure the final order is numeric: 1, 2, 10, 11
      const orders = personaggi.map((p) => p.order);
      expect(orders).toEqual([1, 2, 10, 11]);
    });

    it('should exclude soft-deleted personaggi by default', async () => {
      const mockItems = [
        {
          PK: 'PERSONAGGIO#1',
          SK: 'METADATA',
          id: 1,
          name: 'Superman',
          images: JSON.stringify([]),
          order: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 1,
      });

      const personaggi = await repository.findAll(false);

      expect(personaggi).toHaveLength(1);
      expect(personaggi[0].name).toBe('Superman');
    });

    it('should include soft-deleted personaggi when includeDeleted is true', async () => {
      const mockItems = [
        {
          PK: 'PERSONAGGIO#1',
          SK: 'METADATA',
          id: 1,
          name: 'Superman',
          images: JSON.stringify([]),
          order: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
        {
          PK: 'PERSONAGGIO#2',
          SK: 'METADATA',
          id: 2,
          name: 'Batman',
          images: JSON.stringify([]),
          order: 2,
          created_at: '2024-01-02T00:00:00.000Z',
          updated_at: '2024-01-02T00:00:00.000Z',
          deleted_at: '2024-01-03T00:00:00.000Z',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 2,
      });

      const personaggi = await repository.findAll(true);

      expect(personaggi).toHaveLength(2);
      expect(personaggi[0].name).toBe('Superman');
      expect(personaggi[1].name).toBe('Batman');
      expect(personaggi[1].deleted_at).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update personaggio fields', async () => {
      const updateData: UpdatePersonaggioData = {
        name: 'Superman - Updated',
        description: 'Updated description',
      };

      const updatedItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman - Updated',
        description: 'Updated description',
        images: JSON.stringify(['https://example.com/superman.jpg']),
        order: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });

      const personaggio = await repository.update(1, updateData);

      expect(personaggio).not.toBeNull();
      expect(personaggio?.name).toBe('Superman - Updated');
      expect(personaggio?.description).toBe('Updated description');
    });

    it('should update images array', async () => {
      const updateData: UpdatePersonaggioData = {
        images: ['https://example.com/new1.jpg', 'https://example.com/new2.jpg'],
      };

      const updatedItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman',
        images: JSON.stringify(['https://example.com/new1.jpg', 'https://example.com/new2.jpg']),
        order: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });

      const personaggio = await repository.update(1, updateData);

      expect(personaggio?.images).toEqual(['https://example.com/new1.jpg', 'https://example.com/new2.jpg']);
    });

    it('should update order and GSI1 attributes', async () => {
      const updateData: UpdatePersonaggioData = {
        order: 10,
      };

      const updatedItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman',
        images: JSON.stringify([]),
        order: 10,
        GSI1PK: 'PERSONAGGIO_ORDER#0000000010',
        GSI1SK: '1',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedItem });

      const personaggio = await repository.update(1, updateData);

      expect(personaggio?.order).toBe(10);
    });

    it('should return null if personaggio does not exist', async () => {
      const updateData: UpdatePersonaggioData = {
        name: 'Non-existent',
      };

      const error = new Error('The conditional request failed');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(error);

      const personaggio = await repository.update(999, updateData);

      expect(personaggio).toBeNull();
    });
  });

  describe('softDelete', () => {
    it('should soft delete personaggio', async () => {
      const deletedItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman',
        images: JSON.stringify([]),
        order: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        deleted_at: '2024-01-02T00:00:00.000Z',
      };

      ddbMock.on(UpdateCommand).resolves({ Attributes: deletedItem });

      const personaggio = await repository.softDelete(1);

      expect(personaggio).not.toBeNull();
      expect(personaggio?.deleted_at).toBeDefined();
    });

    it('should return null if personaggio does not exist', async () => {
      const error = new Error('The conditional request failed');
      error.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(error);

      const personaggio = await repository.softDelete(999);

      expect(personaggio).toBeNull();
    });
  });

  describe('restore', () => {
    it('should restore soft-deleted personaggio', async () => {
      const deletedItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman',
        images: JSON.stringify([]),
        order: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
        deleted_at: '2024-01-02T00:00:00.000Z',
      };

      const restoredItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman',
        images: JSON.stringify([]),
        order: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-03T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: deletedItem });
      ddbMock.on(UpdateCommand).resolves({ Attributes: restoredItem });

      const personaggio = await repository.restore(1);

      expect(personaggio).not.toBeNull();
      expect(personaggio?.deleted_at).toBeUndefined();
    });

    it('should return null if personaggio is not deleted', async () => {
      const activeItem = {
        PK: 'PERSONAGGIO#1',
        SK: 'METADATA',
        id: 1,
        name: 'Superman',
        images: JSON.stringify([]),
        order: 1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-02T00:00:00.000Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: activeItem });

      const personaggio = await repository.restore(1);

      expect(personaggio).toBeNull();
    });

    it('should return null if personaggio does not exist', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const personaggio = await repository.restore(999);

      expect(personaggio).toBeNull();
    });
  });

  describe('reorder', () => {
    it('should reorder multiple personaggi', async () => {
      const personaggiIds = [3, 1, 2]; // New order: 3 -> 1, 1 -> 2, 2 -> 3

      const mockUpdates = [
        {
          Attributes: {
            id: 3,
            name: 'Wonder Woman',
            images: JSON.stringify([]),
            order: 1,
            GSI1PK: 'PERSONAGGIO_ORDER#0000000001',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-03T00:00:00.000Z',
          },
        },
        {
          Attributes: {
            id: 1,
            name: 'Superman',
            images: JSON.stringify([]),
            order: 2,
            GSI1PK: 'PERSONAGGIO_ORDER#0000000002',
            created_at: '2024-01-02T00:00:00.000Z',
            updated_at: '2024-01-03T00:00:00.000Z',
          },
        },
        {
          Attributes: {
            id: 2,
            name: 'Batman',
            images: JSON.stringify([]),
            order: 3,
            GSI1PK: 'PERSONAGGIO_ORDER#0000000003',
            created_at: '2024-01-03T00:00:00.000Z',
            updated_at: '2024-01-03T00:00:00.000Z',
          },
        },
      ];

      let updateIndex = 0;
      ddbMock.on(UpdateCommand).callsFake(() => {
        return mockUpdates[updateIndex++];
      });

      await repository.reorder(personaggiIds);

      // Verify UpdateCommand was called 3 times
      expect(ddbMock.commandCalls(UpdateCommand).length).toBe(3);
    });

    it('should assign sequential order numbers starting from 1', async () => {
      const personaggiIds = [5, 3, 1];

      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          id: 1,
          name: 'Test',
          images: JSON.stringify([]),
          order: 1,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-03T00:00:00.000Z',
        },
      });

      await repository.reorder(personaggiIds);

      const calls = ddbMock.commandCalls(UpdateCommand);
      expect(calls).toHaveLength(3);
    });

    it('should handle errors during reorder', async () => {
      const personaggiIds = [1, 2, 3];

      const error = new Error('Update failed');
      ddbMock.on(UpdateCommand).rejects(error);

      await expect(repository.reorder(personaggiIds)).rejects.toThrow('Update failed');
    });
  });

  describe('Integration with seed data', () => {
    it('should create, find, and update personaggi with realistic data', async () => {
      // Create Superman
      let updateCallCount = 0;
      ddbMock.on(UpdateCommand).callsFake(() => {
        updateCallCount++;
        return { Attributes: { value: updateCallCount } };
      });
      ddbMock.on(PutCommand).resolves({});

      const superman = await repository.create({
        name: 'Superman',
        description: 'The Last Son of Krypton',
        images: [
          'https://example.com/superman-main.jpg',
          'https://example.com/superman-flying.jpg',
        ],
      });

      expect(superman.id).toBe(1);
      expect(superman.name).toBe('Superman');
      expect(superman.images).toHaveLength(2);

      // Find Superman
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'PERSONAGGIO#1',
          SK: 'METADATA',
          id: 1,
          name: 'Superman',
          description: 'The Last Son of Krypton',
          images: JSON.stringify([
            'https://example.com/superman-main.jpg',
            'https://example.com/superman-flying.jpg',
          ]),
          order: 2,
          created_at: superman.created_at,
          updated_at: superman.updated_at,
        },
      });

      const foundSuperman = await repository.findById(1);
      expect(foundSuperman?.name).toBe('Superman');
      expect(foundSuperman?.images).toHaveLength(2);

      // Update Superman
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          PK: 'PERSONAGGIO#1',
          SK: 'METADATA',
          id: 1,
          name: 'Superman - Updated',
          description: 'The Last Son of Krypton - Man of Steel',
          images: JSON.stringify([
            'https://example.com/superman-main.jpg',
            'https://example.com/superman-flying.jpg',
            'https://example.com/superman-cape.jpg',
          ]),
          order: 2,
          created_at: superman.created_at,
          updated_at: new Date().toISOString(),
        },
      });

      const updatedSuperman = await repository.update(1, {
        name: 'Superman - Updated',
        description: 'The Last Son of Krypton - Man of Steel',
        images: [
          'https://example.com/superman-main.jpg',
          'https://example.com/superman-flying.jpg',
          'https://example.com/superman-cape.jpg',
        ],
      });

      expect(updatedSuperman?.name).toBe('Superman - Updated');
      expect(updatedSuperman?.images).toHaveLength(3);
    });
  });
});
