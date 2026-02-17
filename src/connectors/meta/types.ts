/**
 * Meta Graph API types for Instagram and Facebook integration
 */

export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface MetaLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MetaRefreshTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface MetaPageInfo {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
  };
}

export interface MetaPagesResponse {
  data: MetaPageInfo[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

export interface MetaUserInfo {
  id: string;
  name: string;
}

export interface InstagramUserInfo {
  id: string;
  username: string;
  account_type: 'BUSINESS' | 'MEDIA_CREATOR' | 'PERSONAL';
  media_count?: number;
}

export interface InstagramContainerResponse {
  id: string;
}

export interface InstagramPublishResponse {
  id: string;
}

export interface InstagramMediaResponse {
  id: string;
  permalink?: string;
  timestamp?: string;
}

export interface FacebookPostResponse {
  id: string;
  post_id?: string;
}

export interface MetaError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface MetaComment {
  id: string;
  text: string;
  timestamp: string;
  from?: {
    id: string;
    username?: string;
    name?: string;
  };
  like_count?: number;
}

export interface MetaCommentsResponse {
  data: MetaComment[];
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
    previous?: string;
  };
}

export interface InstagramInsightsResponse {
  data: Array<{
    name: string;
    period: string;
    values: Array<{
      value: number;
    }>;
    title: string;
    description: string;
    id: string;
  }>;
}

export const META_GRAPH_API_VERSION = 'v21.0';
export const META_GRAPH_BASE_URL = 'https://graph.facebook.com';
export const INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com';

export const META_OAUTH_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_read_user_content',
  'business_management',
];

export const INSTAGRAM_CONTENT_LIMITS = {
  caption_max_length: 2200,
  hashtag_max_count: 30,
  mention_max_count: 20,
  image_max_size_bytes: 8 * 1024 * 1024, // 8MB
  video_max_size_bytes: 100 * 1024 * 1024, // 100MB for Reels
  video_min_duration_seconds: 3,
  video_max_duration_seconds: 90, // Reels
  carousel_max_items: 10,
};

export const FACEBOOK_CONTENT_LIMITS = {
  post_max_length: 63206,
  link_description_max_length: 500,
  image_max_size_bytes: 4 * 1024 * 1024, // 4MB
  video_max_size_bytes: 10 * 1024 * 1024 * 1024, // 10GB
};
