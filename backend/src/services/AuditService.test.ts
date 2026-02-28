/**
 * Unit tests for AuditService
 */

import { AuditService } from './AuditService';
import { AuditLogRepository } from './dynamodb/repositories/AuditLogRepository';
import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { AuditLog, PaginatedResponse } from './dynamodb/repositories/types';

// Mock the dependencies
jest.mock('./dynamodb/DynamoDBOptimized');
jest.mock('./dynamodb/repositories/AuditLogRepository');
jest.mock('../config', () => ({
  config: {
    s3: {
      region: 'us-east-1',
    },
  },
}));

describe('AuditService', () => {
  let auditService: AuditService;
  let mockRepository: jest.Mocked<AuditLogRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock repository
    mockRepository = {
      create: jest.fn(),
      findByEntity: jest.fn(),
      findByUser: jest.fn(),
      findByDateRange: jest.fn(),
    } as any;

    // Mock the AuditLogRepository constructor
    (AuditLogRepository as jest.Mock).mockImplementation(() => mockRepository);

    auditService = new AuditService();
  });

  describe('logAction', () => {
    it('should log an action with all parameters', async () => {
      const mockAuditLog: AuditLog = {
        id: 'uuid-123',
        user_id: 'user-1',
        action: 'CREATE',
        entity_type: 'Product',
        entity_id: '123',
        changes: { title: 'New Product' },
        metadata: { ip_address: '192.168.1.1' },
        created_at: '2024-01-01T10:00:00.000Z',
        expires_at: 1735728000,
      };

      mockRepository.create.mockResolvedValue(mockAuditLog);

      const result = await auditService.logAction(
        'user-1',
        'CREATE',
        'Product',
        '123',
        { title: 'New Product' },
        '192.168.1.1'
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 'user-1',
        action: 'CREATE',
        entity_type: 'Product',
        entity_id: '123',
        changes: { title: 'New Product' },
        metadata: { ip_address: '192.168.1.1' },
      });

      expect(result).toEqual(mockAuditLog);
    });

    it('should log an action without optional parameters', async () => {
      const mockAuditLog: AuditLog = {
        id: 'uuid-123',
        user_id: 'user-1',
        action: 'DELETE',
        entity_type: 'Product',
        entity_id: '456',
        created_at: '2024-01-01T10:00:00.000Z',
        expires_at: 1735728000,
      };

      mockRepository.create.mockResolvedValue(mockAuditLog);

      const result = await auditService.logAction(
        'user-1',
        'DELETE',
        'Product',
        '456'
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 'user-1',
        action: 'DELETE',
        entity_type: 'Product',
        entity_id: '456',
        changes: undefined,
        metadata: undefined,
      });

      expect(result).toEqual(mockAuditLog);
    });

    it('should log an action with changes but no IP address', async () => {
      const mockAuditLog: AuditLog = {
        id: 'uuid-123',
        user_id: 'user-1',
        action: 'UPDATE',
        entity_type: 'Order',
        entity_id: '789',
        changes: { status: 'PAID' },
        created_at: '2024-01-01T10:00:00.000Z',
        expires_at: 1735728000,
      };

      mockRepository.create.mockResolvedValue(mockAuditLog);

      const result = await auditService.logAction(
        'user-1',
        'UPDATE',
        'Order',
        '789',
        { status: 'PAID' }
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 'user-1',
        action: 'UPDATE',
        entity_type: 'Order',
        entity_id: '789',
        changes: { status: 'PAID' },
        metadata: undefined,
      });

      expect(result).toEqual(mockAuditLog);
    });

    it('should log an action with IP address but no changes', async () => {
      const mockAuditLog: AuditLog = {
        id: 'uuid-123',
        user_id: 'user-1',
        action: 'LOGIN',
        entity_type: 'User',
        entity_id: 'user-1',
        metadata: { ip_address: '10.0.0.1' },
        created_at: '2024-01-01T10:00:00.000Z',
        expires_at: 1735728000,
      };

      mockRepository.create.mockResolvedValue(mockAuditLog);

      const result = await auditService.logAction(
        'user-1',
        'LOGIN',
        'User',
        'user-1',
        undefined,
        '10.0.0.1'
      );

      expect(mockRepository.create).toHaveBeenCalledWith({
        user_id: 'user-1',
        action: 'LOGIN',
        entity_type: 'User',
        entity_id: 'user-1',
        changes: undefined,
        metadata: { ip_address: '10.0.0.1' },
      });

      expect(result).toEqual(mockAuditLog);
    });
  });

  describe('getEntityHistory', () => {
    it('should get entity history with pagination', async () => {
      const mockResponse: PaginatedResponse<AuditLog> = {
        items: [
          {
            id: 'uuid-1',
            user_id: 'user-1',
            action: 'CREATE',
            entity_type: 'Product',
            entity_id: '123',
            created_at: '2024-01-01T10:00:00.000Z',
            expires_at: 1735728000,
          },
          {
            id: 'uuid-2',
            user_id: 'user-2',
            action: 'UPDATE',
            entity_type: 'Product',
            entity_id: '123',
            changes: { price: 100 },
            created_at: '2024-01-01T11:00:00.000Z',
            expires_at: 1735731600,
          },
        ],
        lastEvaluatedKey: { pk: 'test' },
        count: 2,
      };

      mockRepository.findByEntity.mockResolvedValue(mockResponse);

      const result = await auditService.getEntityHistory('Product', '123', {
        limit: 10,
      });

      expect(mockRepository.findByEntity).toHaveBeenCalledWith('Product', '123', {
        limit: 10,
      });

      expect(result).toEqual(mockResponse);
    });

    it('should get entity history without pagination params', async () => {
      const mockResponse: PaginatedResponse<AuditLog> = {
        items: [],
        count: 0,
      };

      mockRepository.findByEntity.mockResolvedValue(mockResponse);

      const result = await auditService.getEntityHistory('Order', '456');

      expect(mockRepository.findByEntity).toHaveBeenCalledWith('Order', '456', undefined);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getUserActivity', () => {
    it('should get user activity with pagination', async () => {
      const mockResponse: PaginatedResponse<AuditLog> = {
        items: [
          {
            id: 'uuid-1',
            user_id: 'user-1',
            action: 'CREATE',
            entity_type: 'Product',
            entity_id: '123',
            created_at: '2024-01-01T10:00:00.000Z',
            expires_at: 1735728000,
          },
          {
            id: 'uuid-2',
            user_id: 'user-1',
            action: 'UPDATE',
            entity_type: 'Order',
            entity_id: '456',
            created_at: '2024-01-01T11:00:00.000Z',
            expires_at: 1735731600,
          },
        ],
        lastEvaluatedKey: { pk: 'test' },
        count: 2,
      };

      mockRepository.findByUser.mockResolvedValue(mockResponse);

      const result = await auditService.getUserActivity('user-1', {
        limit: 20,
      });

      expect(mockRepository.findByUser).toHaveBeenCalledWith('user-1', {
        limit: 20,
      });

      expect(result).toEqual(mockResponse);
    });

    it('should get user activity without pagination params', async () => {
      const mockResponse: PaginatedResponse<AuditLog> = {
        items: [],
        count: 0,
      };

      mockRepository.findByUser.mockResolvedValue(mockResponse);

      const result = await auditService.getUserActivity('user-2');

      expect(mockRepository.findByUser).toHaveBeenCalledWith('user-2', undefined);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getActivityByDateRange', () => {
    it('should get activity by date range with pagination', async () => {
      const mockResponse: PaginatedResponse<AuditLog> = {
        items: [
          {
            id: 'uuid-1',
            user_id: 'user-1',
            action: 'CREATE',
            entity_type: 'Product',
            entity_id: '123',
            created_at: '2024-01-01T10:00:00.000Z',
            expires_at: 1735728000,
          },
          {
            id: 'uuid-2',
            user_id: 'user-2',
            action: 'UPDATE',
            entity_type: 'Order',
            entity_id: '456',
            created_at: '2024-01-02T11:00:00.000Z',
            expires_at: 1735814400,
          },
        ],
        lastEvaluatedKey: { created_at: '2024-01-02T11:00:00.000Z' },
        count: 2,
      };

      mockRepository.findByDateRange.mockResolvedValue(mockResponse);

      const result = await auditService.getActivityByDateRange(
        '2024-01-01T00:00:00.000Z',
        '2024-01-03T23:59:59.999Z',
        { limit: 50 }
      );

      expect(mockRepository.findByDateRange).toHaveBeenCalledWith(
        '2024-01-01T00:00:00.000Z',
        '2024-01-03T23:59:59.999Z',
        { limit: 50 }
      );

      expect(result).toEqual(mockResponse);
    });

    it('should get activity by date range without pagination params', async () => {
      const mockResponse: PaginatedResponse<AuditLog> = {
        items: [],
        count: 0,
      };

      mockRepository.findByDateRange.mockResolvedValue(mockResponse);

      const result = await auditService.getActivityByDateRange(
        '2024-01-01',
        '2024-01-31'
      );

      expect(mockRepository.findByDateRange).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-01-31',
        undefined
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('initialization', () => {
    it('should initialize with DynamoDB configuration', () => {
      expect(DynamoDBOptimized).toHaveBeenCalledWith({
        tableName: 'art-management-table',
        region: 'us-east-1',
      });

      expect(AuditLogRepository).toHaveBeenCalledWith(expect.any(DynamoDBOptimized));
    });
  });
});
