import { randomBytes } from 'node:crypto';
import { BaseConnector } from '../base.js';
import {
  Platform,
  PostIntent,
  ReplyIntent,
  AccountSecret,
  PlatformSecret,
  ConnectorPublishResult,
  ConnectorActivityResult,
  ConnectorReplyResult,
  ConnectorLinkResult,
  ConnectorError,
  ActivityItem,
} from '../../types/index.js';
import { MetaApiClient } from './api-client.js';
import { META_OAUTH_SCOPES, INSTAGRAM_CONTENT_LIMITS, FACEBOOK_CONTENT_LIMITS } from './types.js';

const DEFAULT_REDIRECT_URI = 'http://localhost:3000/callback';

export class MetaInstagramConnector extends BaseConnector {
  platform: Platform = 'meta.instagram';
  private client: MetaApiClient;
  private redirectUri: string;

  constructor(redirectUri: string = DEFAULT_REDIRECT_URI) {
    super();
    this.client = new MetaApiClient();
    this.redirectUri = redirectUri;
  }

  async linkStart(): Promise<{ auth_url: string; state: string }> {
    const state = randomBytes(16).toString('hex');
    const appId = process.env.META_APP_ID;

    if (!appId) {
      throw new ConnectorError(this.platform, 'META_APP_ID environment variable not set');
    }

    const auth_url = this.client.getOAuthUrl(appId, this.redirectUri, state, META_OAUTH_SCOPES);
    return { auth_url, state };
  }

