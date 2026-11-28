import {
  User,
  Conversation,
  Message,
  PendingTransfer,
  CallHistoryRecord,
  DailyFeedItem,
  StatusUpdate,
  StatusGroup,
  Advertisement,
  UserBackup,
  MediaRecord,
} from '../types';

const STORAGE_KEY = 'aum_local_sovereign_store_v1';

export class MockStorageService {
  private users: User[] = [];
  private contacts: { id: string; userId: string; contactUserId: string; relationshipStatus: string; createdAt: string }[] = [];
  private friendRequests: any[] = [];
  private conversations: Conversation[] = [];
  private messages: Message[] = [];
  private pendingTransfers: PendingTransfer[] = [];
  private callHistory: CallHistoryRecord[] = [];
  private dailyFeedItems: DailyFeedItem[] = [];
  private statusUpdates: StatusUpdate[] = [];
  private advertisements: Advertisement[] = [];
  private backups: UserBackup[] = [];
  private mediaRecords: Record<string, MediaRecord> = {};
  private currentUserId: string = '';

  constructor() {
    this.init();
  }

  private init() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // If legacy demo users are present, reset storage to pristine clean state
        if (parsed.currentUserId === 'usr_aarav' || (parsed.users && parsed.users.some((u: any) => u.id === 'usr_aarav'))) {
          localStorage.removeItem(STORAGE_KEY);
          this.seedDefaultData();
          this.save();
          return;
        }

