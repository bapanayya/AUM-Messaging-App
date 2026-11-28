import { Capacitor } from '@capacitor/core';
import { Contacts } from '@capacitor-community/contacts';

export interface DeviceContactItem {
  name: string;
  phones: string[];
  emails: string[];
}

export interface ReadContactsResult {
  contacts: DeviceContactItem[];
  source: 'capacitor_native' | 'w3c_picker' | 'vcf_import' | 'manual';
  error?: string;
}

/**
 * Checks if reading device contacts is supported on this platform/browser
 */
export function isDeviceContactsSupported(): { supported: boolean; method: 'capacitor' | 'w3c' | 'none' } {
  if (Capacitor.isNativePlatform()) {
    return { supported: true, method: 'capacitor' };
  }
  if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
    return { supported: true, method: 'w3c' };
  }
  return { supported: false, method: 'none' };
}

/**
 * Reads contacts directly from the device's address book (Phonebook).
 * Works on Android via Capacitor native contacts plugin and mobile browsers via W3C Contact Picker.
 */
export async function readDeviceContacts(): Promise<ReadContactsResult> {
  // 1. Android / iOS Native Capacitor App
  if (Capacitor.isNativePlatform()) {
    try {
      // Check and request permissions
      const perm = await Contacts.requestPermissions();
      if (perm.contacts === 'denied') {
        return {
          contacts: [],
          source: 'capacitor_native',
          error: 'Contacts permission denied. Please allow contacts access in device settings.',
        };
      }

      const res = await Contacts.getContacts({
        projection: {
          name: true,
          phones: true,
          emails: true,
        },
      });

      const rawContacts = Array.isArray(res.contacts) ? res.contacts : [];
      const formatted: DeviceContactItem[] = rawContacts
        .map((c) => {
          const displayName =
            c.name?.display ||
            `${c.name?.given || ''} ${c.name?.family || ''}`.trim() ||
            'Contact';
          const phones = (c.phones || [])
            .map((p) => p.number)
            .filter((n): n is string => Boolean(n && n.trim()));
          const emails = (c.emails || [])
            .map((e) => e.address)
            .filter((a): a is string => Boolean(a && a.trim()));

          return {
            name: displayName,
            phones,
            emails,
          };
        })
        .filter((c) => c.phones.length > 0 || c.emails.length > 0);

      return {
        contacts: formatted,
        source: 'capacitor_native',
      };
    } catch (err: any) {
      console.warn('Native contacts read error:', err);
      return {
        contacts: [],
        source: 'capacitor_native',
        error: err?.message || 'Failed to read native device contacts',
      };
    }
  }

  // 2. Modern Mobile Browser / Web with Contact Picker API
  if (typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window) {
    try {
      const props = ['name', 'tel', 'email'];
      const pickerRes = await (navigator as any).contacts.select(props, { multiple: true });

      const formatted: DeviceContactItem[] = (pickerRes || []).map((item: any) => ({
        name: Array.isArray(item.name) ? item.name[0] : (item.name || 'Contact'),
        phones: Array.isArray(item.tel) ? item.tel : (item.tel ? [item.tel] : []),
        emails: Array.isArray(item.email) ? item.email : (item.email ? [item.email] : []),
      }));

      return {
        contacts: formatted,
        source: 'w3c_picker',
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { contacts: [], source: 'w3c_picker' }; // User cancelled picker
      }
      return {
        contacts: [],
        source: 'w3c_picker',
        error: err?.message || 'Contact selection was cancelled or failed.',
      };
    }
  }

  // 3. Fallback when Contacts API is not supported (Desktop Browser / Unsupported WebView)
  return {
    contacts: [],
    source: 'w3c_picker',
    error: 'Device contacts picker is not available on this browser/platform. You can import contacts via vCard (.vcf) or enter phone numbers.',
  };
}

/**
 * Parses contacts from standard vCard (.vcf) format
 */
export function parseVCardText(vcfText: string): DeviceContactItem[] {
  const cards = vcfText.split(/BEGIN:VCARD/i).filter((s) => s.trim().length > 0);
  const items: DeviceContactItem[] = [];

  for (const card of cards) {
    let name = '';
    const phones: string[] = [];
    const emails: string[] = [];

    const lines = card.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (/^FN:/i.test(line)) {
        name = line.replace(/^FN:/i, '').trim();
      } else if (!name && /^N:/i.test(line)) {
        const parts = line.replace(/^N:/i, '').split(';').filter(Boolean);
        name = parts.reverse().join(' ').trim();
      } else if (/^TEL.*?:/i.test(line)) {
        const tel = line.replace(/^TEL.*?:/i, '').trim();
        if (tel) phones.push(tel);
      } else if (/^EMAIL.*?:/i.test(line)) {
        const email = line.replace(/^EMAIL.*?:/i, '').trim();
        if (email) emails.push(email);
      }
    }

    if (name || phones.length > 0 || emails.length > 0) {
      items.push({
        name: name || 'Contact',
        phones,
        emails,
      });
    }
  }

  return items;
}

/**
 * Parses manual phone numbers / contact list (e.g. "Kavya, 9999988888" or comma/line separated numbers)
 */
export function parseManualPhoneList(rawInput: string): DeviceContactItem[] {
  const lines = rawInput.split(/\r?\n|;/).filter((l) => l.trim().length > 0);
  const items: DeviceContactItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map((p) => p.trim());
      const name = parts[0];
      const numbers = parts.slice(1).filter((p) => /\d/.test(p));
      items.push({
        name: name || 'Contact',
        phones: numbers,
        emails: [],
      });
    } else {
      // Just phone or email
      if (trimmed.includes('@')) {
        items.push({ name: 'Contact', phones: [], emails: [trimmed] });
      } else {
        items.push({ name: 'Contact', phones: [trimmed], emails: [] });
      }
    }
  }

  return items;
}
