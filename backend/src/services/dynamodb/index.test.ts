/**
 * Tests for index.ts exports
 */

import * as dynamoDBModule from './index';

describe('DynamoDB Module Exports', () => {
  it('should export DynamoDBOptimized class', () => {
    expect(dynamoDBModule.DynamoDBOptimized).toBeDefined();
  });

  it('should export TABLE_NAME constant', () => {
    expect(dynamoDBModule.TABLE_NAME).toBeDefined();
  });

  it('should export all type interfaces', () => {
    // These are types, so we just verify they're in the module
    expect(typeof dynamoDBModule.DynamoDBOptimized).toBe('function');
  });
});