  async linkFinish(code: string, _state: string): Promise<ConnectorLinkResult> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return {
        success: false,
        error: 'META_APP_ID and META_APP_SECRET environment variables must be set',
      };
    }

    try {
      const tokenResponse = await this.client.exchangeCodeForToken(appId, appSecret, code, this.redirectUri);

      const longLivedResponse = await this.client.exchangeForLongLivedToken(
        appId,
        appSecret,
        tokenResponse.access_token
      );

      const pages = await this.client.getPages(longLivedResponse.access_token);

      const pagesWithInstagram = pages.data.filter((p) => p.instagram_business_account);

      if (pagesWithInstagram.length === 0) {
        return {
          success: false,
          error: 'No Instagram Business or Creator accounts found linked to your Facebook Pages',
        };
      }

      const page = pagesWithInstagram[0];
      const instagramId = page.instagram_business_account!.id;

      const igUser = await this.client.getInstagramUser(instagramId, page.access_token);

      const expiresAt = new Date(Date.now() + longLivedResponse.expires_in * 1000).toISOString();

      return {
        success: true,
        account_id: instagramId,
        label: `@${igUser.username}`,
        refresh_token: page.access_token,
        access_token: page.access_token,
        expires_at: expiresAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during OAuth',
      };
    }
  }

  async publishPost(
    intent: PostIntent,
    account: AccountSecret,
    _credentials: PlatformSecret
  ): Promise<ConnectorPublishResult> {
    const accessToken = account.access_token || account.refresh_token;
    const instagramId = account.instagram_business_id || account.account_id;

    if (!accessToken) {
      return { success: false, error: 'No access token available' };
    }

    if (!instagramId) {
      return { success: false, error: 'No Instagram Business ID available' };
    }

    try {
      const content = this.getContentForPlatform(intent, 'meta.instagram');
      const caption = content.text;

      if (caption.length > INSTAGRAM_CONTENT_LIMITS.caption_max_length) {
        return {
          success: false,
          error: `Caption exceeds ${INSTAGRAM_CONTENT_LIMITS.caption_max_length} character limit`,
        };
      }

      const media = content.media || [];
      let containerId: string;

      if (media.length === 0) {
        return {
          success: false,
          error: 'Instagram requires at least one image or video to publish',
        };
      } else if (media.length === 1) {
        const item = media[0];
        const mediaUrl = this.resolveMediaUrl(item.path);

        if (item.type === 'video') {
          const container = await this.client.createInstagramVideoContainer(
            instagramId,
            accessToken,
            mediaUrl,
            caption
          );
          containerId = container.id;
          await this.client.waitForContainerReady(containerId, accessToken);
        } else {
          const container = await this.client.createInstagramImageContainer(
            instagramId,
            accessToken,
            mediaUrl,
            caption
          );
          containerId = container.id;
        }
      } else {
        if (media.length > INSTAGRAM_CONTENT_LIMITS.carousel_max_items) {
          return {
            success: false,
            error: `Carousel cannot exceed ${INSTAGRAM_CONTENT_LIMITS.carousel_max_items} items`,
          };
        }

        const childIds: string[] = [];
        for (const item of media) {
          const mediaUrl = this.resolveMediaUrl(item.path);
          const childContainer = await this.client.createInstagramCarouselItemContainer(
            instagramId,
            accessToken,
            mediaUrl,
            item.type === 'video'
          );
          if (item.type === 'video') {
            await this.client.waitForContainerReady(childContainer.id, accessToken);
          }
          childIds.push(childContainer.id);
        }

        const carouselContainer = await this.client.createInstagramCarouselContainer(
          instagramId,
          accessToken,
          childIds,
          caption
        );
        containerId = carouselContainer.id;
      }

      const publishResult = await this.client.publishInstagramContainer(instagramId, accessToken, containerId);

      const mediaInfo = await this.client.getInstagramMedia(publishResult.id, accessToken);

      return {
        success: true,
        remote_post_id: publishResult.id,
        url: mediaInfo.permalink,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown publishing error',
      };
    }
  }

  async fetchActivity(
    account: AccountSecret,
    _credentials: PlatformSecret,
    cursor?: string
  ): Promise<ConnectorActivityResult> {
    const accessToken = account.access_token || account.refresh_token;
    const instagramId = account.instagram_business_id || account.account_id;

    if (!accessToken || !instagramId) {
      return { success: false, items: [], error: 'Missing access token or Instagram ID' };
    }

    try {
      const items: ActivityItem[] = [];
      return {
        success: true,
        items,
        cursor: cursor,
      };
    } catch (error) {
      return {
        success: false,
        items: [],
        error: error instanceof Error ? error.message : 'Unknown error fetching activity',
      };
    }
  }

  async reply(
    intent: ReplyIntent,
    account: AccountSecret,
    _credentials: PlatformSecret
  ): Promise<ConnectorReplyResult> {
    const accessToken = account.access_token || account.refresh_token;

    if (!accessToken) {
      return { success: false, error: 'No access token available' };
    }

    try {
      const commentId = intent.in_reply_to.remote_comment_id || intent.in_reply_to.remote_post_id;
      const result = await this.client.replyToInstagramComment(commentId, accessToken, intent.content.text);

      return {
        success: true,
        remote_reply_id: result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error posting reply',
      };
    }
  }

  private getContentForPlatform(intent: PostIntent, platform: string) {
    const override = intent.platform_overrides?.[platform];
    return {
      text: override?.text || intent.content.text,
      link: override?.link || intent.content.link,
      media: override?.media || intent.content.media,
    };
  }

  private resolveMediaUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    throw new ConnectorError(
      this.platform,
      `Media must be hosted on a public URL for Instagram publishing. Got: ${path}`
    );
  }
}

export class MetaFacebookConnector extends BaseConnector {
  platform: Platform = 'meta.facebook';
  private client: MetaApiClient;
  private redirectUri: string;

  constructor(redirectUri: string = DEFAULT_REDIRECT_URI) {
    super();
    this.client = new MetaApiClient();
    this.redirectUri = redirectUri;
  }

  async linkStart(): Promise<{ auth_url: string; state: string }> {
    const state = randomBytes(16).toString('hex');
    const appId = process.env.META_APP_ID;

    if (!appId) {
      throw new ConnectorError(this.platform, 'META_APP_ID environment variable not set');
    }

    const scopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_read_user_content'];
    const auth_url = this.client.getOAuthUrl(appId, this.redirectUri, state, scopes);
    return { auth_url, state };
  }

