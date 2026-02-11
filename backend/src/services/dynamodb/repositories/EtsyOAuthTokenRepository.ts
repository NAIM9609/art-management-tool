/**
 * EtsyOAuthTokenRepository - DynamoDB implementation for Etsy OAuth Token operations
 * 
 * DynamoDB Structure:
 * PK: "ETSY_TOKEN#${shop_id}"
 * SK: "METADATA"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { EtsyOAuthToken, UpsertEtsyOAuthTokenData } from './types';

export class EtsyOAuthTokenRepository {
  private dynamoDB: DynamoDBOptimized;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to EtsyOAuthToken interface
   */
  private mapToToken(item: Record<string, any>): EtsyOAuthToken {
    return {
      shop_id: item.shop_id,
      access_token: item.access_token,
      refresh_token: item.refresh_token,
      token_type: item.token_type || 'Bearer',
      expires_at: item.expires_at,
      scope: item.scope,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Build DynamoDB item from EtsyOAuthToken
   */
  private buildTokenItem(token: EtsyOAuthToken): Record<string, any> {
    const item: Record<string, any> = {
      PK: `ETSY_TOKEN#${token.shop_id}`,
      SK: 'METADATA',
      shop_id: token.shop_id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type,
      expires_at: token.expires_at,
      created_at: token.created_at,
      updated_at: token.updated_at,
    };

    // Add optional fields
    if (token.scope !== undefined) item.scope = token.scope;

    return item;
  }

  /**
   * Find token by shop ID (strongly consistent read)
   */
  async findByShopId(shopId: string): Promise<EtsyOAuthToken | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `ETSY_TOKEN#${shopId}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToToken(result.data);
  }

  /**
   * Create or update (upsert) token
   * Uses PUT operation which replaces the entire item
   */
  async upsert(data: UpsertEtsyOAuthTokenData): Promise<EtsyOAuthToken> {
    const now = new Date().toISOString();
    
    // Check if token already exists to set correct created_at
    const existing = await this.findByShopId(data.shop_id);
    
    const token: EtsyOAuthToken = {
      shop_id: data.shop_id,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type || 'Bearer',
      expires_at: data.expires_at,
      scope: data.scope,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    const item = this.buildTokenItem(token);

    await this.dynamoDB.put({
      item,
    });

    return token;
  }

  /**
   * Check if token is expired for a given shop ID
   * Returns true if token doesn't exist or is expired
   * Uses 5-minute buffer for safety
   */
  async isExpired(shopId: string): Promise<boolean> {
    const token = await this.findByShopId(shopId);
    
    if (!token) {
      return true;
    }

    const fiveMinutesFromNow = new Date();
    fiveMinutesFromNow.setMinutes(fiveMinutesFromNow.getMinutes() + 5);
    
    const expiresAt = new Date(token.expires_at);
    return fiveMinutesFromNow > expiresAt;
  }

  /**
   * Delete token by shop ID
   */
  async delete(shopId: string): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `ETSY_TOKEN#${shopId}`,
        SK: 'METADATA',
      },
    });
  }
}
