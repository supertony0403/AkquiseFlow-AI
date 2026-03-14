import type { DSGVOResult } from '../types';

export function checkDSGVO(html: string, url: string, sslValid: boolean): DSGVOResult {
  const lower = html.toLowerCase();
  const issues: string[] = [];
  const recommendations: string[] = [];

  const impressum =
    lower.includes('/impressum') ||
    lower.includes('impressum') ||
    lower.includes('/legal') ||
    lower.includes('anbieterkennzeichnung');
  if (!impressum) {
    issues.push('Kein Impressum gefunden (Pflicht nach §5 TMG)');
    recommendations.push('Impressum-Seite mit vollständigen Angaben erstellen');
  }

  const datenschutz =
    lower.includes('/datenschutz') ||
    lower.includes('datenschutzerklärung') ||
    lower.includes('datenschutzerkl') ||
    lower.includes('/privacy') ||
    lower.includes('privacy-policy') ||
    lower.includes('datenschutz');
  if (!datenschutz) {
    issues.push('Keine Datenschutzerklärung gefunden (Art. 13 DSGVO)');
    recommendations.push('Datenschutzerklärung nach DSGVO Art. 13/14 erstellen');
  }

  const cookieConsent =
    lower.includes('cookiebot') ||
    lower.includes('cookieconsent') ||
    lower.includes('usercentrics') ||
    lower.includes('borlabs') ||
    lower.includes('cookie-banner') ||
    lower.includes('cookie_notice') ||
    lower.includes('cookie-law') ||
    lower.includes('consentmanager') ||
    lower.includes('onetrust') ||
    lower.includes('didomi') ||
    lower.includes('complianz') ||
    /cookie[_-]?(accept|agree|consent|notice)/i.test(html);
  if (!cookieConsent) {
    issues.push('Kein Cookie-Consent-Banner erkannt');
    recommendations.push('Cookie-Consent-Management einrichten (z.B. Usercentrics, Borlabs)');
  }

  const googleAnalytics =
    /gtag\.js|google-analytics\.com\/analytics\.js|UA-\d+-\d+|G-[A-Z0-9]+/i.test(html) && !cookieConsent;
  if (googleAnalytics) {
    issues.push('Google Analytics ohne erkennbaren Consent (DSGVO-kritisch)');
    recommendations.push('Analytics erst nach Nutzereinwilligung laden (Consent Management)');
  }

  const facebookPixel =
    lower.includes('connect.facebook.net/en_us/fbevents.js') ||
    lower.includes('connect.facebook.net/de_de/fbevents.js') ||
    lower.includes('fbq(');
  if (facebookPixel && !cookieConsent) {
    issues.push('Facebook Pixel ohne erkennbaren Consent');
    recommendations.push('Facebook Pixel erst nach Einwilligung laden');
  }

  const ssl = url.startsWith('https://') && sslValid;
  if (!ssl) {
    issues.push('Kein gültiges SSL-Zertifikat (Pflicht für Datensicherheit)');
    recommendations.push('SSL-Zertifikat einrichten und HTTPS erzwingen');
  }

  const contactForm =
    /<form[^>]*>/i.test(html) &&
    /type=["']?email["']?/i.test(html);

  let score = 100;
  if (!impressum) score -= 25;
  if (!datenschutz) score -= 25;
  if (!cookieConsent) score -= 20;
  if (googleAnalytics) score -= 15;
  if (facebookPixel && !cookieConsent) score -= 10;
  if (!ssl) score -= 15;
  score = Math.max(0, score);

  const grade =
    score >= 90 ? 'A' :
    score >= 70 ? 'B' :
    score >= 50 ? 'C' :
    score >= 30 ? 'D' : 'F';

  return {
    impressum,
    datenschutz,
    cookieConsent,
    googleAnalytics,
    facebookPixel,
    ssl,
    contactForm,
    score,
    grade,
    issues,
    recommendations,
  };
}
