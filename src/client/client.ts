import z, { ZodObject, ZodRawShape } from 'zod';

const clientConfig = z.object({
  storeHash: z.string().min(1),
  accessToken: z.string().min(1),
  channelId: z.number(),
});

const storefrontTokenResponse = z.object({
  data: z.object({
    token: z.string(),
  }),
  meta: z.unknown(),
});

const getExpiresAtUTCTime = (expiresAt: number): number => {
  const today = new Date();
  const tomorrow = new Date(today);

  tomorrow.setSeconds(today.getSeconds() + expiresAt);

  return Math.floor(tomorrow.getTime() / 1000);
};

// TODO: Check if we can use Apollo Client instead of this custom client
class ApiClient {
  private readonly config: z.infer<typeof clientConfig>;

  constructor(config: Partial<z.infer<typeof clientConfig>>) {
    this.config = clientConfig.parse(config);
  }

  // eslint-disable-next-line no-restricted-syntax
  private get storefrontApiUrl() {
    const channelIdSegment = this.config.channelId !== 1 ? `-${this.config.channelId}` : '';
    const permanentStoreDomain =
      process.env.NEXT_PUBLIC_BIGCOMMERCE_PERMANENT_STORE_DOMAIN ?? 'mybigcommerce.com';

    return `https://store-${this.config.storeHash}${channelIdSegment}.${permanentStoreDomain}/graphql`;
  }

  // eslint-disable-next-line no-restricted-syntax
  private get apiUrl() {
    const bcApiUrl = process.env.NEXT_PUBLIC_BIGCOMMERCE_API_URL ?? 'https://api.bigcommerce.com';

    return `${bcApiUrl}/stores/${this.config.storeHash}`;
  }

  async fetch(endpoint: string, options?: RequestInit) {
    return fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Auth-Token': this.config.accessToken,
        ...options?.headers,
      },
    });
  }

  async query<ResponseType extends ZodObject<ZodRawShape>>(
    query: string,
    zodObject: ResponseType,
  ): Promise<z.infer<ResponseType>> {
    const {
      data: { token },
    } = await this.generateStorefrontToken();

    const response = await fetch(this.storefrontApiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await response.json();

    return zodObject.parse(data);
  }

  private async generateStorefrontToken() {
    const response = await this.fetch(`/v3/storefront/api-token-customer-impersonation`, {
      method: 'POST',
      headers: {
        'x-bc-customer-id': '',
      },
      body: JSON.stringify({
        channel_id: this.config.channelId,
        expires_at: getExpiresAtUTCTime(300),
      }),
    });

    return storefrontTokenResponse.parse(await response.json());
  }
}

export const http = new ApiClient({
  accessToken: process.env.NEXT_PUBLIC_BIGCOMMERCE_ACCESS_TOKEN,
  channelId: parseInt(process.env.NEXT_PUBLIC_BIGCOMMERCE_CHANNEL_ID ?? '', 10),
  storeHash: process.env.NEXT_PUBLIC_BIGCOMMERCE_STORE_HASH,
});