  async linkFinish(code: string, _state: string): Promise<ConnectorLinkResult> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return {
        success: false,
        error: 'META_APP_ID and META_APP_SECRET environment variables must be set',
      };
    }

    try {
      const tokenResponse = await this.client.exchangeCodeForToken(appId, appSecret, code, this.redirectUri);

      const longLivedResponse = await this.client.exchangeForLongLivedToken(
        appId,
        appSecret,
        tokenResponse.access_token
      );

      const pages = await this.client.getPages(longLivedResponse.access_token);

      if (pages.data.length === 0) {
        return {
          success: false,
          error: 'No Facebook Pages found for this account',
        };
      }

      const page = pages.data[0];

      const expiresAt = new Date(Date.now() + longLivedResponse.expires_in * 1000).toISOString();

      return {
        success: true,
        account_id: page.id,
        label: page.name,
        refresh_token: page.access_token,
        access_token: page.access_token,
        expires_at: expiresAt,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during OAuth',
      };
    }
  }

  async publishPost(
    intent: PostIntent,
    account: AccountSecret,
    _credentials: PlatformSecret
  ): Promise<ConnectorPublishResult> {
    const accessToken = account.access_token || account.refresh_token;
    const pageId = account.account_id;

    if (!accessToken) {
      return { success: false, error: 'No access token available' };
    }

    if (!pageId) {
      return { success: false, error: 'No Page ID available' };
    }

    try {
      const content = this.getContentForPlatform(intent, 'meta.facebook');
      const message = content.text;

      if (message.length > FACEBOOK_CONTENT_LIMITS.post_max_length) {
        return {
          success: false,
          error: `Post exceeds ${FACEBOOK_CONTENT_LIMITS.post_max_length} character limit`,
        };
      }

      const media = content.media || [];
      let result: { id: string };

      if (media.length > 0 && media[0].type === 'image') {
        const mediaUrl = this.resolveMediaUrl(media[0].path);
        result = await this.client.publishFacebookPhoto(pageId, accessToken, mediaUrl, message);
      } else {
        result = await this.client.publishFacebookPost(pageId, accessToken, message, content.link?.url);
      }

      const postUrl = `https://www.facebook.com/${result.id.replace('_', '/posts/')}`;

      return {
        success: true,
        remote_post_id: result.id,
        url: postUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown publishing error',
      };
    }
  }

  async fetchActivity(
    account: AccountSecret,
    _credentials: PlatformSecret,
    cursor?: string
  ): Promise<ConnectorActivityResult> {
    const accessToken = account.access_token || account.refresh_token;

    if (!accessToken) {
      return { success: false, items: [], error: 'Missing access token' };
    }

    try {
      const items: ActivityItem[] = [];
      return {
        success: true,
        items,
        cursor: cursor,
      };
    } catch (error) {
      return {
        success: false,
        items: [],
        error: error instanceof Error ? error.message : 'Unknown error fetching activity',
      };
    }
  }

  async reply(
    intent: ReplyIntent,
    account: AccountSecret,
    _credentials: PlatformSecret
  ): Promise<ConnectorReplyResult> {
    const accessToken = account.access_token || account.refresh_token;

    if (!accessToken) {
      return { success: false, error: 'No access token available' };
    }

    try {
      const commentId = intent.in_reply_to.remote_comment_id || intent.in_reply_to.remote_post_id;
      const result = await this.client.replyToFacebookComment(commentId, accessToken, intent.content.text);

      return {
        success: true,
        remote_reply_id: result.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error posting reply',
      };
    }
  }

  private getContentForPlatform(intent: PostIntent, platform: string) {
    const override = intent.platform_overrides?.[platform];
    return {
      text: override?.text || intent.content.text,
      link: override?.link || intent.content.link,
      media: override?.media || intent.content.media,
    };
  }

  private resolveMediaUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    throw new ConnectorError(
      this.platform,
      `Media must be hosted on a public URL for Facebook publishing. Got: ${path}`
    );
  }
}
