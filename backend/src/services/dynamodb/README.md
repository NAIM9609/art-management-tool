# DynamoDB Client Wrapper

A production-ready DynamoDB client wrapper with advanced features including cost optimization, automatic batching, retry logic, and comprehensive logging.

## Features

- ✅ **Eventually Consistent Reads** - Save 50% on read costs
- ✅ **Automatic Batch Splitting** - Up to 100 items for reads, 25 for writes
- ✅ **Retry Logic with Exponential Backoff** - Automatic retries for throttled requests
- ✅ **Consumed Capacity Tracking** - Comprehensive logging for all operations
- ✅ **Soft Delete Support** - Implement soft deletes with customizable fields
- ✅ **Sparse GSI Support** - Conditionally populate GSI attributes
- ✅ **Projection Expressions** - Minimize data transfer costs
- ✅ **TypeScript Support** - Fully typed with comprehensive interfaces
- ✅ **Error Handling** - Proper AWS SDK error types and normalization

## Installation

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Configuration

Set the required environment variables:

```bash
export DYNAMODB_TABLE_NAME=your-table-name
export AWS_REGION=us-east-1
```

## Usage

### Initialize the Client

```typescript
import { DynamoDBOptimized } from './services/dynamodb';

const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.DYNAMODB_TABLE_NAME || 'my-table',
  region: 'us-east-1',
  maxRetries: 3,
  retryDelay: 100, // Base delay in ms for exponential backoff
});
```

### Query with Eventually Consistent Reads (50% Cost Savings)

```typescript
import { QueryEventuallyConsistentParams } from './services/dynamodb';

const params: QueryEventuallyConsistentParams = {
  keyConditionExpression: 'userId = :userId',
  expressionAttributeValues: {
    ':userId': 'user-123',
  },
  filterExpression: 'status = :status',
  expressionAttributeValues: {
    ':userId': 'user-123',
    ':status': 'active',
  },
  limit: 50,
};

const result = await dynamoDB.queryEventuallyConsistent(params);

console.log('Items:', result.data);
console.log('Count:', result.count);
console.log('Consumed capacity:', result.consumedCapacity);
console.log('Last evaluated key:', result.lastEvaluatedKey);
```

### Batch Get (Automatic Splitting for >100 Items)

```typescript
import { BatchGetParams } from './services/dynamodb';

const keys = [
  { userId: 'user-1', postId: 'post-1' },
  { userId: 'user-2', postId: 'post-2' },
  // ... up to 1000 items - automatically split into batches of 100
];

const params: BatchGetParams = {
  keys,
  projectionExpression: 'userId, postId, title, createdAt',
  consistentRead: false, // Eventually consistent for cost savings
};

const result = await dynamoDB.batchGetOptimized(params);

console.log('Retrieved items:', result.data);
console.log('Unprocessed keys:', result.unprocessedKeys);
console.log('Total consumed capacity:', result.consumedCapacity);
```

### Batch Write (Automatic Splitting for >25 Items)

```typescript
import { BatchWriteParams } from './services/dynamodb';

const items = [
  { type: 'put', item: { userId: 'user-1', name: 'John', email: 'john@example.com' } },
  { type: 'put', item: { userId: 'user-2', name: 'Jane', email: 'jane@example.com' } },
  { type: 'delete', key: { userId: 'user-3' } },
  // ... up to 500 items - automatically split into batches of 25
];

const params: BatchWriteParams = { items };

const result = await dynamoDB.batchWriteOptimized(params);

console.log('Unprocessed items:', result.unprocessedItems);
console.log('Total consumed capacity:', result.consumedCapacity);
```

### Sparse GSI Support

Create GSI attributes conditionally to save storage costs:

```typescript
import { CreateGSIAttributesParams } from './services/dynamodb';

const item = {
  userId: 'user-123',
  status: 'premium',
  category: 'electronics',
  featured: true,
};

const params: CreateGSIAttributesParams = {
  item,
  gsiConfig: [
    {
      gsiName: 'status-category-index',
      partitionKey: 'gsi_status',
      sortKey: 'gsi_category',
      condition: (item) => item.status === 'premium', // Only add GSI for premium users
      partitionKeyValue: (item) => item.status,
      sortKeyValue: (item) => item.category,
    },
    {
      gsiName: 'featured-index',
      partitionKey: 'gsi_featured',
      condition: (item) => item.featured === true, // Only add GSI for featured items
      partitionKeyValue: () => 'featured',
    },
  ],
};

const itemWithGSI = dynamoDB.createGSIAttributesConditionally(params);

// Result: { userId: 'user-123', status: 'premium', category: 'electronics', 
//           gsi_status: 'premium', gsi_category: 'electronics', gsi_featured: 'featured' }
```

### Projection Expression Builder

Minimize data transfer costs by selecting only needed attributes:

