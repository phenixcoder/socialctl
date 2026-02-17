import {
  Platform,
  PostIntent,
  ReplyIntent,
  AccountSecret,
  PlatformSecret,
  Connector,
  ConnectorPublishResult,
  ConnectorActivityResult,
  ConnectorReplyResult,
  ConnectorLinkResult,
  ConnectorError,
} from '../types/index.js';

export abstract class BaseConnector implements Connector {
  abstract platform: Platform;
  
  abstract linkStart(): Promise<{ auth_url: string; state: string }>;
  abstract linkFinish(code: string, state: string): Promise<ConnectorLinkResult>;
  
  abstract publishPost(
    intent: PostIntent,
    account: AccountSecret,
    credentials: PlatformSecret
  ): Promise<ConnectorPublishResult>;
  
  abstract fetchActivity(
    account: AccountSecret,
    credentials: PlatformSecret,
    cursor?: string
  ): Promise<ConnectorActivityResult>;
  
  abstract reply(
    intent: ReplyIntent,
    account: AccountSecret,
    credentials: PlatformSecret
  ): Promise<ConnectorReplyResult>;
  
  protected notImplemented(method: string): never {
    throw new ConnectorError(
      this.platform,
      `${method} is not implemented for ${this.platform}`
    );
  }
}

const connectorRegistry = new Map<Platform, Connector>();

export function registerConnector(connector: Connector): void {
  connectorRegistry.set(connector.platform, connector);
}

export function getConnector(platform: Platform): Connector {
  const connector = connectorRegistry.get(platform);
  if (!connector) {
    throw new ConnectorError(platform, `No connector registered for platform: ${platform}`);
  }
  return connector;
}

export function hasConnector(platform: Platform): boolean {
  return connectorRegistry.has(platform);
}

export function listConnectors(): Platform[] {
  return Array.from(connectorRegistry.keys());
}
