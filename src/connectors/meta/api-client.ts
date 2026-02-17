import {
  META_GRAPH_API_VERSION,
  META_GRAPH_BASE_URL,
  INSTAGRAM_GRAPH_BASE_URL,
  MetaTokenResponse,
  MetaLongLivedTokenResponse,
  MetaRefreshTokenResponse,
  MetaPagesResponse,
  MetaPageInfo,
  MetaUserInfo,
  InstagramUserInfo,
  InstagramContainerResponse,
  InstagramPublishResponse,
  InstagramMediaResponse,
  FacebookPostResponse,
  MetaCommentsResponse,
  MetaError,
} from './types.js';

export class MetaApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${META_GRAPH_BASE_URL}/${META_GRAPH_API_VERSION}`;
  }

  private async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok || (data as MetaError).error) {
      const error = (data as MetaError).error;
      throw new Error(`Meta API Error: ${error?.message || 'Unknown error'} (code: ${error?.code || response.status})`);
    }

    return data as T;
  }

  getOAuthUrl(appId: string, redirectUri: string, state: string, scopes: string[]): string {
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: scopes.join(','),
      response_type: 'code',
    });
    return `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(
    appId: string,
    appSecret: string,
    code: string,
    redirectUri: string
  ): Promise<MetaTokenResponse> {
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
      redirect_uri: redirectUri,
    });
    return this.request<MetaTokenResponse>(`${this.baseUrl}/oauth/access_token?${params.toString()}`);
  }

  async exchangeForLongLivedToken(
    appId: string,
    appSecret: string,
    shortLivedToken: string
  ): Promise<MetaLongLivedTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    });
    return this.request<MetaLongLivedTokenResponse>(`${this.baseUrl}/oauth/access_token?${params.toString()}`);
  }

  async refreshLongLivedToken(accessToken: string): Promise<MetaRefreshTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: accessToken,
    });
    return this.request<MetaRefreshTokenResponse>(
      `${INSTAGRAM_GRAPH_BASE_URL}/refresh_access_token?${params.toString()}`
    );
  }

  async getMe(accessToken: string): Promise<MetaUserInfo> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name',
    });
    return this.request<MetaUserInfo>(`${this.baseUrl}/me?${params.toString()}`);
  }

  async getPages(accessToken: string): Promise<MetaPagesResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name,access_token,instagram_business_account',
    });
    return this.request<MetaPagesResponse>(`${this.baseUrl}/me/accounts?${params.toString()}`);
  }

  async getPageLongLivedToken(pageId: string, userAccessToken: string): Promise<MetaPageInfo> {
    const params = new URLSearchParams({
      access_token: userAccessToken,
      fields: 'id,name,access_token,instagram_business_account',
    });
    return this.request<MetaPageInfo>(`${this.baseUrl}/${pageId}?${params.toString()}`);
  }

  async getInstagramUser(instagramBusinessId: string, accessToken: string): Promise<InstagramUserInfo> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,username,account_type,media_count',
    });
    return this.request<InstagramUserInfo>(`${this.baseUrl}/${instagramBusinessId}?${params.toString()}`);
  }

  async createInstagramImageContainer(
    instagramBusinessId: string,
    accessToken: string,
    imageUrl: string,
    caption?: string
  ): Promise<InstagramContainerResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      image_url: imageUrl,
    });
    if (caption) {
      params.append('caption', caption);
    }
    return this.request<InstagramContainerResponse>(
      `${this.baseUrl}/${instagramBusinessId}/media?${params.toString()}`,
      { method: 'POST' }
    );
  }

  async createInstagramVideoContainer(
    instagramBusinessId: string,
    accessToken: string,
    videoUrl: string,
    caption?: string,
    mediaType: 'REELS' | 'VIDEO' = 'REELS'
  ): Promise<InstagramContainerResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      video_url: videoUrl,
      media_type: mediaType,
    });
    if (caption) {
      params.append('caption', caption);
    }
    return this.request<InstagramContainerResponse>(
      `${this.baseUrl}/${instagramBusinessId}/media?${params.toString()}`,
      { method: 'POST' }
    );
  }

  async createInstagramCarouselItemContainer(
    instagramBusinessId: string,
    accessToken: string,
    mediaUrl: string,
    isVideo: boolean
  ): Promise<InstagramContainerResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      is_carousel_item: 'true',
    });
    if (isVideo) {
      params.append('video_url', mediaUrl);
      params.append('media_type', 'VIDEO');
    } else {
      params.append('image_url', mediaUrl);
    }
    return this.request<InstagramContainerResponse>(
      `${this.baseUrl}/${instagramBusinessId}/media?${params.toString()}`,
      { method: 'POST' }
    );
  }

  async createInstagramCarouselContainer(
    instagramBusinessId: string,
    accessToken: string,
    childrenIds: string[],
    caption?: string
  ): Promise<InstagramContainerResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
    });
    if (caption) {
      params.append('caption', caption);
    }
    return this.request<InstagramContainerResponse>(
      `${this.baseUrl}/${instagramBusinessId}/media?${params.toString()}`,
      { method: 'POST' }
    );
  }

  async publishInstagramContainer(
    instagramBusinessId: string,
    accessToken: string,
    containerId: string
  ): Promise<InstagramPublishResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      creation_id: containerId,
    });
    return this.request<InstagramPublishResponse>(
      `${this.baseUrl}/${instagramBusinessId}/media_publish?${params.toString()}`,
      { method: 'POST' }
    );
  }

  async getInstagramContainerStatus(
    containerId: string,
    accessToken: string
  ): Promise<{ status_code: string; status?: string }> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'status_code,status',
    });
    return this.request<{ status_code: string; status?: string }>(
      `${this.baseUrl}/${containerId}?${params.toString()}`
    );
  }

  async getInstagramMedia(mediaId: string, accessToken: string): Promise<InstagramMediaResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,permalink,timestamp',
    });
    return this.request<InstagramMediaResponse>(`${this.baseUrl}/${mediaId}?${params.toString()}`);
  }

  async publishFacebookPost(
    pageId: string,
    pageAccessToken: string,
    message: string,
    link?: string
  ): Promise<FacebookPostResponse> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      message,
    });
    if (link) {
      params.append('link', link);
    }
    return this.request<FacebookPostResponse>(`${this.baseUrl}/${pageId}/feed?${params.toString()}`, {
      method: 'POST',
    });
  }

  async publishFacebookPhoto(
    pageId: string,
    pageAccessToken: string,
    photoUrl: string,
    caption?: string
  ): Promise<FacebookPostResponse> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      url: photoUrl,
    });
    if (caption) {
      params.append('caption', caption);
    }
    return this.request<FacebookPostResponse>(`${this.baseUrl}/${pageId}/photos?${params.toString()}`, {
      method: 'POST',
    });
  }

  async getInstagramMediaComments(
    mediaId: string,
    accessToken: string,
    cursor?: string
  ): Promise<MetaCommentsResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,text,timestamp,from,like_count',
    });
    if (cursor) {
      params.append('after', cursor);
    }
    return this.request<MetaCommentsResponse>(`${this.baseUrl}/${mediaId}/comments?${params.toString()}`);
  }

  async getFacebookPostComments(
    postId: string,
    accessToken: string,
    cursor?: string
  ): Promise<MetaCommentsResponse> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,message,created_time,from',
    });
    if (cursor) {
      params.append('after', cursor);
    }
    return this.request<MetaCommentsResponse>(`${this.baseUrl}/${postId}/comments?${params.toString()}`);
  }

  async replyToInstagramComment(
    commentId: string,
    accessToken: string,
    message: string
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      access_token: accessToken,
      message,
    });
    return this.request<{ id: string }>(`${this.baseUrl}/${commentId}/replies?${params.toString()}`, {
      method: 'POST',
    });
  }

  async replyToFacebookComment(
    commentId: string,
    accessToken: string,
    message: string
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      access_token: accessToken,
      message,
    });
    return this.request<{ id: string }>(`${this.baseUrl}/${commentId}/comments?${params.toString()}`, {
      method: 'POST',
    });
  }

  async waitForContainerReady(
    containerId: string,
    accessToken: string,
    maxAttempts: number = 30,
    delayMs: number = 2000
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getInstagramContainerStatus(containerId, accessToken);
      if (status.status_code === 'FINISHED') {
        return true;
      }
      if (status.status_code === 'ERROR') {
        throw new Error(`Container processing failed: ${status.status || 'Unknown error'}`);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error('Container processing timeout');
  }
}
