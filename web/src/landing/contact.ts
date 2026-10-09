/*
 * How restaurant owners reach the Urdho team from the front page. Until both are filled in, the
 * contact buttons are drawn with a dashed outline and "contact missing", so the page can't go live
 * unnoticed with dead buttons.
 */
export const CONTACT = {
  /** The WhatsApp number in international form: 355 and the number without its first 0, e.g. 35569XXXXXXX. */
  whatsapp: '',
  email: '',
};

export interface ContactLinks {
  whatsapp: string | null;
  email: string | null;
}

/** Links that open a WhatsApp chat or an email with the first message already written. */
export function contactLinks(message: string, subject: string, contact = CONTACT): ContactLinks {
  const digits = contact.whatsapp.replace(/\D/g, '');
  return {
    whatsapp: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null,
    email: contact.email.trim() ? `mailto:${contact.email.trim()}?subject=${encodeURIComponent(subject)}` : null,
  };
}
