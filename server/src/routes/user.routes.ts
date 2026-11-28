import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/storage';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { BlockedUser } from '../types';
import { getWebSocketGateway } from '../websocket/gateway';

export const userRouter = Router();

// Get real-time online presence status for all active users
userRouter.get('/presence', authMiddleware, (req: AuthRequest, res: Response) => {
  const gw = getWebSocketGateway();
  res.json({ onlineUserIds: gw ? gw.getOnlineUserIds() : [] });
});

// Report device internet connectivity heartbeat (even if app is in background or screen is locked)
userRouter.post('/heartbeat', authMiddleware, (req: AuthRequest, res: Response) => {
  const currentUserId = req.user!.id;
  const gw = getWebSocketGateway();
  if (gw) {
    gw.touchConnectivity(currentUserId);
  }
  res.json({
    isOnline: true,
    onlineUserIds: gw ? gw.getOnlineUserIds() : [currentUserId],
    timestamp: new Date().toISOString(),
  });
});

// Search users by username, phone, email, or displayName (or return all registered users if empty)
userRouter.get('/search', authMiddleware, (req: AuthRequest, res: Response) => {
  const currentUserId = req.user!.id;
  const q = ((req.query.q as string) || '').toLowerCase().trim();
  const cleanDigits = q.replace(/\D/g, '');

  const blockedIds = db
    .getBlockedUsers()
    .filter((b) => b.blockerId === currentUserId || b.blockedUserId === currentUserId)
    .map((b) => (b.blockerId === currentUserId ? b.blockedUserId : b.blockerId));

  const contacts = db.getContacts().filter((c) => c.userId === currentUserId);
  const friendRequests = db.getFriendRequests().filter(
    (r) => (r.senderId === currentUserId || r.recipientId === currentUserId) && r.status === 'pending'
  );

  const enrichUser = (u: any) => {
    const isFriend = contacts.some((c) => c.contactUserId === u.id);
    const pendingReq = friendRequests.find(
      (r) => (r.senderId === currentUserId && r.recipientId === u.id) ||
             (r.recipientId === currentUserId && r.senderId === u.id)
    );

    let friendRequestStatus: 'incoming' | 'outgoing' | 'none' = 'none';
    let friendRequestId: string | undefined;

    if (pendingReq) {
      friendRequestStatus = pendingReq.senderId === currentUserId ? 'outgoing' : 'incoming';
      friendRequestId = pendingReq.id;
    }

    const isSelf = u.id === currentUserId;

    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      phoneNumber: u.phoneNumber,
      email: u.email,
      avatar: u.avatar,
      bio: u.bio,
      storageMode: u.storageMode,
      isSelf,
      isFriend,
      friendRequestStatus,
      friendRequestId,
      createdAt: u.createdAt,
    };
  };

  // If query is empty, return all registered discoverable users (other than current user)
  if (!q) {
    const discoverable = db
      .getUsers()
      .filter((u) => u.id !== currentUserId && !blockedIds.includes(u.id))
      .map(enrichUser);
    res.json({ users: discoverable });
    return;
  }

  // When searching with a query, search across all users (including current user with isSelf: true for confirmation)
  const results = db
    .getUsers()
    .filter((u) => !blockedIds.includes(u.id))
    .filter((u) => {
      const matchUsername = u.username.toLowerCase().includes(q);
      const matchDisplayName = u.displayName.toLowerCase().includes(q);
      const matchEmail = !!(u.email && u.email.toLowerCase().includes(q));
      const userDigits = (u.phoneNumber || '').replace(/\D/g, '');
      const matchPhoneRaw = !!(u.phoneNumber && u.phoneNumber.includes(q));
      const matchPhoneDigits =
        cleanDigits.length >= 3 &&
        !!(
          userDigits.includes(cleanDigits) ||
          cleanDigits.includes(userDigits) ||
          (userDigits.length >= 10 && cleanDigits.length >= 10 && userDigits.slice(-10) === cleanDigits.slice(-10))
        );
      return matchUsername || matchDisplayName || matchEmail || matchPhoneRaw || matchPhoneDigits;
    })
    .map(enrichUser);

  res.json({ users: results });
});

