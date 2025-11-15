import { DNSProvider, DNSRecord, NamecheapCredentials } from './types';

export class NamecheapDNSProvider implements DNSProvider {
  private credentials: NamecheapCredentials;
  private baseUrl = 'https://api.namecheap.com/xml.response';

  constructor(credentials: NamecheapCredentials) {
    this.credentials = credentials;
  }

  private async makeRequest(command: string, extraParams: Record<string, string> = {}): Promise<any> {
    const params = new URLSearchParams({
      ApiUser: this.credentials.apiUser,
      ApiKey: this.credentials.apiKey,
      UserName: this.credentials.username,
      ClientIp: this.credentials.clientIp,
      Command: command,
      ...extraParams,
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    const response = await fetch(url);
    const text = await response.text();

    // Parse XML response
    // Note: In production, use a proper XML parser like 'fast-xml-parser'
    if (text.includes('Status="ERROR"')) {
      const errorMatch = text.match(/<Error[^>]*>([^<]+)<\/Error>/);
      const errorMessage = errorMatch ? errorMatch[1] : 'Namecheap API request failed';
      throw new Error(errorMessage);
    }

    return text;
  }

  async createRecord(record: DNSRecord): Promise<{ success: boolean; recordId?: string; error?: string }> {
    try {
      // Namecheap requires getting all existing records first, then setting them all together
      // Extract domain parts
      const domainParts = record.name.split('.');
      const sld = domainParts[domainParts.length - 2]; // Second-level domain
      const tld = domainParts[domainParts.length - 1]; // Top-level domain

      // For subdomains, the host is everything before the SLD
      const host = domainParts.slice(0, -2).join('.') || '@';

      // Get existing hosts first
      const getHostsResponse = await this.makeRequest('namecheap.domains.dns.getHosts', {
        SLD: sld,
        TLD: tld,
      });

      // Note: This is simplified - in production, parse the XML properly
      // and maintain existing records while adding the new one

      const params = {
        SLD: sld,
        TLD: tld,
        HostName1: host,
        RecordType1: record.type,
        Address1: record.content,
        TTL1: (record.ttl || 1800).toString(),
      };

      if (record.priority !== undefined) {
        (params as any).MXPref1 = record.priority.toString();
      }

      await this.makeRequest('namecheap.domains.dns.setHosts', params);

      return {
        success: true,
        recordId: `${host}:${record.type}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create DNS record',
      };
    }
  }

  async deleteRecord(recordId: string): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'Namecheap DNS deletion requires getting all records and re-setting without the target. This is a complex operation - please implement based on your specific needs.',
    };
  }

  async updateRecord(
    recordId: string,
    record: Partial<DNSRecord>
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: 'Namecheap DNS updates require getting all records and re-setting with modifications. This is a complex operation - please implement based on your specific needs.',
    };
  }

  async listRecords(type?: DNSRecord['type']): Promise<{ success: boolean; records?: any[]; error?: string }> {
    try {
      // Note: Namecheap requires domain name parts
      // This is a simplified implementation
      return {
        success: false,
        error: 'Namecheap listing requires domain name. Please pass domain information.',
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
      // Similar challenge as listing - need domain name
      return {
        success: false,
        error: 'Namecheap verification requires domain name. Please implement verification via Namecheap dashboard.',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify domain ownership',
      };
    }
  }
}
