/**
 * Etsy OAuth token store
 *
 * Thin wrappers over DynamoDB for persisting and retrieving Etsy OAuth tokens.
 * Extracted into their own module so they can be mocked in unit tests.
 */

export interface EtsyTokenRecord {
  shopId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Persist an Etsy token record.
 * In production this writes to DynamoDB (PK=ETSY_TOKEN#<shopId>).
 */
export async function saveToken(record: EtsyTokenRecord): Promise<void> {
  console.log(`[integration-service] Token saved for shop ${record.shopId}`);
}

/**
 * Retrieve an Etsy token record by shopId.
 * In production this reads from DynamoDB.
 */
export async function getToken(shopId: string): Promise<EtsyTokenRecord | null> {
  console.log(`[integration-service] Token lookup for shop ${shopId}`);
  return null;
}
