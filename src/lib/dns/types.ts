export interface DNSRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';
  name: string;
  content: string;
  ttl?: number;
  priority?: number; // For MX records
}

export interface DNSProvider {
  /**
   * Create a DNS record
   */
  createRecord(record: DNSRecord): Promise<{ success: boolean; recordId?: string; error?: string }>;

  /**
   * Delete a DNS record
   */
  deleteRecord(recordId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Update a DNS record
   */
  updateRecord(recordId: string, record: Partial<DNSRecord>): Promise<{ success: boolean; error?: string }>;

  /**
   * List DNS records for a domain
   */
  listRecords(type?: DNSRecord['type']): Promise<{ success: boolean; records?: any[]; error?: string }>;

  /**
   * Verify domain ownership via TXT record
   */
  verifyOwnership(token: string): Promise<{ success: boolean; error?: string }>;
}

export interface CloudflareCredentials {
  apiToken: string;
  zoneId: string;
}

export interface Route53Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  hostedZoneId: string;
  region?: string;
}

export interface NamecheapCredentials {
  apiKey: string;
  apiUser: string;
  username: string;
  clientIp: string;
}