```typescript
import { BuildProjectionParams } from './services/dynamodb';

const params: BuildProjectionParams = {
  attributes: ['userId', 'name', 'email', 'createdAt'],
};

const { projectionExpression, expressionAttributeNames } = 
  dynamoDB.buildProjectionExpression(params);

// Use in queries or gets:
const result = await dynamoDB.get({
  key: { userId: 'user-123' },
  projectionExpression,
});
```

### Atomic Updates

```typescript
import { UpdateParams } from './services/dynamodb';

const params: UpdateParams = {
  key: { userId: 'user-123' },
  updates: {
    name: 'John Updated',
    email: 'john.updated@example.com',
    lastModified: new Date().toISOString(),
  },
  conditionExpression: 'attribute_exists(userId)', // Ensure item exists
  returnValues: 'ALL_NEW',
};

const result = await dynamoDB.update(params);

console.log('Updated item:', result.data);
console.log('Consumed capacity:', result.consumedCapacity);
```

### Soft Delete

```typescript
import { SoftDeleteParams } from './services/dynamodb';

// With default fields (deletedAt)
const params: SoftDeleteParams = {
  key: { userId: 'user-123' },
};

const result = await dynamoDB.softDelete(params);

// With custom fields
const customParams: SoftDeleteParams = {
  key: { userId: 'user-123' },
  deletedAtField: 'removed',
  deletedByField: 'removedBy',
  deletedBy: 'admin-user-456',
};

const customResult = await dynamoDB.softDelete(customParams);
```

### Get Single Item

```typescript
import { GetParams } from './services/dynamodb';

const params: GetParams = {
  key: { userId: 'user-123', postId: 'post-456' },
  projectionExpression: 'userId, postId, title, content',
  consistentRead: false, // Eventually consistent for cost savings
};

const result = await dynamoDB.get(params);

if (result.data) {
  console.log('Item found:', result.data);
} else {
  console.log('Item not found');
}
```

### Put Single Item

```typescript
import { PutParams } from './services/dynamodb';

const params: PutParams = {
  item: {
    userId: 'user-123',
    postId: 'post-456',
    title: 'My Post',
    content: 'Post content here',
    createdAt: new Date().toISOString(),
  },
  conditionExpression: 'attribute_not_exists(userId)', // Prevent overwrite
  returnValues: 'NONE',
};

const result = await dynamoDB.put(params);

console.log('Put consumed capacity:', result.consumedCapacity);
```

### Hard Delete

```typescript
import { DeleteParams } from './services/dynamodb';

const params: DeleteParams = {
  key: { userId: 'user-123', postId: 'post-456' },
  conditionExpression: 'attribute_exists(userId)', // Ensure item exists
  returnValues: 'ALL_OLD', // Return deleted item
};

const result = await dynamoDB.delete(params);

if (result.data) {
  console.log('Deleted item:', result.data);
}
```

## Advanced Features

### Consumed Capacity Logging

All operations automatically log consumed capacity:

```
[DynamoDB] Query (Eventually Consistent) - Consumed Capacity: {"table":"my-table","total":2.5,"read":2.5}
[DynamoDB] BatchWrite - Total Consumed Capacity: 25 units
  {"table":"my-table","total":25,"write":25}
```

### Retry Logic with Exponential Backoff

The client automatically retries on throttling and temporary errors:

- ProvisionedThroughputExceededException
- ThrottlingException
- RequestLimitExceeded
- InternalServerError
- ServiceUnavailable

Retry delays follow exponential backoff: 100ms, 200ms, 400ms (configurable)

### Error Handling

All errors are normalized with proper AWS SDK error types:

```typescript
try {
  await dynamoDB.get({ key: { userId: 'user-123' } });
} catch (error) {
  console.error('Operation failed:', error.message);
  console.error('Error code:', error.code);
  console.error('Status code:', error.statusCode);
}
```

## Cost Optimization Tips

1. **Use Eventually Consistent Reads**: Save 50% on read costs
2. **Use Projection Expressions**: Minimize data transfer
3. **Batch Operations**: Reduce request overhead
4. **Sparse GSIs**: Only index items that need indexing
5. **Monitor Consumed Capacity**: Use logs to identify optimization opportunities

## Testing

Run the comprehensive test suite:

```bash
npm test                 # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
```

The test suite includes:
- Unit tests for all methods
- Error handling and retry logic tests
- Batch splitting tests
- >80% code coverage

## TypeScript Support

All methods are fully typed with comprehensive interfaces:

```typescript
import {
  DynamoDBOptimized,
  TABLE_NAME,
  QueryEventuallyConsistentParams,
  BatchGetParams,
  BatchWriteParams,
  UpdateParams,
  GetParams,
  PutParams,
  DeleteParams,
  SoftDeleteParams,
  CreateGSIAttributesParams,
  BuildProjectionParams,
  DynamoDBResponse,
  QueryResponse,
  BatchGetResponse,
  BatchWriteResponse,
} from './services/dynamodb';
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- All tests pass (`npm test`)
- Code coverage remains >80%
- TypeScript types are properly defined
- Documentation is updated
