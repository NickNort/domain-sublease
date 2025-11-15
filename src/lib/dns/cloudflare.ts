import { DNSProvider, DNSRecord, CloudflareCredentials } from './types';

export class CloudflareDNSProvider implements DNSProvider {
  private apiToken: string;
  private zoneId: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';

  constructor(credentials: CloudflareCredentials) {
    this.apiToken = credentials.apiToken;
    this.zoneId = credentials.zoneId;
  }

  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.errors?.[0]?.message || 'Cloudflare API request failed');
    }

    return data;
  }

  async createRecord(record: DNSRecord): Promise<{ success: boolean; recordId?: string; error?: string }> {
    try {
      const data = await this.makeRequest(`/zones/${this.zoneId}/dns_records`, 'POST', {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl || 3600,
        priority: record.priority,
      });

      return {
        success: true,
        recordId: data.result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create DNS record',
      };
    }
  }

  async deleteRecord(recordId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.makeRequest(`/zones/${this.zoneId}/dns_records/${recordId}`, 'DELETE');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete DNS record',
      };
    }
  }

  async updateRecord(
    recordId: string,
    record: Partial<DNSRecord>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = {};
      if (record.type) updateData.type = record.type;
      if (record.name) updateData.name = record.name;
      if (record.content) updateData.content = record.content;
      if (record.ttl) updateData.ttl = record.ttl;
      if (record.priority !== undefined) updateData.priority = record.priority;

      await this.makeRequest(`/zones/${this.zoneId}/dns_records/${recordId}`, 'PUT', updateData);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update DNS record',
      };
    }
  }

  async listRecords(type?: DNSRecord['type']): Promise<{ success: boolean; records?: any[]; error?: string }> {
    try {
      const params = type ? `?type=${type}` : '';
      const data = await this.makeRequest(`/zones/${this.zoneId}/dns_records${params}`);

      return {
        success: true,
        records: data.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list DNS records',
      };
    }
  }

  async verifyOwnership(token: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await this.makeRequest(`/zones/${this.zoneId}/dns_records?type=TXT`);

      // Look for TXT record with the verification token
      const verificationRecord = data.result.find((record: any) =>
        record.type === 'TXT' &&
        record.content === token &&
        (record.name === '_domain-verification' || record.name.includes('_domain-verification'))
      );

      if (verificationRecord) {
        return { success: true };
      }

      return {
        success: false,
        error: 'Verification TXT record not found. Please add a TXT record with name "_domain-verification" and the provided token as content.',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify domain ownership',
      };
    }
  }
}
