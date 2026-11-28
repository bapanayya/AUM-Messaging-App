import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Check,
  X,
  MessageSquare,
  Phone,
  Video,
  Clock,
  UserCheck,
  RefreshCw,
  Sparkles,
  Send,
  AlertCircle,
  Inbox,
  SendHorizontal,
  Smartphone,
  MessageCircle,
  Upload,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useSocial } from '../../context/SocialContext';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { api } from '../../services/api';
import { ErrorBoundary } from '../common/ErrorBoundary';
import {
  readDeviceContacts,
  parseVCardText,
  parseManualPhoneList,
  isDeviceContactsSupported,
} from '../../services/deviceContacts';

interface ContactsModalProps {
  onClose: () => void;
  onOpenDirectChat: (userId: string) => void;
  initialTab?: 'phone' | 'search' | 'contacts' | 'requests';
  initialQuery?: string;
}

const ContactsModalInner: React.FC<ContactsModalProps> = ({
  onClose,
  onOpenDirectChat,
  initialTab = 'phone',
  initialQuery = '',
}) => {
  const {
    contacts = [],
    deviceMatchedContacts = [],
    friendRequests = { incoming: [], outgoing: [] },
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    sendFriendRequest,
    syncDeviceContacts,
    loadContacts,
    loadFriendRequests,
  } = useSocial();
  const { user, onlineUserIds = [] } = useAuth();
  const { startCall } = useCall();

  const [activeTab, setActiveTab] = useState<'phone' | 'search' | 'contacts' | 'requests'>(initialTab);
  const [requestsSubTab, setRequestsSubTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [sendingRequestTo, setSendingRequestTo] = useState<Record<string, boolean>>({});
  const [filterMode, setFilterMode] = useState<'all' | 'online' | 'new'>('all');

  // Device Contacts Sync State
  const [isSyncingDevice, setIsSyncingDevice] = useState(false);
  const [deviceSyncStatus, setDeviceSyncStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    matchedCount?: number;
  } | null>(null);
  const [manualImportOpen, setManualImportOpen] = useState(false);
  const [manualImportText, setManualImportText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Message Friend Request Modal State
  const [customMessageModalUser, setCustomMessageModalUser] = useState<{
    id: string;
    displayName: string;
    username: string;
    avatar?: string;
    phoneNumber?: string;
  } | null>(null);
  const [customMessageText, setCustomMessageText] = useState("Hi, I'd like to connect with you on AAM!");
  const [isSendingCustomRequest, setIsSendingCustomRequest] = useState(false);

  // Direct Send Friend Request Form State (in Requests Tab)
  const [directRecipientInput, setDirectRecipientInput] = useState('');
  const [directMessageInput, setDirectMessageInput] = useState('');
  const [isSendingDirect, setIsSendingDirect] = useState(false);
  const [directSendStatus, setDirectSendStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const debounceTimerRef = useRef<any>(null);

  // Fetch registered users from backend
  const fetchRegisteredUsers = async (query = '') => {
    setIsLoadingUsers(true);
    try {
      const res = await api.searchUsers(query);
      setRegisteredUsers(Array.isArray(res?.users) ? res.users : []);
    } catch (err: any) {
      console.error('Error fetching registered users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchRegisteredUsers(searchQuery);
    if (loadFriendRequests) loadFriendRequests();
    if (loadContacts) loadContacts();
  }, []);

  // Debounced search handling
  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchRegisteredUsers(val.trim());
    }, 250);
  };

  // Sync Device Contacts handler
  const handleSyncDeviceContacts = async () => {
    setIsSyncingDevice(true);
    setDeviceSyncStatus(null);
    try {
      const readRes = await readDeviceContacts();

      if (readRes.error && readRes.contacts.length === 0) {
        setDeviceSyncStatus({ type: 'error', message: readRes.error });
        setIsSyncingDevice(false);
        return;
      }

      if (readRes.contacts.length === 0) {
        setDeviceSyncStatus({
          type: 'info',
          message: 'No contacts found on device, or contact selection was cancelled.',
        });
        setIsSyncingDevice(false);
        return;
      }

      const syncRes = await syncDeviceContacts(readRes.contacts);
      const count = syncRes?.matchedCount || 0;
      setDeviceSyncStatus({
        type: 'success',
        matchedCount: count,
        message:
          count > 0
            ? `Successfully found ${count} contact${count === 1 ? '' : 's'} from your device registered on AAM! They are now connected and ready for sovereign chat.`
            : 'Scanned your phonebook: none of these contacts are registered on AAM yet. Invite them to join!',
      });

      await fetchRegisteredUsers(searchQuery);
      if (loadContacts) await loadContacts();
    } catch (err: any) {
      setDeviceSyncStatus({
        type: 'error',
        message: err?.message || 'Failed to sync device contacts.',
      });
    } finally {
      setIsSyncingDevice(false);
    }
  };

  // Manual import (.vcf file or text paste)
  const handleManualImport = async (text: string) => {
    if (!text.trim()) return;
    setIsSyncingDevice(true);
    try {
      const parsed = text.includes('BEGIN:VCARD') ? parseVCardText(text) : parseManualPhoneList(text);
      if (parsed.length === 0) {
        setDeviceSyncStatus({ type: 'error', message: 'No valid phone numbers found in input.' });
        return;
      }
      const syncRes = await syncDeviceContacts(parsed);
      const count = syncRes?.matchedCount || 0;
      setDeviceSyncStatus({
        type: 'success',
        matchedCount: count,
        message: `Imported ${parsed.length} contacts! Found ${count} registered on AAM.`,
      });
      setManualImportOpen(false);
      setManualImportText('');
      await fetchRegisteredUsers(searchQuery);
      if (loadContacts) await loadContacts();
    } catch (err: any) {
      setDeviceSyncStatus({ type: 'error', message: err?.message || 'Import failed.' });
    } finally {
      setIsSyncingDevice(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        handleManualImport(text);
      }
    };
    reader.readAsText(file);
  };

  // Open Custom Message Modal for strangers in Search
  const handleOpenCustomMessageModal = (u: any) => {
    setCustomMessageModalUser({
      id: u.id,
      displayName: u.displayName || u.username || 'AAM User',
      username: u.username || 'user',
      avatar: u.avatar,
      phoneNumber: u.phoneNumber,
    });
    setCustomMessageText("Hi, I'd like to connect with you on AAM!");
  };

  // Submit Friend Request with Custom Message
  const handleSendCustomRequest = async () => {
    if (!customMessageModalUser) return;
    setIsSendingCustomRequest(true);
    try {
      await sendFriendRequest(customMessageModalUser.id, customMessageText);
      await fetchRegisteredUsers(searchQuery);
      if (loadFriendRequests) await loadFriendRequests();
      setCustomMessageModalUser(null);
      setCustomMessageText('');
    } catch (err: any) {
      console.error('Send friend request error:', err);
    } finally {
      setIsSendingCustomRequest(false);
    }
  };

  // Quick Direct Send in Requests Tab
  const handleDirectSendRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const ident = directRecipientInput.trim();
    if (!ident) return;

    setIsSendingDirect(true);
    setDirectSendStatus(null);
    try {
      await sendFriendRequest(ident, directMessageInput.trim() || undefined);
      setDirectSendStatus({
        type: 'success',
        message: `Friend request sent to "${ident}"!`,
      });
      setDirectRecipientInput('');
      setDirectMessageInput('');
      if (loadFriendRequests) await loadFriendRequests();
      await fetchRegisteredUsers(searchQuery);
      setRequestsSubTab('outgoing');
    } catch (err: any) {
      setDirectSendStatus({
        type: 'error',
        message: err?.message || `Unable to find user "${ident}". Please check username or mobile number.`,
      });
    } finally {
      setIsSendingDirect(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelFriendRequest(requestId);
      await fetchRegisteredUsers(searchQuery);
      if (loadFriendRequests) await loadFriendRequests();
    } catch (err: any) {
      console.error('Cancel request error:', err);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId);
      await fetchRegisteredUsers(searchQuery);
      if (loadFriendRequests) await loadFriendRequests();
      if (loadContacts) await loadContacts();
    } catch (err: any) {
      console.error('Accept request error:', err);
    }
  };

  // Safe filter for displayed registered users
  const displayedUsers = useMemo(() => {
    if (!Array.isArray(registeredUsers)) return [];
    return registeredUsers.filter((u) => {
      if (!u || !u.id) return false;
      if (filterMode === 'online') {
        return Array.isArray(onlineUserIds) && onlineUserIds.includes(u.id);
      }
      if (filterMode === 'new') {
        return !u.isFriend && (u.friendRequestStatus === 'none' || !u.friendRequestStatus);
      }
      return true;
    });
  }, [registeredUsers, filterMode, onlineUserIds]);

  // Safe filter for accepted friends
  const filteredContacts = useMemo(() => {
    if (!Array.isArray(contacts)) return [];
    const q = (searchQuery || '').toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter((c) => {
      if (!c) return false;
      const dName = (c.displayName || '').toLowerCase();
      const uName = (c.username || '').toLowerCase();
      const phone = c.phoneNumber || '';
      return dName.includes(q) || uName.includes(q) || phone.includes(q);
    });
  }, [contacts, searchQuery]);

  // Merged Phonebook / Device Contacts list on AAM
  const displayedDeviceContacts = useMemo(() => {
    const list = Array.isArray(deviceMatchedContacts) ? [...deviceMatchedContacts] : [];
    // Also include contacts that have isDeviceContact or are matched
    contacts.forEach((c) => {
      if (c && !list.some((d) => d.id === c.id) && c.phoneNumber) {
        list.push(c);
      }
    });
    return list;
  }, [deviceMatchedContacts, contacts]);

  const incomingList = Array.isArray(friendRequests?.incoming) ? friendRequests.incoming : [];
  const outgoingList = Array.isArray(friendRequests?.outgoing) ? friendRequests.outgoing : [];
  const supportInfo = isDeviceContactsSupported();

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 select-none animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-slate-800">
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <span>AAM Contacts & Friends</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Cloud Live
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Device contacts, search people, friend requests</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4-Tab Switcher (Scrollable on small mobile screens) */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/70 text-xs overflow-x-auto">
          {/* Tab 1: Phone Contacts */}
          <button
            onClick={() => setActiveTab('phone')}
            className={`py-3 font-semibold transition border-b-2 flex items-center justify-center space-x-1 sm:space-x-1.5 ${
              activeTab === 'phone'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="truncate">Device</span>
            {displayedDeviceContacts.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                {displayedDeviceContacts.length}
              </span>
            )}
          </button>

          {/* Tab 2: Find People (Global Search) */}
          <button
            onClick={() => setActiveTab('search')}
            className={`py-3 font-semibold transition border-b-2 flex items-center justify-center space-x-1 sm:space-x-1.5 ${
              activeTab === 'search'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">Search</span>
            {registeredUsers.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {registeredUsers.length}
              </span>
            )}
          </button>

          {/* Tab 3: Friends */}
          <button
            onClick={() => setActiveTab('contacts')}
            className={`py-3 font-semibold transition border-b-2 flex items-center justify-center space-x-1 sm:space-x-1.5 ${
              activeTab === 'contacts'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="truncate">Friends</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {contacts.length}
            </span>
          </button>

          {/* Tab 4: Requests */}
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-3 font-semibold transition border-b-2 flex items-center justify-center space-x-1 sm:space-x-1.5 ${
              activeTab === 'requests'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <SendHorizontal className="w-3.5 h-3.5" />
            <span className="truncate">Requests</span>
            {incomingList.length > 0 ? (
              <span className="bg-rose-500 text-white rounded-full text-[9px] px-1.5 py-0.2 font-bold animate-pulse">
                {incomingList.length}
              </span>
            ) : outgoingList.length > 0 ? (
              <span className="bg-amber-500 text-slate-950 rounded-full text-[9px] px-1.5 py-0.2 font-bold">
                {outgoingList.length}
              </span>
            ) : null}
          </button>
        </div>

        {/* TAB 1: Device Contacts (Direct Chat Ready) */}
        {activeTab === 'phone' && (
          <div className="flex-1 overflow-hidden flex flex-col p-3 sm:p-4 space-y-3">
            {/* Sync Action Banner */}
            <div className="p-3 bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400">
                  <Smartphone className="w-4 h-4" />
                  <span>Sync Device Contacts</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-tight">
                  Contacts in your phonebook registered on AAM are automatically connected for instant chat.
                </p>
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0">
                <button
                  onClick={handleSyncDeviceContacts}
                  disabled={isSyncingDevice}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-1.5 transition shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDevice ? 'animate-spin' : ''}`} />
                  <span>{isSyncingDevice ? 'Scanning Phone...' : 'Sync Phonebook'}</span>
                </button>

                <button
                  onClick={() => setManualImportOpen(!manualImportOpen)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Import vCard (.vcf) or Paste Numbers"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Sync Feedback Message */}
            {deviceSyncStatus && (
              <div
                className={`p-2.5 rounded-xl text-[11px] flex items-center justify-between space-x-2 ${
                  deviceSyncStatus.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                    : deviceSyncStatus.type === 'info'
                    ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                    : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                }`}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  {deviceSyncStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="truncate">{deviceSyncStatus.message}</span>
                </div>
                <button
                  onClick={() => setDeviceSyncStatus(null)}
                  className="text-slate-400 hover:text-slate-200 flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Manual Import Accordion */}
            {manualImportOpen && (
              <div className="p-3 bg-slate-950/80 border border-slate-700/80 rounded-2xl space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    <span>Import Contacts (vCard .vcf or Paste Numbers)</span>
                  </h4>
                  <button
                    onClick={() => setManualImportOpen(false)}
                    className="text-slate-400 hover:text-slate-200 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Select a .vcf file exported from your contacts, or paste phone numbers separated by newlines:
                </p>

                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".vcf,text/vcard"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-medium border border-slate-700 flex items-center space-x-1 transition"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Choose .vcf File</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="text"
                    placeholder="e.g. Kavya, 9876543210 or paste multiple numbers"
                    value={manualImportText}
                    onChange={(e) => setManualImportText(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => handleManualImport(manualImportText)}
                    disabled={!manualImportText.trim() || isSyncingDevice}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs"
                  >
                    Sync
                  </button>
                </div>
              </div>
            )}

            {/* Matched Device Contacts List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 divide-y divide-slate-800/40">
              {displayedDeviceContacts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                  <Smartphone className="w-10 h-10 text-slate-700" />
                  <p className="font-semibold text-slate-300">No device contacts synced yet</p>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    Tap <strong>"Sync Phonebook"</strong> above to allow AAM to discover which of your phone contacts are registered. They'll be available to chat immediately!
                  </p>
                  <button
                    onClick={handleSyncDeviceContacts}
                    disabled={isSyncingDevice}
                    className="mt-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDevice ? 'animate-spin' : ''}`} />
                    <span>Scan Device Contacts Now</span>
                  </button>
                </div>
              ) : (
                displayedDeviceContacts.map((c) => {
                  if (!c || !c.id) return null;
                  const isOnline = Boolean(Array.isArray(onlineUserIds) && onlineUserIds.includes(c.id));
                  const displayName = c.displayName || c.username || 'AAM User';
                  const username = c.username || 'user';
                  const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;

                  return (
                    <div
                      key={c.id}
                      className="pt-2 pb-1 bg-slate-900/60 hover:bg-slate-800/40 rounded-2xl p-2.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border border-transparent hover:border-slate-800"
                    >
                      {/* User Info */}
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          <img
                            src={c.avatar || defaultAvatar}
                            alt={displayName}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = defaultAvatar;
                            }}
                            className="w-11 h-11 rounded-full object-cover border border-slate-700 shadow-sm"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-slate-900 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                            }`}
                            title={isOnline ? 'Online' : 'Offline'}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h4 className="text-xs font-bold text-slate-100 truncate">{displayName}</h4>
                            <span className="flex-shrink-0 text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              Device Contact
                            </span>
                          </div>
                          {c.deviceContactName && c.deviceContactName !== displayName && (
                            <p className="text-[10px] text-emerald-400/90 truncate">
                              Phonebook: "{c.deviceContactName}"
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400 truncate">@{username}</p>
                          {c.phoneNumber && (
                            <p className="text-[10px] text-amber-400/80 font-mono truncate">{c.phoneNumber}</p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons: Instant Chat (Zero Friend Request Barrier) */}
                      <div className="flex items-center space-x-1.5 flex-shrink-0 justify-end">
                        <button
                          onClick={() => {
                            onOpenDirectChat(c.id);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 text-xs font-bold flex items-center space-x-1.5 transition shadow-sm"
                          title="Chat Immediately"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Chat</span>
                        </button>

                        <button
                          onClick={() => {
                            startCall({
                              type: 'audio',
                              recipientId: c.id,
                              recipientName: displayName,
                              recipientAvatar: c.avatar,
                            });
                            onClose();
                          }}
                          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-400 transition flex items-center space-x-1"
                          title="Audio Call"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="hidden sm:inline text-xs">Call</span>
                        </button>

                        <button
                          onClick={() => {
                            startCall({
                              type: 'video',
                              recipientId: c.id,
                              recipientName: displayName,
                              recipientAvatar: c.avatar,
                            });
                            onClose();
                          }}
                          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-blue-400 transition flex items-center space-x-1"
                          title="Video Call"
                        >
                          <Video className="w-3.5 h-3.5 text-blue-400" />
                          <span className="hidden sm:inline text-xs">Video</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Global Search (Find People by Mobile Number, Name, Email) */}
        {activeTab === 'search' && (
          <div className="flex-1 overflow-hidden flex flex-col p-3 sm:p-4 space-y-3">
            {/* Search Input Bar */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search registered people by mobile number, name, or email..."
                value={searchQuery}
                onChange={(e) => handleQueryChange(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              />
              {isLoadingUsers ? (
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin absolute right-3" />
              ) : searchQuery ? (
                <button
                  onClick={() => handleQueryChange('')}
                  className="absolute right-3 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>

            {/* Quick Filters */}
            <div className="flex items-center space-x-1.5 text-[11px]">
              <span className="text-slate-500 text-[10px] font-semibold mr-1">FILTER:</span>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  filterMode === 'all'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                All Registered ({registeredUsers.length})
              </button>
              <button
                onClick={() => setFilterMode('online')}
                className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center space-x-1 ${
                  filterMode === 'online'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Online</span>
              </button>
              <button
                onClick={() => setFilterMode('new')}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  filterMode === 'new'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Not Connected
              </button>
              <button
                onClick={() => fetchRegisteredUsers(searchQuery)}
                className="ml-auto p-1 text-slate-400 hover:text-amber-400 transition"
                title="Refresh user list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 divide-y divide-slate-800/40">
              {isLoadingUsers && registeredUsers.length === 0 ? (
                <div className="py-14 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                  <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                  <p className="font-semibold text-slate-200">Loading registered users from Oracle Cloud...</p>
                  <p className="text-[11px] text-slate-500">Connecting to live cloud network</p>
                </div>
              ) : displayedUsers.length === 0 ? (
                <div className="py-14 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                  <Users className="w-10 h-10 text-slate-700" />
                  <p className="font-semibold text-slate-300">
                    {searchQuery ? `No users matching "${searchQuery}"` : 'No other users found'}
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    {searchQuery
                      ? 'Search with complete or partial mobile number, name, or email.'
                      : 'Ask other team members to register on their devices to start chatting & calling!'}
                  </p>
                  <button
                    onClick={() => fetchRegisteredUsers('')}
                    className="mt-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh List</span>
                  </button>
                </div>
              ) : (
                displayedUsers.map((u) => {
                  if (!u || !u.id) return null;
                  const isOnline = Boolean(Array.isArray(onlineUserIds) && onlineUserIds.includes(u.id));
                  const isFriend = Boolean(u.isFriend);
                  const reqStatus = u.friendRequestStatus || 'none'; // 'incoming' | 'outgoing' | 'none'
                  const displayName = u.displayName || u.username || 'AAM User';
                  const username = u.username || 'user';
                  const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;

                  return (
                    <div
                      key={u.id}
                      className="pt-2 pb-1 bg-slate-900/60 hover:bg-slate-800/40 rounded-2xl p-2.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border border-transparent hover:border-slate-800"
                    >
                      {/* User Info */}
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          <img
                            src={u.avatar || defaultAvatar}
                            alt={displayName}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = defaultAvatar;
                            }}
                            className="w-11 h-11 rounded-full object-cover border border-slate-700 shadow-sm"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-slate-900 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                            }`}
                            title={isOnline ? 'Online' : 'Offline'}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-1.5">
                            <h4 className="text-xs font-bold text-slate-100 truncate">{displayName}</h4>
                            {u.isSelf && (
                              <span className="flex-shrink-0 text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                You
                              </span>
                            )}
                            {isFriend && (
                              <span className="flex-shrink-0 text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                Connected
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">@{username}</p>
                          {u.phoneNumber && (
                            <p className="text-[10px] text-amber-400/80 font-mono truncate">{u.phoneNumber}</p>
                          )}
                          {u.email && (
                            <p className="text-[10px] text-slate-400/80 truncate">{u.email}</p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center space-x-1.5 flex-shrink-0 justify-end">
                        {u.isSelf ? (
                          <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
                            You
                          </span>
                        ) : isFriend ? (
                          <>
                            {/* Direct Chat */}
                            <button
                              onClick={() => {
                                onOpenDirectChat(u.id);
                                onClose();
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center space-x-1 transition shadow-sm"
                              title="Start Chat"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Chat</span>
                            </button>

                            <button
                              onClick={() => {
                                startCall({
                                  type: 'audio',
                                  recipientId: u.id,
                                  recipientName: displayName,
                                  recipientAvatar: u.avatar,
                                });
                                onClose();
                              }}
                              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-emerald-400 transition flex items-center space-x-1"
                              title="Audio Call"
                            >
                              <Phone className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="hidden sm:inline text-xs">Call</span>
                            </button>
                          </>
                        ) : reqStatus === 'outgoing' ? (
                          <button
                            onClick={() => u.friendRequestId && handleCancelRequest(u.friendRequestId)}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-rose-500/20 text-amber-400 hover:text-rose-400 border border-amber-500/20 text-[10px] font-medium transition flex items-center space-x-1"
                            title="Outgoing request pending. Click to cancel"
                          >
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Pending (Cancel)</span>
                          </button>
                        ) : reqStatus === 'incoming' ? (
                          <button
                            onClick={() => u.friendRequestId && handleAcceptRequest(u.friendRequestId)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition flex items-center space-x-1"
                            title="Accept incoming request"
                          >
                            <Check className="w-3 h-3" />
                            <span>Accept</span>
                          </button>
                        ) : (
                          /* Send Friend Request with Custom Message Button */
                          <button
                            onClick={() => handleOpenCustomMessageModal(u)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition flex items-center space-x-1.5 shadow-sm"
                            title="Send Friend Request with Custom Message"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Send Request</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Accepted Friends */}
        {activeTab === 'contacts' && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
            {filteredContacts.length === 0 ? (
              <div className="py-14 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                <Users className="w-10 h-10 text-slate-700" />
                <p className="font-semibold text-slate-300">No connected friends yet</p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Sync your device contacts in the "Device" tab or search people in "Search" to start private sovereign chats and calls.
                </p>
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={() => setActiveTab('phone')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center space-x-1.5 transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Sync Device Contacts</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('search')}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                  >
                    <span>Search People</span>
                  </button>
                </div>
              </div>
            ) : (
              filteredContacts.map((c) => {
                if (!c || !c.id) return null;
                const isOnline = Boolean(Array.isArray(onlineUserIds) && onlineUserIds.includes(c.id));
                const displayName = c.displayName || c.username || 'AAM Friend';
                const username = c.username || 'user';
                const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;

                return (
                  <div
                    key={c.id}
                    className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3 flex items-center justify-between transition hover:border-slate-600"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        <img
                          src={c.avatar || defaultAvatar}
                          alt={displayName}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = defaultAvatar;
                          }}
                          className="w-11 h-11 rounded-full object-cover border border-slate-600"
                        />
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-slate-900 ${
                            isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                          }`}
                          title={isOnline ? 'Online' : 'Offline'}
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-100 truncate">{displayName}</h4>
                        <p className="text-[10px] text-slate-400 truncate">@{username}</p>
                        {c.phoneNumber && (
                          <p className="text-[10px] text-amber-400/80 font-mono truncate">{c.phoneNumber}</p>
                        )}
                        <span className="inline-block text-[9px] text-emerald-400/90 font-medium">
                          {c.storageMode === 'cloud_sync' ? '⚡ Cloud Sync' : '🔒 Local Store'}
                        </span>
                      </div>
                    </div>

                    {/* Contact Action Shortcuts */}
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          onOpenDirectChat(c.id);
                          onClose();
                        }}
                        className="p-2 sm:px-3 sm:py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center space-x-1.5 transition"
                        title="Open Chat"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span className="hidden sm:inline">Message</span>
                      </button>

                      <button
                        onClick={() => {
                          startCall({
                            type: 'audio',
                            recipientId: c.id,
                            recipientName: displayName,
                            recipientAvatar: c.avatar,
                          });
                          onClose();
                        }}
                        className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-emerald-400 transition flex items-center space-x-1.5"
                        title="Start Audio Call"
                      >
                        <Phone className="w-4 h-4 text-emerald-400" />
                        <span className="hidden sm:inline text-xs">Call</span>
                      </button>

                      <button
                        onClick={() => {
                          startCall({
                            type: 'video',
                            recipientId: c.id,
                            recipientName: displayName,
                            recipientAvatar: c.avatar,
                          });
                          onClose();
                        }}
                        className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-blue-400 transition flex items-center space-x-1.5"
                        title="Start Video Call"
                      >
                        <Video className="w-4 h-4 text-blue-400" />
                        <span className="hidden sm:inline text-xs">Video</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: Friend Requests (Incoming & Outgoing with Custom Message) */}
        {activeTab === 'requests' && (
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
            {/* Direct Send Friend Request Form with Custom Message */}
            <div className="p-3 bg-slate-950/60 border border-amber-500/20 rounded-2xl space-y-2">
              <div className="flex items-center space-x-1.5">
                <Send className="w-3.5 h-3.5 text-amber-400" />
                <h4 className="text-xs font-bold text-slate-200">Send New Friend Request</h4>
              </div>
              <p className="text-[11px] text-slate-400">
                Enter any registered user's mobile number, @username, or email ID to connect:
              </p>
              <form onSubmit={handleDirectSendRequest} className="space-y-2 pt-1">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="e.g. +919999988888, kavya, or kushi@mail.com"
                    value={directRecipientInput}
                    onChange={(e) => setDirectRecipientInput(e.target.value)}
                    className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={isSendingDirect || !directRecipientInput.trim()}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center space-x-1 transition flex-shrink-0"
                  >
                    {isSendingDirect ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <SendHorizontal className="w-3.5 h-3.5" />
                    )}
                    <span>Send</span>
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Custom message (e.g. Hi, let's connect on AAM!)..."
                  value={directMessageInput}
                  onChange={(e) => setDirectMessageInput(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </form>

              {directSendStatus && (
                <div
                  className={`p-2 rounded-xl text-[11px] flex items-center space-x-1.5 ${
                    directSendStatus.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{directSendStatus.message}</span>
                </div>
              )}
            </div>

            {/* Sub-tabs: Received vs Sent Requests */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 rounded-xl p-1 text-xs">
              <button
                onClick={() => setRequestsSubTab('incoming')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center space-x-1.5 ${
                  requestsSubTab === 'incoming'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>Received Requests</span>
                {incomingList.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold">
                    {incomingList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setRequestsSubTab('outgoing')}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition flex items-center justify-center space-x-1.5 ${
                  requestsSubTab === 'outgoing'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <SendHorizontal className="w-3.5 h-3.5" />
                <span>Sent Requests (Outgoing)</span>
                {outgoingList.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {outgoingList.length}
                  </span>
                )}
              </button>
            </div>

            {/* Sub-tab 1: Received Requests (with custom message display) */}
            {requestsSubTab === 'incoming' && (
              <div>
                {incomingList.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-2xl border border-slate-800/60 space-y-1">
                    <p className="font-semibold text-slate-300">No pending received requests</p>
                    <p className="text-[11px] text-slate-500">
                      When someone sends you a friend request, it will appear here along with their custom message.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {incomingList.map((req) => {
                      if (!req) return null;
                      const sender: any = req.sender || {};
                      const sName = sender.displayName || sender.username || 'AAM User';
                      const sUser = sender.username || 'user';
                      const sAvatar =
                        sender.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(sUser)}`;

                      return (
                        <div
                          key={req.id}
                          className="bg-slate-800/90 border border-slate-700 rounded-2xl p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 min-w-0">
                              <img
                                src={sAvatar}
                                alt={sName}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(sUser)}`;
                                }}
                                className="w-10 h-10 rounded-full object-cover border border-slate-600 flex-shrink-0"
                              />
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-slate-100 truncate">{sName}</h4>
                                <p className="text-[10px] text-slate-400 truncate">@{sUser}</p>
                                {sender.phoneNumber && (
                                  <p className="text-[10px] text-amber-400/80 font-mono truncate">{sender.phoneNumber}</p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <button
                                onClick={() => handleAcceptRequest(req.id)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 transition shadow-sm"
                                title="Accept Request"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Accept</span>
                              </button>
                              <button
                                onClick={() => rejectFriendRequest(req.id)}
                                className="p-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-rose-400 transition"
                                title="Decline Request"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Custom Message Card */}
                          {req.message && (
                            <div className="p-2.5 bg-slate-900/90 border border-amber-500/20 rounded-xl space-y-1">
                              <div className="flex items-center space-x-1 text-[10px] text-amber-400 font-semibold">
                                <MessageCircle className="w-3 h-3" />
                                <span>Custom Message from {sName}:</span>
                              </div>
                              <p className="text-xs text-slate-200 italic leading-relaxed pl-1">
                                "{req.message}"
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Sub-tab 2: Sent Requests (Outgoing) */}
            {requestsSubTab === 'outgoing' && (
              <div>
                {outgoingList.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-2xl border border-slate-800/60 space-y-1">
                    <p className="font-semibold text-slate-300">No pending sent requests</p>
                    <p className="text-[11px] text-slate-500">
                      Use the "Send New Friend Request" box above or search people in "Search" to connect.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {outgoingList.map((req) => {
                      if (!req) return null;
                      const recipient: any = req.recipient || {};
                      const rName = recipient.displayName || recipient.username || 'AAM User';
                      const rUser = recipient.username || 'user';
                      const rAvatar =
                        recipient.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(rUser)}`;

                      return (
                        <div
                          key={req.id}
                          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex flex-col space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3 min-w-0">
                              <img
                                src={rAvatar}
                                alt={rName}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(rUser)}`;
                                }}
                                className="w-10 h-10 rounded-full object-cover border border-slate-700 flex-shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center space-x-1.5">
                                  <h4 className="text-xs font-bold text-slate-200 truncate">{rName}</h4>
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center space-x-1">
                                    <Clock className="w-2.5 h-2.5" />
                                    <span>Pending</span>
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 truncate">@{rUser}</p>
                              </div>
                            </div>

                            <button
                              onClick={() => handleCancelRequest(req.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 text-xs font-medium transition"
                              title="Cancel outgoing request"
                            >
                              Cancel Request
                            </button>
                          </div>

                          {req.message && (
                            <p className="text-[10px] text-slate-400 italic bg-slate-950/40 p-2 rounded-lg border border-slate-800">
                              Message sent: "{req.message}"
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Message Dialog for Stranger Friend Requests */}
      {customMessageModalUser && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl max-w-sm w-full p-4 sm:p-5 shadow-2xl space-y-4 ring-1 ring-amber-500/20">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-100">Send Friend Request</h3>
              </div>
              <button
                onClick={() => setCustomMessageModalUser(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Recipient Profile */}
            <div className="flex items-center space-x-3 p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
              <img
                src={
                  customMessageModalUser.avatar ||
                  `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(customMessageModalUser.username)}`
                }
                alt={customMessageModalUser.displayName}
                className="w-11 h-11 rounded-full object-cover border border-slate-700"
              />
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-100 truncate">
                  {customMessageModalUser.displayName}
                </h4>
                <p className="text-[10px] text-slate-400">@{customMessageModalUser.username}</p>
                {customMessageModalUser.phoneNumber && (
                  <p className="text-[10px] text-amber-400/80 font-mono">
                    {customMessageModalUser.phoneNumber}
                  </p>
                )}
              </div>
            </div>

            {/* Custom Message Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Personal Greeting / Note:</span>
                <span className="text-[10px] text-slate-500">{customMessageText.length}/500</span>
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={customMessageText}
                onChange={(e) => setCustomMessageText(e.target.value)}
                placeholder="Write a greeting or introduction..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed resize-none"
              />

              {/* Quick Greeting Chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  "👋 Hi, let's connect on AAM!",
                  "🤝 Hey, let's chat here!",
                  "🇮🇳 Namaste from India!",
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setCustomMessageText(chip)}
                    className="text-[10px] px-2 py-0.8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomMessageModalUser(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCustomRequest}
                disabled={isSendingCustomRequest}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 transition shadow-lg shadow-amber-500/20"
              >
                {isSendingCustomRequest ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Send Request</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ContactsModal: React.FC<ContactsModalProps> = (props) => {
  return (
    <ErrorBoundary fallbackTitle="Contacts & Friends Display Error">
      <ContactsModalInner {...props} />
    </ErrorBoundary>
  );
};
