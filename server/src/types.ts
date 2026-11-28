export type StorageMode = 'local_device' | 'local_backup' | 'cloud_sync';

export interface User {
  id: string;
  username: string;
  displayName: string;
  phoneNumber?: string;
  email?: string;
  isPhoneVerified?: boolean;
  isEmailVerified?: boolean;
  avatar?: string;
  bio?: string;
  storageMode: StorageMode;
  publicKey?: string;
  deviceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCredentials {
  userId: string;
  passwordHash: string;
  salt: string;
}

export interface UserSettings {
  userId: string;
  allowLastSeen: boolean;
  allowReadReceipts: boolean;
  specialAlertContacts: string[];
  theme: 'dark' | 'light' | 'system';
  autoDownloadMedia: boolean;
  videoQuality: 'auto' | 'high' | 'data_saver';
}

export interface FriendRequest {
  id: string;
  senderId: string;
  recipientId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  userId: string;
  contactUserId: string;
  relationshipStatus: 'accepted';
  createdAt: string;
}

export interface BlockedUser {
  id: string;
  blockerId: string;
  blockedUserId: string;
  createdAt: string;
}

export type ConversationType = 'direct' | 'group' | 'broadcast';

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatar?: string;
  description?: string;
  createdBy: string;
  memberIds: string[];
  adminIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage?: Message;
}

export type MessageContentType = 'text' | 'image' | 'video' | 'audio' | 'mixed';
export type DeliveryState = 'pending' | 'sent' | 'delivered' | 'read';

export interface ForwardInfo {
  originalMessageId: string;
  originalConversationId: string;
  senderName: string;
  forwardedAt: string;
}

export interface MediaRecord {
  hash: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  localBlobUri?: string;
  remoteUrl?: string;
  referencedMessageIds: string[];
  referencedConversationIds: string[];
  createdAt: string;
  lastAccessedAt: string;
  sourceConversationId?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId?: string; // For 1:1
  contentType: MessageContentType;
  text?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaSize?: number;
  mediaDuration?: number; // For audio/video in seconds
  mediaHash?: string; // Content-Addressable single-instance hash
  forwardedFrom?: ForwardInfo;
  connectedConversationCount?: number;
  encryptedPayload?: string; // Ciphertext for E2EE or Cloud Sync
  deliveryState: DeliveryState;
  reactions: Record<string, string>; // userId -> emoji
  isStarred?: boolean;
  isDeleted?: boolean;
  expiresAt?: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface PendingTransfer {
  id: string;
  messageId: string;
  senderId: string;
  recipientId: string;
  contentType: MessageContentType;
  mediaName?: string;
  fileSize?: number;
  previewUrl?: string;
  status: 'queued' | 'transferring' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  lastAttemptAt?: string;
}

export type CallType = 'audio' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'missed' | 'cancelled' | 'ended' | 'busy';

export interface CallSession {
  id: string;
  type: CallType;
  isGroup: boolean;
  conversationId?: string;
  initiatorId: string;
  recipientId?: string; // for 1:1
  participantIds: string[];
  activeParticipantIds: string[];
  status: CallStatus;
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  durationSeconds: number;
}

export interface CallHistoryRecord {
  id: string;
  callId: string;
  userId: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  type: CallType;
  direction: 'incoming' | 'outgoing' | 'missed';
  status: CallStatus;
  startedAt: string;
  durationSeconds: number;
}

export interface DailyFeedItem {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  recipientId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  likes: string[]; // userIds
  reactions: Record<string, string>; // userId -> emoji
  createdAt: string;
  expiresAt: string;
}

export interface StatusUpdate {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl?: string;
  textContent?: string;
  backgroundGradient?: string;
  viewers: string[]; // userIds who viewed
  privacy: 'all_contacts' | 'selected_contacts';
  allowedContactIds?: string[];
  createdAt: string;
  expiresAt: string; // 24 hours from creation
}

export interface UserBackup {
  id: string;
  userId: string;
  version: number;
  snapshotCiphertext: string;
  sizeBytes: number;
  deviceInfo: string;
  createdAt: string;
}

export interface Advertisement {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userPhone?: string;
  mediaType: 'video' | 'image';
  mediaUrl: string;
  headline: string;
  caption: string;
  ctaText?: string;
  ctaLink?: string;
  price?: string;
  likes: string[];
  sharesCount: number;
  tags?: string[];
  createdAt: string;
  expiresAt?: string;
}