        this.users = parsed.users || [];
        this.contacts = parsed.contacts || [];
        this.friendRequests = parsed.friendRequests || [];
        this.conversations = parsed.conversations || [];
        this.messages = parsed.messages || [];
        this.pendingTransfers = parsed.pendingTransfers || [];
        this.callHistory = parsed.callHistory || [];
        this.dailyFeedItems = parsed.dailyFeedItems || [];
        this.statusUpdates = parsed.statusUpdates || [];
        this.advertisements = parsed.advertisements || [];
        this.backups = parsed.backups || [];
        this.mediaRecords = parsed.mediaRecords || {};
        this.currentUserId = parsed.currentUserId || '';
        return;
      } catch (e) {
        console.warn('Failed to parse local sovereign store, resetting defaults:', e);
      }
    }

    this.seedDefaultData();
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          users: this.users,
          contacts: this.contacts,
          friendRequests: this.friendRequests,
          conversations: this.conversations,
          messages: this.messages,
          pendingTransfers: this.pendingTransfers,
          callHistory: this.callHistory,
          dailyFeedItems: this.dailyFeedItems,
          statusUpdates: this.statusUpdates,
          advertisements: this.advertisements,
          backups: this.backups,
          mediaRecords: this.mediaRecords,
          currentUserId: this.currentUserId,
        })
      );
    } catch (e) {
      console.warn('Failed to persist to localStorage:', e);
    }
  }

  public computeMediaHash(name: string, size?: number, url?: string): string {
    const raw = `${name}_${size || 0}_${url ? url.split('?')[0] : ''}`;
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `cas_sha256_${hex1}${hex2}`;
  }

  public registerMedia(params: {
    hash: string;
    fileName: string;
    fileSize: number;
    mimeType?: string;
    localBlobUri?: string;
    remoteUrl?: string;
    messageId: string;
    conversationId: string;
  }): MediaRecord {
    const existing = this.mediaRecords[params.hash];
    if (existing) {
      if (!existing.referencedMessageIds.includes(params.messageId)) {
        existing.referencedMessageIds.push(params.messageId);
      }
      if (!existing.referencedConversationIds.includes(params.conversationId)) {
        existing.referencedConversationIds.push(params.conversationId);
      }
      existing.lastAccessedAt = new Date().toISOString();
      return existing;
    }

    const newRecord: MediaRecord = {
      hash: params.hash,
      fileName: params.fileName,
      fileSize: params.fileSize,
      mimeType: params.mimeType || (params.fileName.endsWith('.mp4') ? 'video/mp4' : params.fileName.endsWith('.ogg') || params.fileName.endsWith('.mp3') ? 'audio/ogg' : 'image/jpeg'),
      localBlobUri: params.localBlobUri || params.remoteUrl,
      remoteUrl: params.remoteUrl,
      referencedMessageIds: [params.messageId],
      referencedConversationIds: [params.conversationId],
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      sourceConversationId: params.conversationId,
    };
    this.mediaRecords[params.hash] = newRecord;
    return newRecord;
  }

  private seedDefaultData() {
    this.users = [];
    this.contacts = [];
    this.friendRequests = [];
    this.conversations = [];
    this.messages = [];
    this.pendingTransfers = [];
    this.callHistory = [];
    this.dailyFeedItems = [];
    this.statusUpdates = [];
    this.advertisements = [];
    this.backups = [];
    this.mediaRecords = {};
    this.currentUserId = '';
  }

  // Active User Helper
  public getCurrentUser(): User {
    const user = this.users.find((u) => u.id === this.currentUserId);
    return user || this.users[0];
  }

  public setCurrentUser(userId: string) {
    this.currentUserId = userId;
    this.save();
  }

  // Interceptor for API Requests
  public handleMockRequest(endpoint: string, options: RequestInit = {}): any {
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body as string) : {};
    const [cleanPath, queryString] = endpoint.split('?');
    const urlParams = new URLSearchParams(queryString || '');

    // 1. Auth & Profiles
    if (cleanPath === '/auth/demo-login') {
      const targetUserId = body.userId || 'usr_aarav';
      this.setCurrentUser(targetUserId);
      const user = this.getCurrentUser();
      return { token: `mock_jwt_${user.id}`, user };
    }

    if (cleanPath === '/auth/me') {
      return { user: this.getCurrentUser() };
    }

    if (cleanPath === '/auth/login') {
      const user = this.users.find(
        (u) => u.username === body.identifier || u.email === body.identifier || u.phoneNumber === body.identifier
      ) || this.users[0];
      this.setCurrentUser(user.id);
      return { token: `mock_jwt_${user.id}`, user };
    }

    if (cleanPath === '/auth/register') {
      const newUser: User = {
        id: 'usr_' + Date.now(),
        username: body.username || 'user_' + Date.now(),
        displayName: body.displayName || body.username || 'AAM Sovereign User',
        phoneNumber: body.phoneNumber,
        email: body.email,
        storageMode: body.storageMode || 'local_device',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
        bio: 'Sovereign citizen of AAM 🇮🇳',
        createdAt: new Date().toISOString(),
      };
      this.users.push(newUser);
      this.setCurrentUser(newUser.id);
      this.save();
      return { token: `mock_jwt_${newUser.id}`, user: newUser };
    }

    if (cleanPath === '/auth/send-otp') {
      const code = '123456';
      return {
        success: true,
        message: `OTP sent successfully for ${body.recipient || 'recipient'} (Testing Code: ${code})`,
        testingCode: code,
        demoCode: code,
        recipient: body.recipient,
        type: body.type,
        expiresInSeconds: 600,
      };
    }

    if (cleanPath === '/auth/verify-otp') {
      const code = String(body.otpCode).trim();
      if (code === '123456' || code === '741085' || code.length === 6) {
        return {
          success: true,
          verified: true,
          recipient: body.recipient,
          type: body.type,
          verificationToken: `mock_verify_token_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        };
      }
      return { success: false, error: 'Invalid verification code. Please check and retry.' };
    }

    if (cleanPath === '/users/search') {
      const q = (urlParams.get('q') || '').toLowerCase().trim();
      const cleanDigits = q.replace(/\D/g, '');
      const acceptedIds = (this.contacts || [])
        .filter((c) => c && c.userId === this.currentUserId)
        .map((c) => c.contactUserId);
      const pendingReqs = (this.friendRequests || []).filter(
        (fr) => fr && (fr.senderId === this.currentUserId || fr.recipientId === this.currentUserId) && fr.status === 'pending'
      );

      const matchedUsers = (this.users || [])
        .filter((u) => u && (!q ? u.id !== this.currentUserId : true))
        .filter((u) => {
          if (!u) return false;
          if (!q) return true;
          const matchU = u.username ? u.username.toLowerCase().includes(q) : false;
          const matchD = u.displayName ? u.displayName.toLowerCase().includes(q) : false;
          const matchE = u.email ? u.email.toLowerCase().includes(q) : false;
          const matchP = u.phoneNumber ? u.phoneNumber.includes(q) : false;
          const matchPD = cleanDigits.length >= 3 && u.phoneNumber ? u.phoneNumber.replace(/\D/g, '').includes(cleanDigits) : false;
          return matchU || matchD || matchE || matchP || matchPD;
        })
        .map((u) => {
          const isSelf = u.id === this.currentUserId;
          const isFriend = acceptedIds.includes(u.id);
          const pr = pendingReqs.find((r) => r.senderId === u.id || r.recipientId === u.id);
          let friendRequestStatus: 'incoming' | 'outgoing' | 'none' = 'none';
          if (pr) {
            friendRequestStatus = pr.senderId === this.currentUserId ? 'outgoing' : 'incoming';
          }
          return {
            ...u,
            isSelf,
            isFriend,
            friendRequestStatus,
            friendRequestId: pr?.id,
          };
        });
      return { users: matchedUsers };
    }

    if (cleanPath === '/users/profile' && method === 'PATCH') {
      const user = this.getCurrentUser();
      if (user) {
        if (body.displayName) user.displayName = body.displayName.trim();
        if (body.bio !== undefined) user.bio = body.bio.trim();
        if (body.avatar) user.avatar = body.avatar;
        user.updatedAt = new Date().toISOString();
        this.save();
      }
      return { user };
    }

    if (cleanPath === '/users/storage-mode' && method === 'PATCH') {
      const user = this.getCurrentUser();
      user.storageMode = body.storageMode;
      this.save();
      return { user };
    }

    if (cleanPath === '/users/settings/me') {
      return {
        settings: {
          userId: this.currentUserId,
          theme: 'dark',
          allowLastSeen: true,
          allowReadReceipts: true,
          autoDownloadMedia: true,
          videoQuality: 'high',
          specialAlertContacts: [],
        },
      };
    }

    // 2. Contacts & Friend Requests
    if (cleanPath === '/contacts') {
      const acceptedIds = this.contacts
        .filter((c) => c.userId === this.currentUserId)
        .map((c) => c.contactUserId);
      const contacts = this.users.filter((u) => acceptedIds.includes(u.id));
      return { contacts };
    }

    if (cleanPath === '/contacts/requests') {
      const allUsers = this.users || [];
      const incoming = (this.friendRequests || [])
        .filter((fr) => fr && fr.recipientId === this.currentUserId && fr.status === 'pending')
        .map((fr) => {
          const sender = allUsers.find((u) => u.id === fr.senderId);
          return {
            ...fr,
            sender: sender
              ? { id: sender.id, username: sender.username, displayName: sender.displayName, avatar: sender.avatar, phoneNumber: sender.phoneNumber }
              : fr.sender || null,
          };
        });
      const outgoing = (this.friendRequests || [])
        .filter((fr) => fr && fr.senderId === this.currentUserId && fr.status === 'pending')
        .map((fr) => {
          const recipient = allUsers.find((u) => u.id === fr.recipientId);
          return {
            ...fr,
            recipient: recipient
              ? { id: recipient.id, username: recipient.username, displayName: recipient.displayName, avatar: recipient.avatar, phoneNumber: recipient.phoneNumber }
              : null,
          };
        });
      return { incoming, outgoing };
    }

    if ((cleanPath === '/contacts/requests' || cleanPath === '/contacts/request') && method === 'POST') {
      let recId = body.recipientId;
      if (!recId && body.identifier) {
        const iden = String(body.identifier).trim().toLowerCase();
        const found = (this.users || []).find(
          (u) =>
            u.username.toLowerCase() === iden ||
            (u.phoneNumber && u.phoneNumber.includes(iden)) ||
            (u.email && u.email.toLowerCase() === iden)
        );
        if (found) recId = found.id;
      }

      const recipient = (this.users || []).find((u) => u.id === recId);
      const fr = {
        id: 'fr_' + Date.now(),
        senderId: this.currentUserId,
        recipientId: recId || 'unknown',
        status: 'pending',
        message: body.message?.trim() || undefined,
        createdAt: new Date().toISOString(),
        sender: this.getCurrentUser(),
        recipient: recipient
          ? { id: recipient.id, username: recipient.username, displayName: recipient.displayName, avatar: recipient.avatar, phoneNumber: recipient.phoneNumber }
          : null,
      };
      this.friendRequests.push(fr);
      this.save();
      return { request: fr, friendRequest: fr };
    }

    if (cleanPath === '/contacts/sync-device' && method === 'POST') {
      const devContacts = Array.isArray(body?.deviceContacts) ? body.deviceContacts : [];
      const matchedUsers: any[] = [];
      const now = new Date().toISOString();

      const getDigits10 = (s?: string) => {
        if (!s) return '';
        const d = s.replace(/\D/g, '');
        return d.length >= 10 ? d.slice(-10) : d;
      };

      for (const item of devContacts) {
        if (!item) continue;
        const devName = item.name || '';
        const phones = [
          ...(item.phone ? [item.phone] : []),
          ...(Array.isArray(item.phones) ? item.phones.map((p: any) => (typeof p === 'string' ? p : p?.number)) : []),
        ].filter(Boolean);
        const emails = [
          ...(item.email ? [item.email.toLowerCase()] : []),
          ...(Array.isArray(item.emails) ? item.emails.map((e: any) => (typeof e === 'string' ? e.toLowerCase() : e?.address?.toLowerCase())) : []),
        ].filter(Boolean);

        const candDigits = phones.map(getDigits10);

        for (const u of this.users || []) {
          if (u.id === this.currentUserId) continue;
          const uDigits = getDigits10(u.phoneNumber);
          const uEmail = (u.email || '').toLowerCase();

          const matches =
            (uEmail && emails.includes(uEmail)) ||
            (uDigits && candDigits.some((cd) => cd === uDigits || (cd.length >= 10 && uDigits.length >= 10 && cd.slice(-10) === uDigits.slice(-10))));

          if (matches && !matchedUsers.some((m) => m.id === u.id)) {
            // Ensure accepted contacts
            if (!this.contacts.some((c) => c.userId === this.currentUserId && c.contactUserId === u.id)) {
              this.contacts.push({
                id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                userId: this.currentUserId,
                contactUserId: u.id,
                relationshipStatus: 'accepted',
                createdAt: now,
              });
            }
            if (!this.contacts.some((c) => c.userId === u.id && c.contactUserId === this.currentUserId)) {
              this.contacts.push({
                id: 'c_' + (Date.now() + 1) + '_' + Math.random().toString(36).substring(2, 6),
                userId: u.id,
                contactUserId: this.currentUserId,
                relationshipStatus: 'accepted',
                createdAt: now,
              });
            }
            // Ensure conversation
            let conv = (this.conversations || []).find(
              (c) => c.type === 'direct' && c.memberIds.includes(this.currentUserId) && c.memberIds.includes(u.id)
            );
            if (!conv) {
              conv = {
                id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                type: 'direct',
                title: u.displayName || u.username,
                createdBy: this.currentUserId,
                memberIds: [this.currentUserId, u.id],
                adminIds: [this.currentUserId],
                createdAt: now,
                updatedAt: now,
              };
              this.conversations.push(conv);
            }
            matchedUsers.push({
              id: u.id,
              username: u.username,
              displayName: u.displayName,
              phoneNumber: u.phoneNumber,
              email: u.email,
              avatar: u.avatar,
              deviceContactName: devName || u.displayName,
              isFriend: true,
              isDeviceContact: true,
              conversationId: conv.id,
            });
          }
        }
      }
      this.save();
      return { success: true, matchedCount: matchedUsers.length, matchedUsers };
    }

    if ((cleanPath.startsWith('/contacts/requests/') || cleanPath.startsWith('/contacts/request/')) && cleanPath.endsWith('/accept')) {
      const frId = cleanPath.split('/')[3];
      const fr = this.friendRequests.find((r) => r.id === frId);
      if (fr) {
        fr.status = 'accepted';
        this.contacts.push(
          { id: 'c_' + Date.now(), userId: fr.senderId, contactUserId: fr.recipientId, relationshipStatus: 'accepted', createdAt: new Date().toISOString() },
          { id: 'c_' + (Date.now() + 1), userId: fr.recipientId, contactUserId: fr.senderId, relationshipStatus: 'accepted', createdAt: new Date().toISOString() }
        );
        this.save();
      }
      return { success: true };
    }

    if ((cleanPath.startsWith('/contacts/requests/') || cleanPath.startsWith('/contacts/request/')) && cleanPath.endsWith('/reject')) {
      const frId = cleanPath.split('/')[3];
      const fr = this.friendRequests.find((r) => r.id === frId);
      if (fr) {
        fr.status = 'rejected';
        this.save();
      }
      return { success: true };
    }

    if ((cleanPath.startsWith('/contacts/requests/') || cleanPath.startsWith('/contacts/request/')) && cleanPath.endsWith('/cancel')) {
      const frId = cleanPath.split('/')[3];
      const fr = this.friendRequests.find((r) => r.id === frId && r.senderId === this.currentUserId);
      if (fr) {
        fr.status = 'cancelled';
        this.save();
      }
      return { success: true };
    }

    // 3. Conversations & Messages
    if (endpoint === '/conversations' || endpoint === '/messages/conversations') {
      const userConvs = this.conversations.filter((c) => c.memberIds.includes(this.currentUserId));
      const enriched = userConvs.map((c) => {
        let otherUser = null;
        if (c.type === 'direct') {
          const otherId = c.memberIds.find((id) => id !== this.currentUserId) || c.memberIds[0];
          otherUser = this.users.find((u) => u.id === otherId) || null;
        }

        const convMessages = this.messages
          .filter((m) => m.conversationId === c.id)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const lastMessage = convMessages.length > 0 ? convMessages[convMessages.length - 1] : undefined;
        const unreadCount = convMessages.filter((m) => m.senderId !== this.currentUserId && m.deliveryState !== 'read').length;

        return {
          ...c,
          title: c.name || otherUser?.displayName || 'Chat',
          otherUser,
          lastMessage,
          unreadCount,
        };
      });

      return { conversations: enriched };
    }

    if ((endpoint === '/conversations/direct' || endpoint === '/messages/conversations/direct') && method === 'POST') {
      const contactId = body.contactUserId;
      let conv = this.conversations.find(
        (c) => c.type === 'direct' && c.memberIds.includes(this.currentUserId) && c.memberIds.includes(contactId)
      );

      if (!conv) {
        const other = this.users.find((u) => u.id === contactId);
        conv = {
          id: `conv_${this.currentUserId}_${contactId}`,
          type: 'direct',
          title: other?.displayName || 'Chat',
          name: other?.displayName || 'Chat',
          createdBy: this.currentUserId,
          memberIds: [this.currentUserId, contactId],
          adminIds: [this.currentUserId],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.conversations.unshift(conv);
        this.save();
      }
      return { conversation: conv };
    }

    if (endpoint.includes('/conversations/') && endpoint.endsWith('/messages') && method === 'GET') {
      const parts = endpoint.split('/');
      const convId = parts[parts.indexOf('conversations') + 1];
      const convMsgs = this.messages
        .filter((m) => m.conversationId === convId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      // Mark unread as read and enrich with connected count
      convMsgs.forEach((m) => {
        if (m.senderId !== this.currentUserId && m.deliveryState !== 'read') {
          m.deliveryState = 'read';
          m.readAt = new Date().toISOString();
        }
        if (m.mediaHash && this.mediaRecords[m.mediaHash]) {
          m.connectedConversationCount = this.mediaRecords[m.mediaHash].referencedConversationIds.length;
        }
      });
      this.save();

      return { messages: convMsgs };
    }

    if (endpoint.includes('/conversations/') && endpoint.endsWith('/messages') && method === 'POST') {
      const parts = endpoint.split('/');
      const convId = parts[parts.indexOf('conversations') + 1];

      let mediaHash = body.mediaHash;
      if (body.mediaUrl && !mediaHash) {
        mediaHash = this.computeMediaHash(body.mediaName || 'file', body.mediaSize, body.mediaUrl);
      }

      const newMsg: Message = {
        id: 'msg_' + Date.now(),
        conversationId: convId,
        senderId: this.currentUserId,
        recipientId: body.recipientId,
        contentType: body.contentType || 'text',
        text: body.text,
        mediaUrl: body.mediaUrl,
        mediaName: body.mediaName,
        mediaSize: body.mediaSize,
        mediaDuration: body.mediaDuration,
        mediaHash,
        deliveryState: 'delivered',
        reactions: {},
        createdAt: new Date().toISOString(),
      };

      if (mediaHash) {
        this.registerMedia({
          hash: mediaHash,
          fileName: body.mediaName || 'file',
          fileSize: body.mediaSize || 0,
          remoteUrl: body.mediaUrl,
          messageId: newMsg.id,
          conversationId: convId,
        });
        const rec = this.mediaRecords[mediaHash];
        newMsg.connectedConversationCount = rec.referencedConversationIds.length;
      }

      this.messages.push(newMsg);

      const conv = this.conversations.find((c) => c.id === convId);
      if (conv) {
        conv.updatedAt = new Date().toISOString();
      }

      this.save();
      return { message: newMsg };
    }

    // Forward message (Single-Instance Storage CAS)
    if (endpoint.includes('/messages/') && endpoint.endsWith('/forward') && method === 'POST') {
      const parts = endpoint.split('/');
      const msgId = parts[parts.indexOf('messages') + 1];
      const origMsg = this.messages.find((m) => m.id === msgId);
      if (!origMsg) {
        throw new Error('Message not found');
      }

      const targetConvIds: string[] = body.targetConversationIds || [];
      const origSender = this.users.find((u) => u.id === origMsg.senderId);
      const senderDisplayName = origMsg.senderId === this.currentUserId ? 'You' : (origSender?.displayName || 'Contact');
      const now = new Date().toISOString();

      const forwardedMessages: Message[] = [];

      for (const targetConvId of targetConvIds) {
        const fwdId = 'msg_fwd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        const fwdMsg: Message = {
          id: fwdId,
          conversationId: targetConvId,
          senderId: this.currentUserId,
          contentType: origMsg.contentType,
          text: origMsg.text,
          mediaUrl: origMsg.mediaUrl,
          mediaName: origMsg.mediaName,
          mediaSize: origMsg.mediaSize,
          mediaDuration: origMsg.mediaDuration,
          mediaHash: origMsg.mediaHash,
          forwardedFrom: {
            originalMessageId: origMsg.id,
            originalConversationId: origMsg.conversationId,
            senderName: senderDisplayName,
            forwardedAt: now,
          },
          deliveryState: 'delivered',
          reactions: {},
          createdAt: now,
        };

        this.messages.push(fwdMsg);
        forwardedMessages.push(fwdMsg);

        // Update Single-Instance Media Record (ZERO duplicate copies!)
        if (origMsg.mediaHash) {
          this.registerMedia({
            hash: origMsg.mediaHash,
            fileName: origMsg.mediaName || 'file',
            fileSize: origMsg.mediaSize || 0,
            remoteUrl: origMsg.mediaUrl,
            messageId: fwdId,
            conversationId: targetConvId,
          });
        }

        const conv = this.conversations.find((c) => c.id === targetConvId);
        if (conv) {
          conv.updatedAt = now;
        }
      }

      if (origMsg.mediaHash && this.mediaRecords[origMsg.mediaHash]) {
        const count = this.mediaRecords[origMsg.mediaHash].referencedConversationIds.length;
        forwardedMessages.forEach((m) => (m.connectedConversationCount = count));
        origMsg.connectedConversationCount = count;
      }

      this.save();
      return {
        success: true,
        forwardedMessages,
        mediaRecord: origMsg.mediaHash ? this.mediaRecords[origMsg.mediaHash] : null,
        totalConnectedChats: origMsg.mediaHash ? this.mediaRecords[origMsg.mediaHash].referencedConversationIds.length : 1,
        savedStorageBytes: targetConvIds.length * (origMsg.mediaSize || 0),
      };
    }

    // Media & CAS Connected Chats query
    if (endpoint.startsWith('/media/') && endpoint.endsWith('/connected-chats')) {
      const parts = endpoint.split('/');
      const hash = parts[2];
      const rec = this.mediaRecords[hash];
      if (!rec) {
        return { mediaRecord: null, connectedConversations: [], savedBytes: 0, deviceStorageCopies: 1 };
      }

      const connectedConversations = this.conversations
        .filter((c) => rec.referencedConversationIds.includes(c.id))
        .map((c) => {
          let title = c.name || c.title;
          let avatar = c.avatar;
          if (c.type === 'direct') {
            const otherId = c.memberIds.find((id) => id !== this.currentUserId) || c.memberIds[0];
            const other = this.users.find((u) => u.id === otherId);
            if (other) {
              title = other.displayName;
              avatar = other.avatar;
            }
          }
          const messageCount = this.messages.filter((m) => m.conversationId === c.id && m.mediaHash === hash).length;
          return {
            id: c.id,
            title: title || 'Chat',
            avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
            type: c.type,
            messageCount,
          };
        });

      return {
        mediaRecord: rec,
        connectedConversations,
        deviceStorageCopies: 1, // Proof of Single-Instance Storage
        savedBytes: (rec.referencedConversationIds.length - 1) * rec.fileSize,
      };
    }

    if (endpoint.startsWith('/media/') && method === 'GET') {
      const hash = endpoint.split('/')[2];
      return { mediaRecord: this.mediaRecords[hash] || null };
    }

    if (endpoint === '/messages/pending-transfers' || endpoint === '/messages/pending') {
      const pending = this.pendingTransfers.filter((pt) => pt.senderId === this.currentUserId);
      return { transfers: pending, pendingTransfers: pending };
    }

    if (endpoint.includes('/pending-transfers/') && endpoint.endsWith('/retry')) {
      const parts = endpoint.split('/');
      const ptId = parts[parts.indexOf('pending-transfers') + 1];
      const pt = this.pendingTransfers.find((t) => t.id === ptId);
      if (pt) {
        pt.lastAttemptAt = new Date().toISOString();
        pt.status = 'completed';
        const msg = this.messages.find((m) => m.id === pt.messageId);
        if (msg) msg.deliveryState = 'delivered';
        this.save();
      }
      return { success: true, transfer: pt };
    }

    if (endpoint.includes('/pending-transfers/') && method === 'DELETE') {
      const parts = endpoint.split('/');
      const ptId = parts[parts.indexOf('pending-transfers') + 1];
      this.pendingTransfers = this.pendingTransfers.filter((t) => t.id !== ptId);
      this.save();
      return { success: true };
    }

    if (endpoint.includes('/like') && endpoint.startsWith('/feed/')) {
      const id = endpoint.split('/')[2];
      const feed = this.dailyFeedItems.find((f) => f.id === id);
      if (feed) {
        if (feed.likes.includes(this.currentUserId)) {
          feed.likes = feed.likes.filter((uid) => uid !== this.currentUserId);
        } else {
          feed.likes.push(this.currentUserId);
        }
        this.save();
        return { likes: feed.likes, isLiked: feed.likes.includes(this.currentUserId) };
      }
      return { likes: [] };
    }

    if (endpoint.includes('/react') && endpoint.startsWith('/feed/')) {
      const id = endpoint.split('/')[2];
      const feed = this.dailyFeedItems.find((f) => f.id === id);
      if (feed && body.emoji) {
        feed.reactions[this.currentUserId] = body.emoji;
        this.save();
        return { reactions: feed.reactions };
      }
      return { reactions: {} };
    }

    // 4. Calls
    if (endpoint === '/calls/history') {
      const userCalls = this.callHistory.filter((c) => c.userId === this.currentUserId);
      return { history: userCalls, callHistory: userCalls };
    }

    if ((endpoint === '/calls/start' || endpoint === '/calls/initiate') && method === 'POST') {
      const otherUser = this.users.find((u) => u.id === body.recipientId);
      const newRec: CallHistoryRecord = {
        id: 'ch_' + Date.now(),
        callId: 'call_' + Date.now(),
        userId: this.currentUserId,
        peerId: body.recipientId,
        peerName: otherUser?.displayName || 'Contact',
        peerAvatar: otherUser?.avatar,
        type: body.type || 'video',
        direction: 'outgoing',
        status: 'ended',
        startedAt: new Date().toISOString(),
        durationSeconds: 45,
      };
      this.callHistory.unshift(newRec);
      this.save();
      return {
        call: newRec,
        session: {
          id: newRec.callId,
          type: body.type,
          initiatorId: this.currentUserId,
          recipientId: body.recipientId,
          status: 'ringing',
        },
      };
    }

    // 5. Daily Feed & Status (Stories)
    if (endpoint === '/feed/today' || endpoint === '/feed') {
      return { feedItems: this.dailyFeedItems };
    }

    if (endpoint === '/feed' && method === 'POST') {
      const user = this.getCurrentUser();
      const newFeed: DailyFeedItem = {
        id: 'feed_' + Date.now(),
        senderId: this.currentUserId,
        senderName: user.displayName,
        senderAvatar: user.avatar,
        recipientId: 'all',
        mediaUrl: body.mediaUrl,
        mediaType: body.mediaType || 'image',
        caption: body.caption,
        likes: [],
        reactions: {},
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      this.dailyFeedItems.unshift(newFeed);
      this.save();
      return { feedItem: newFeed };
    }

    if (endpoint === '/status') {
      // Group status updates by user
      const map: Record<string, StatusUpdate[]> = {};
      this.statusUpdates.forEach((su) => {
        if (!map[su.userId]) map[su.userId] = [];
        map[su.userId].push(su);
      });

      const statusGroups: StatusGroup[] = Object.keys(map).map((uid) => {
        const u = this.users.find((usr) => usr.id === uid);
        return {
          user: {
            id: uid,
            displayName: u?.displayName || 'Contact',
            avatar: u?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
            isSelf: uid === this.currentUserId,
          },
          stories: map[uid],
        };
      });

      return { statusGroups };
    }

    if (endpoint === '/status' && method === 'POST') {
      const user = this.getCurrentUser();
      const newSu: StatusUpdate = {
        id: 'stat_' + Date.now(),
        userId: this.currentUserId,
        userName: user.displayName,
        userAvatar: user.avatar,
        mediaType: body.mediaType || 'text',
        textContent: body.textContent,
        mediaUrl: body.mediaUrl,
        backgroundGradient: body.backgroundGradient,
        viewers: [],
        privacy: 'all_contacts',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      this.statusUpdates.unshift(newSu);
      this.save();
      return { status: newSu };
    }

    if (endpoint.startsWith('/status/') && endpoint.endsWith('/view')) {
      const id = endpoint.split('/')[2];
      const su = this.statusUpdates.find((s) => s.id === id);
      if (su && !su.viewers.includes(this.currentUserId)) {
        su.viewers.push(this.currentUserId);
        this.save();
      }
      return { viewersCount: su?.viewers.length || 0 };
    }

    // 6. Advertisements (Ads Space)
    if (endpoint === '/ads') {
      return { advertisements: this.advertisements };
    }

    if (endpoint === '/ads' && method === 'POST') {
      const user = this.getCurrentUser();
      const newAd: Advertisement = {
        id: 'ad_' + Date.now(),
        userId: this.currentUserId,
        userName: user.displayName,
        userAvatar: user.avatar,
        userPhone: user.phoneNumber,
        mediaType: body.mediaType || 'image',
        mediaUrl: body.mediaUrl,
        headline: body.headline,
        caption: body.caption || '',
        price: body.price,
        ctaText: body.ctaText || 'Inquire on Chat',
        ctaLink: body.ctaLink || this.currentUserId,
        likes: [],
        sharesCount: 0,
        tags: body.tags || [],
        createdAt: new Date().toISOString(),
      };
      this.advertisements.unshift(newAd);
      this.save();
      return { advertisement: newAd };
    }

    if (endpoint.startsWith('/ads/') && endpoint.endsWith('/like')) {
      const id = endpoint.split('/')[2];
      const ad = this.advertisements.find((a) => a.id === id);
      if (ad) {
        if (!ad.likes) ad.likes = [];
        const index = ad.likes.indexOf(this.currentUserId);
        if (index > -1) {
          ad.likes.splice(index, 1);
        } else {
          ad.likes.push(this.currentUserId);
        }
        this.save();
        return { likes: ad.likes, likesCount: ad.likes.length, isLiked: ad.likes.includes(this.currentUserId) };
      }
      return { likes: [], likesCount: 0, isLiked: false };
    }

    if (endpoint.startsWith('/ads/') && endpoint.endsWith('/share')) {
      const id = endpoint.split('/')[2];
      const ad = this.advertisements.find((a) => a.id === id);
      if (ad) {
        ad.sharesCount = (ad.sharesCount || 0) + 1;
        this.save();
        return { sharesCount: ad.sharesCount };
      }
      return { sharesCount: 0 };
    }

    if (endpoint.startsWith('/ads/') && method === 'DELETE') {
      const id = endpoint.split('/')[2];
      this.advertisements = this.advertisements.filter((a) => a.id !== id);
      this.save();
      return { success: true };
    }

    // 7. Storage & Backups
    if (endpoint === '/storage/summary') {
      return {
        storageMode: this.getCurrentUser().storageMode,
        localUsageBytes: 1024 * 1024 * 14.8,
        cloudUsageBytes: 1024 * 1024 * 4.2,
        cloudLimitBytes: 1024 * 1024 * 1024 * 5,
        totalConversations: this.conversations.length,
        totalMessages: this.messages.length,
        totalMediaCount: 8,
        pendingTransfersCount: this.pendingTransfers.length,
      };
    }

    if (endpoint === '/storage/backups') {
      return { backups: this.backups };
    }

    if (endpoint === '/storage/backup' && method === 'POST') {
      const newBackup: UserBackup = {
        id: 'bkp_' + Date.now(),
        userId: this.currentUserId,
        version: this.backups.length + 1,
        snapshotCiphertext: body.snapshotCiphertext || 'enc_snapshot_blob_data',
        sizeBytes: 1024 * 1024 * 5.1,
        deviceInfo: 'Sovereign Web Client (Make in India)',
        createdAt: new Date().toISOString(),
      };
      this.backups.unshift(newBackup);
      this.save();
      return { backup: newBackup, message: 'Encrypted backup created successfully' };
    }

    if (endpoint === '/storage/clear-cache') {
      return { success: true, message: 'Local Sovereign Cache Cleared' };
    }

    // Fallback default
    return { success: true };
  }
}

export const mockStorage = new MockStorageService();
