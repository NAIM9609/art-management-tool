/**
 * Tests for index.ts exports
 */

import * as dynamoDBModule from './index';

describe('DynamoDB Module Exports', () => {
  it('should export DynamoDBOptimized class', () => {
    expect(dynamoDBModule.DynamoDBOptimized).toBeDefined();
  });

  it('should export TABLE_NAME constant (may be undefined)', () => {
    // TABLE_NAME is exported but may be undefined if env var is not set
    expect('TABLE_NAME' in dynamoDBModule).toBe(true);
  });

  it('should expose DynamoDBOptimized as a constructor function', () => {
    // Runtime check: ensure the DynamoDBOptimized class is exported as a function
    expect(typeof dynamoDBModule.DynamoDBOptimized).toBe('function');
  });
});