// Get user profile by ID
userRouter.get('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  const user = db.getUsers().find((u) => u.id === req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      storageMode: user.storageMode,
      createdAt: user.createdAt,
    },
  });
});

// Update own profile
userRouter.patch('/profile', authMiddleware, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const { displayName, bio, avatar, publicKey } = req.body;

  if (displayName) user.displayName = displayName.trim();
  if (bio !== undefined) user.bio = bio.trim();
  if (avatar) user.avatar = avatar;
  if (publicKey) user.publicKey = publicKey;
  user.updatedAt = new Date().toISOString();

  db.save();
  res.json({ user });
});

// Get user settings
userRouter.get('/settings/me', authMiddleware, (req: AuthRequest, res: Response) => {
  let settings = db.getSettings().find((s) => s.userId === req.user!.id);
  if (!settings) {
    settings = {
      userId: req.user!.id,
      allowLastSeen: true,
      allowReadReceipts: true,
      specialAlertContacts: [],
      theme: 'dark',
      autoDownloadMedia: true,
      videoQuality: 'high',
    };
    db.getSettings().push(settings);
    db.save();
  }
  res.json({ settings });
});

// Update user settings
userRouter.patch('/settings/me', authMiddleware, (req: AuthRequest, res: Response) => {
  let settings = db.getSettings().find((s) => s.userId === req.user!.id);
  if (!settings) {
    settings = {
      userId: req.user!.id,
      allowLastSeen: true,
      allowReadReceipts: true,
      specialAlertContacts: [],
      theme: 'dark',
      autoDownloadMedia: true,
      videoQuality: 'high',
    };
    db.getSettings().push(settings);
  }

  const { allowLastSeen, allowReadReceipts, specialAlertContacts, theme, autoDownloadMedia, videoQuality } = req.body;
  if (allowLastSeen !== undefined) settings.allowLastSeen = allowLastSeen;
  if (allowReadReceipts !== undefined) settings.allowReadReceipts = allowReadReceipts;
  if (specialAlertContacts !== undefined) settings.specialAlertContacts = specialAlertContacts;
  if (theme !== undefined) settings.theme = theme;
  if (autoDownloadMedia !== undefined) settings.autoDownloadMedia = autoDownloadMedia;
  if (videoQuality !== undefined) settings.videoQuality = videoQuality;

  db.save();
  res.json({ settings });
});

// Block user
userRouter.post('/:id/block', authMiddleware, (req: AuthRequest, res: Response) => {
  const currentUserId = req.user!.id;
  const targetUserId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (currentUserId === targetUserId) {
    res.status(400).json({ error: 'Cannot block yourself' });
    return;
  }

  const existingBlock = db
    .getBlockedUsers()
    .find((b) => b.blockerId === currentUserId && b.blockedUserId === targetUserId);

  if (!existingBlock) {
    const blockRecord: BlockedUser = {
      id: `blk_${uuidv4().substring(0, 8)}`,
      blockerId: currentUserId,
      blockedUserId: targetUserId,
      createdAt: new Date().toISOString(),
    };
    db.getBlockedUsers().push(blockRecord);
    db.save();
  }

  res.json({ success: true, message: 'User blocked' });
});

// Unblock user
userRouter.delete('/:id/block', authMiddleware, (req: AuthRequest, res: Response) => {
  const currentUserId = req.user!.id;
  const targetUserId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const blocks = db.getBlockedUsers();
  const idx = blocks.findIndex((b) => b.blockerId === currentUserId && b.blockedUserId === targetUserId);
  if (idx !== -1) {
    blocks.splice(idx, 1);
    db.save();
  }

  res.json({ success: true, message: 'User unblocked' });
});

// List blocked users
userRouter.get('/blocks/list', authMiddleware, (req: AuthRequest, res: Response) => {
  const currentUserId = req.user!.id;
  const blockedIds = db
    .getBlockedUsers()
    .filter((b) => b.blockerId === currentUserId)
    .map((b) => b.blockedUserId);

  const blockedUsers = db.getUsers().filter((u) => blockedIds.includes(u.id));
  res.json({ blockedUsers });
});
