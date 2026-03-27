/**
 * Etsy OAuth token store
 *
 * Thin wrappers over DynamoDB for persisting and retrieving Etsy OAuth tokens.
 * Extracted into their own module so they can be mocked in unit tests.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

export interface EtsyTokenRecord {
  shopId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface OAuthStateRecord {
  state: string;
  expiresAt: number;
}

interface StoredTokenItem {
  pk: string;
  sk: string;
  entityType: 'ETSY_TOKEN';
  shopId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  updatedAt: string;
}

interface StoredOAuthStateItem {
  pk: string;
  sk: string;
  entityType: 'ETSY_OAUTH_STATE';
  state: string;
  expiresAt: number;
  ttl: number;
  createdAt: string;
}

const tableName = process.env.ETSY_TOKENS_TABLE_NAME || process.env.DYNAMODB_TABLE_NAME || '';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION_NAME || process.env.AWS_REGION,
}));

function ensureTableConfigured(): void {
  if (!tableName) {
    throw new Error('ETSY_TOKENS_TABLE_NAME (or DYNAMODB_TABLE_NAME) is required for Etsy token storage');
  }
}

function tokenPk(shopId: string): string {
  return `ETSY_TOKEN#${shopId}`;
}

function statePk(state: string): string {
  return `ETSY_OAUTH_STATE#${state}`;
}

/**
 * Persist an Etsy token record.
 * In production this writes to DynamoDB (PK=ETSY_TOKEN#<shopId>).
 */
export async function saveToken(record: EtsyTokenRecord): Promise<void> {
  ensureTableConfigured();

  const item: StoredTokenItem = {
    pk: tokenPk(record.shopId),
    sk: tokenPk(record.shopId),
    entityType: 'ETSY_TOKEN',
    shopId: record.shopId,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    expiresAt: record.expiresAt,
    updatedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));
}

/**
 * Retrieve an Etsy token record by shopId.
 * In production this reads from DynamoDB.
 */
export async function getToken(shopId: string): Promise<EtsyTokenRecord | null> {
  ensureTableConfigured();

  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: {
      pk: tokenPk(shopId),
      sk: tokenPk(shopId),
    },
    ConsistentRead: true,
  }));

  const item = result.Item as StoredTokenItem | undefined;
  if (!item || item.entityType !== 'ETSY_TOKEN') {
    return null;
  }

  return {
    shopId: item.shopId,
    accessToken: item.accessToken,
    refreshToken: item.refreshToken,
    expiresAt: item.expiresAt,
  };
}

/**
 * Persist a short-lived OAuth state value for callback validation.
 */
export async function saveOAuthState(record: OAuthStateRecord): Promise<void> {
  ensureTableConfigured();

  const item: StoredOAuthStateItem = {
    pk: statePk(record.state),
    sk: statePk(record.state),
    entityType: 'ETSY_OAUTH_STATE',
    state: record.state,
    expiresAt: record.expiresAt,
    ttl: Math.floor(record.expiresAt / 1000),
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({
    TableName: tableName,
    Item: item,
  }));
}

/**
 * Retrieve a previously stored OAuth state value.
 */
export async function getOAuthState(state: string): Promise<OAuthStateRecord | null> {
  ensureTableConfigured();

  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: {
      pk: statePk(state),
      sk: statePk(state),
    },
    ConsistentRead: true,
  }));

  const item = result.Item as StoredOAuthStateItem | undefined;
  if (!item || item.entityType !== 'ETSY_OAUTH_STATE') {
    return null;
  }

  return {
    state: item.state,
    expiresAt: item.expiresAt,
  };
}

/**
 * Delete an OAuth state value after successful callback processing.
 */
export async function deleteOAuthState(state: string): Promise<void> {
  ensureTableConfigured();

  await ddb.send(new DeleteCommand({
    TableName: tableName,
    Key: {
      pk: statePk(state),
      sk: statePk(state),
    },
  }));
}
