const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Arabic-Indic digits -> Latin, strips spaces/dashes/brackets, keeps a leading + */
export const cleanPhone = (raw: string): string => {
  const latin = (raw || '').replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  const plus = latin.trim().startsWith('+') ? '+' : '';
  return plus + latin.replace(/\D/g, '');
};

export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
};

export const buildDialUri = (protocol: 'tel' | 'sip', phone: string, sipServer?: string): string => {
  const num = cleanPhone(phone);
  if (protocol === 'sip') {
    const host = (sipServer || '').trim().replace(/^sips?:/i, '').replace(/^\/+|\/+$/g, '');
    return host ? `sip:${num}@${host}` : `sip:${num}`;
  }
  return `tel:${num}`;
};

/** Must be called synchronously from a click handler. Opens the softphone via a
 *  hidden anchor (does not unload the page) and copies the number as a fallback. */
export const dialNumber = (protocol: 'tel' | 'sip', phone: string, sipServer?: string): void => {
  const num = cleanPhone(phone);
  void copyText(num);
  const a = document.createElement('a');
  a.href = buildDialUri(protocol, phone, sipServer);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 500);
};
