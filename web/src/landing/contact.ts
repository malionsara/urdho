/*
 * How restaurant owners reach the Urdho team from the front page. A button whose value is empty is
 * drawn with a dashed outline and "contact missing", so a dead button can't go live unnoticed.
 */
export const CONTACT = {
  /** The WhatsApp number in international form: 355 and the number without its first 0, e.g. 35569XXXXXXX. */
  whatsapp: '355675490330',
  /** Forwarded to the team's inbox by ImprovMX (MX records on urdho.al). */
  email: 'kontakt@urdho.al',
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
