import { mockStorage } from './mockStorage';

export const CLOUD_API_BASE = 'https://instantly-resolved-driven-happens.trycloudflare.com/api';
export const DIRECT_IP_API_BASE = 'http://92.4.67.156:5000/api';
export const LOCAL_API_BASE = 'http://localhost:5000/api';

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Check Capacitor native runtime
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return true;
  }
  if (cap && cap.platform && cap.platform !== 'web') {
    return true;
  }

  // 2. In Capacitor Android WebView, scheme is https or capacitor and host is localhost
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:') {
    return true;
  }
  if (window.location.protocol === 'https:' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return true;
  }

  // 3. User agent check for mobile app WebView
  const ua = window.navigator.userAgent || '';
  if (ua.includes('Capacitor') || (ua.includes('Android') && window.location.hostname === 'localhost')) {
    return true;
  }

  return false;
}

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('aam_custom_api_url');
    if (custom) return custom;

    // Mobile APK (Android / iOS) MUST ALWAYS connect to live Oracle Cloud backend
    if (isCapacitorNative()) {
      return CLOUD_API_BASE;
    }

    const hostname = window.location.hostname;
    // Only local PC development over http (e.g. Vite on localhost:5173)
    if (window.location.protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      if (window.location.port === '5000') {
        return `http://${hostname}:5000/api`;
      }
      // If developer explicitly opted into local backend
      if (localStorage.getItem('aam_use_local_backend') === 'true') {
        return LOCAL_API_BASE;
      }
    }
  }
  // Android APK, mobile browser, or GitHub Pages
  return CLOUD_API_BASE;
}

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('aum_auth_token');
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('aum_auth_token', token);
    } else {
      localStorage.removeItem('aum_auth_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const apiBase = getApiBase();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(`${apiBase}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'API request failed');
      }
      return data;
    } catch (err: any) {
      // Critical endpoints must NOT silently swallow failure into mock storage
      const isCriticalAuthEndpoint =
        endpoint.startsWith('/auth/register') ||
        endpoint.startsWith('/auth/login') ||
        endpoint.startsWith('/auth/send-otp') ||
        endpoint.startsWith('/auth/verify-otp') ||
        (endpoint === '/auth/me' && err?.message?.toLowerCase().includes('unauthorized'));

      if (isCriticalAuthEndpoint) {
        throw err;
      }

      // If page is served over HTTPS, do not attempt insecure http:// IP fallback (browsers block mixed content)
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      if (!isHttps && apiBase !== DIRECT_IP_API_BASE && apiBase !== LOCAL_API_BASE) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(`${DIRECT_IP_API_BASE}${endpoint}`, {
            ...options,
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const data = await res.json();
          if (res.ok) {
            return data;
          }
        } catch (fallbackErr) {
          // Continue to mockStorage
        }
      }

      console.warn(`Remote backend unavailable at ${apiBase}. Falling back to sovereign local store for ${endpoint}:`, err?.message || err);
      return mockStorage.handleMockRequest(endpoint, options) as T;
    }
  }

  // Auth
  public async register(body: any) {
    return this.request<{ token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async login(identifier: string, password: string) {
    return this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  }

  public async demoLogin(userId: string) {
    return this.request<{ token: string; user: any }>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  public async sendOtp(recipient: string, type?: 'phone' | 'email') {
    return this.request<{
      success: boolean;
      message: string;
      testingCode?: string;
      demoCode?: string;
      recipient: string;
      type: string;
      expiresInSeconds: number;
    }>('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ recipient, type }),
    });
  }

  public async verifyOtp(recipient: string, otpCode: string, type?: 'phone' | 'email') {
    return this.request<{
      success: boolean;
      verified: boolean;
      recipient: string;
      type: string;
      verificationToken: string;
    }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ recipient, otpCode, type }),
    });
  }

  public async getMe() {
    return this.request<{ user: any }>('/auth/me');
  }

  public async switchStorageMode(storageMode: string) {
    return this.request<{ success: boolean; user: any; message: string }>('/auth/switch-storage-mode', {
      method: 'POST',
      body: JSON.stringify({ storageMode }),
    });
  }

  // Users & Settings
  public async searchUsers(q: string) {
    return this.request<{ users: any[] }>(`/users/search?q=${encodeURIComponent(q)}`);
  }

  public async getOnlineUserIds(): Promise<string[]> {
    try {
      const res = await this.request<{ onlineUserIds: string[] }>('/users/presence');
      return res.onlineUserIds || [];
    } catch {
      return [];
    }
  }

  public async sendHeartbeat() {
    try {
      return await this.request<{ isOnline: boolean; onlineUserIds: string[] }>('/users/heartbeat', {
        method: 'POST',
      });
    } catch {
      return null;
    }
  }

  public async getUser(id: string) {
    return this.request<{ user: any }>(`/users/${id}`);
  }

  public async updateProfile(body: any) {
    return this.request<{ user: any }>('/users/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  public async getSettings() {
    return this.request<{ settings: any }>('/users/settings/me');
  }

  public async updateSettings(settings: any) {
    return this.request<{ settings: any }>('/users/settings/me', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  }

  public async blockUser(id: string) {
    return this.request<{ success: boolean }>(`/users/${id}/block`, { method: 'POST' });
  }

  public async unblockUser(id: string) {
    return this.request<{ success: boolean }>(`/users/${id}/block`, { method: 'DELETE' });
  }

  public async getBlocks() {
    return this.request<{ blockedUsers: any[] }>('/users/blocks/list');
  }

  // Contacts & Friend Requests
  public async getContacts() {
    return this.request<{ contacts: any[] }>('/contacts');
  }

  public async sendFriendRequest(target: string, message?: string) {
    const isUserId = target.startsWith('usr_');
    return this.request<{ request: any }>('/contacts/requests', {
      method: 'POST',
      body: JSON.stringify({
        ...(isUserId ? { recipientId: target } : { identifier: target }),
        message: message?.trim() || undefined,
      }),
    });
  }

  public async syncDeviceContacts(deviceContacts: any[]) {
    return this.request<{ success: boolean; matchedCount: number; matchedUsers: any[] }>('/contacts/sync-device', {
      method: 'POST',
      body: JSON.stringify({ deviceContacts }),
    });
  }

  public async getFriendRequests() {
    return this.request<{ incoming: any[]; outgoing: any[] }>('/contacts/requests');
  }

  public async acceptFriendRequest(id: string) {
    return this.request<{ success: boolean; conversationId?: string }>(`/contacts/requests/${id}/accept`, {
      method: 'POST',
    });
  }

  public async rejectFriendRequest(id: string) {
    return this.request<{ success: boolean }>(`/contacts/requests/${id}/reject`, { method: 'POST' });
  }

  public async cancelFriendRequest(id: string) {
    return this.request<{ success: boolean }>(`/contacts/requests/${id}/cancel`, { method: 'POST' });
  }

  // Messages & Conversations
  public async getConversations() {
    return this.request<{ conversations: any[] }>('/messages/conversations');
  }

  public async getOrCreateDirectConversation(contactUserId: string) {
    return this.request<{ conversation: any }>('/messages/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ contactUserId }),
    });
  }

  public async getMessages(conversationId: string) {
    return this.request<{ messages: any[] }>(`/messages/conversations/${conversationId}/messages`);
  }

  public async sendMessage(conversationId: string, body: any) {
    return this.request<{ message: any }>(`/messages/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async reactToMessage(messageId: string, emoji: string | null) {
    return this.request<{ message: any }>(`/messages/${messageId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  public async starMessage(messageId: string) {
    return this.request<{ isStarred: boolean }>(`/messages/${messageId}/star`, { method: 'POST' });
  }

  public async deleteMessage(messageId: string, deleteForEveryone = false) {
    return this.request<{ success: boolean }>(`/messages/${messageId}`, {
      method: 'DELETE',
      body: JSON.stringify({ deleteForEveryone }),
    });
  }

  public async ackMessage(messageId: string, state: 'delivered' | 'read') {
    return this.request<{ message: any }>(`/messages/${messageId}/ack`, {
      method: 'POST',
      body: JSON.stringify({ state }),
    });
  }

  // Forwarding & Single-Instance Storage (CAS)
  public async forwardMessage(messageId: string, targetConversationIds: string[]) {
    return this.request<{
      success: boolean;
      forwardedMessages: any[];
      mediaRecord: any;
      totalConnectedChats: number;
      savedStorageBytes: number;
    }>(`/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ targetConversationIds }),
    });
  }

  public async getConnectedChats(mediaHash: string) {
    return this.request<{
      mediaRecord: any;
      connectedConversations: any[];
      deviceStorageCopies: number;
      savedBytes: number;
    }>(`/media/${encodeURIComponent(mediaHash)}/connected-chats`);
  }

  public async getMediaRecord(mediaHash: string) {
    return this.request<{ mediaRecord: any }>(`/media/${encodeURIComponent(mediaHash)}`);
  }

  // "My Pending Transfers"
  public async getPendingTransfers() {
    return this.request<{ transfers: any[] }>('/messages/pending-transfers');
  }

  public async retryPendingTransfer(id: string) {
    return this.request<{ transfer: any; message: string }>(`/messages/pending-transfers/${id}/retry`, {
      method: 'POST',
    });
  }

  public async cancelPendingTransfer(id: string) {
    return this.request<{ success: boolean }>(`/messages/pending-transfers/${id}`, { method: 'DELETE' });
  }

  // Calling
  public async startCall(body: any) {
    return this.request<{ call: any }>('/calls/start', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async acceptCall(callId: string) {
    return this.request<{ call: any }>(`/calls/${callId}/accept`, { method: 'POST' });
  }

  public async rejectCall(callId: string) {
    return this.request<{ call: any }>(`/calls/${callId}/reject`, { method: 'POST' });
  }

  public async cancelCall(callId: string) {
    return this.request<{ call: any }>(`/calls/${callId}/cancel`, { method: 'POST' });
  }

  public async endCall(callId: string, durationSeconds: number) {
    return this.request<{ call: any }>(`/calls/${callId}/end`, {
      method: 'POST',
      body: JSON.stringify({ durationSeconds }),
    });
  }

  public async getCallHistory() {
    return this.request<{ history: any[] }>('/calls/history');
  }

  public async clearCallHistory() {
    return this.request<{ success: boolean }>('/calls/history', { method: 'DELETE' });
  }

  public async getActiveCall() {
    return this.request<{ activeCall: any | null }>('/calls/active');
  }

  // Groups & Broadcast
  public async createGroup(body: any) {
    return this.request<{ group: any }>('/groups', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async updateGroup(id: string, body: any) {
    return this.request<{ group: any }>(`/groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  public async addGroupMember(groupId: string, memberId: string) {
    return this.request<{ group: any }>(`/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    });
  }

  public async removeGroupMember(groupId: string, memberId: string) {
    return this.request<{ group: any }>(`/groups/${groupId}/members/${memberId}`, { method: 'DELETE' });
  }

  public async sendBroadcast(recipientIds: string[], text?: string, mediaUrl?: string) {
    return this.request<{ success: boolean; count: number }>('/groups/broadcast', {
      method: 'POST',
      body: JSON.stringify({ recipientIds, text, mediaUrl }),
    });
  }

  // Feed (Daily Reels/Moments)
  public async getDailyFeed() {
    return this.request<{ feedItems: any[] }>('/feed/today');
  }

  public async likeFeedItem(id: string) {
    return this.request<{ likes: string[]; isLiked: boolean }>(`/feed/${id}/like`, { method: 'POST' });
  }

  public async reactFeedItem(id: string, emoji: string) {
    return this.request<{ reactions: Record<string, string> }>(`/feed/${id}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  public async createFeedMoment(mediaUrl: string, mediaType: 'image' | 'video', caption?: string) {
    return this.request<{ feedItem: any }>('/feed', {
      method: 'POST',
      body: JSON.stringify({ mediaUrl, mediaType, caption }),
    });
  }

  // Status (Stories)
  public async getStatusUpdates() {
    return this.request<{ statusGroups: any[] }>('/status');
  }

  public async createStatus(body: any) {
    return this.request<{ status: any }>('/status', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async viewStatus(id: string) {
    return this.request<{ viewersCount: number }>(`/status/${id}/view`, { method: 'POST' });
  }

  public async deleteStatus(id: string) {
    return this.request<{ success: boolean }>(`/status/${id}`, { method: 'DELETE' });
  }

  // Storage & Backup
  public async getStorageSummary() {
    return this.request<any>('/storage/summary');
  }

  public async createBackup(snapshotCiphertext: string, sizeBytes?: number, deviceInfo?: string) {
    return this.request<{ backup: any; message: string }>('/storage/backup', {
      method: 'POST',
      body: JSON.stringify({ snapshotCiphertext, sizeBytes, deviceInfo }),
    });
  }

  public async getBackups() {
    return this.request<{ backups: any[] }>('/storage/backups');
  }

  public async restoreBackup(id: string) {
    return this.request<any>(`/storage/backups/${id}/restore`, { method: 'POST' });
  }

  public async clearCache() {
    return this.request<{ success: boolean; message: string }>('/storage/clear-cache', { method: 'POST' });
  }

  // Advertisements (Ads Space)
  public async getAdvertisements() {
    return this.request<{ advertisements: any[] }>('/ads');
  }

  public async createAdvertisement(body: {
    headline: string;
    caption?: string;
    mediaType: 'video' | 'image';
    mediaUrl: string;
    ctaText?: string;
    ctaLink?: string;
    price?: string;
    tags?: string[];
  }) {
    return this.request<{ advertisement: any }>('/ads', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async likeAdvertisement(id: string) {
    return this.request<{ likes: string[]; likesCount: number; isLiked: boolean }>(`/ads/${id}/like`, {
      method: 'POST',
    });
  }

  public async shareAdvertisement(id: string) {
    return this.request<{ sharesCount: number }>(`/ads/${id}/share`, {
      method: 'POST',
    });
  }

  public async deleteAdvertisement(id: string) {
    return this.request<{ success: boolean }>(`/ads/${id}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();
