import { DNSProvider, CloudflareCredentials, Route53Credentials, NamecheapCredentials } from './types';
import { CloudflareDNSProvider } from './cloudflare';
import { Route53DNSProvider } from './route53';
import { NamecheapDNSProvider } from './namecheap';
import { decrypt } from '../encryption';

export type { DNSProvider, DNSRecord } from './types';

export type Registrar = 'CLOUDFLARE' | 'ROUTE53' | 'NAMECHEAP';

/**
 * Create a DNS provider instance based on the registrar type
 */
export function createDNSProvider(
  registrar: Registrar,
  encryptedCredentials: string
): DNSProvider {
  const credentials = JSON.parse(decrypt(encryptedCredentials));

  switch (registrar) {
    case 'CLOUDFLARE':
      return new CloudflareDNSProvider(credentials as CloudflareCredentials);

    case 'ROUTE53':
      return new Route53DNSProvider(credentials as Route53Credentials);

    case 'NAMECHEAP':
      return new NamecheapDNSProvider(credentials as NamecheapCredentials);

    default:
      throw new Error(`Unsupported registrar: ${registrar}`);
  }
}

/**
 * Validate API credentials by attempting a simple operation
 */
export async function validateCredentials(
  registrar: Registrar,
  encryptedCredentials: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const provider = createDNSProvider(registrar, encryptedCredentials);

    // Try to list records to validate credentials
    const result = await provider.listRecords();

    if (result.success) {
      return { valid: true };
    }

    return {
      valid: false,
      error: result.error || 'Failed to validate credentials',
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid credentials format',
    };
  }
}
