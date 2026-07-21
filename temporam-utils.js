(function temporamUtilsModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.TemporamUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createTemporamUtils() {
  const DEFAULT_TEMPORAM_BASE_URL = 'https://api.temporam.com/v1';
  const TEMPORAM_PROVIDER = 'temporam';

  function firstNonEmptyString(values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function normalizeTemporamBaseUrl(rawValue = '') {
    const value = String(rawValue || '').trim();
    if (!value) return DEFAULT_TEMPORAM_BASE_URL;

    const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)
      ? value
      : `https://${value}`;
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return DEFAULT_TEMPORAM_BASE_URL;
      }
      parsed.hash = '';
      parsed.search = '';
      const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${parsed.origin}${pathname}` || DEFAULT_TEMPORAM_BASE_URL;
    } catch {
      return DEFAULT_TEMPORAM_BASE_URL;
    }
  }

  function normalizeTemporamApiKey(value = '') {
    return String(value || '').trim();
  }

  function normalizeTemporamAddress(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeTemporamDomain(rawValue = '') {
    let value = String(rawValue || '').trim().toLowerCase();
    if (!value) return '';
    value = value.replace(/^@+/, '');
    value = value.replace(/^https?:\/\//, '');
    value = value.replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) {
      return '';
    }
    return value;
  }

  function buildTemporamHeaders(config = {}, options = {}) {
    const headers = {};
    const apiKey = firstNonEmptyString([
      options.apiKey,
      options.includeConfigApiKey === false ? '' : config.apiKey,
      options.includeConfigApiKey === false ? '' : config.temporamApiKey,
    ]);

    if (apiKey) {
      headers.Authorization = /^bearer\s+/i.test(apiKey)
        ? apiKey
        : `Bearer ${apiKey}`;
    }
    if (options.json) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.acceptJson !== false) {
      headers.Accept = 'application/json';
    }
    return headers;
  }

  function joinTemporamUrl(baseUrl, path, params = {}) {
    const normalizedBase = normalizeTemporamBaseUrl(baseUrl);
    const normalizedPath = String(path || '').trim();
    const url = new URL(`${normalizedBase}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  function normalizeTemporamInbox(payload = {}) {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const address = normalizeTemporamAddress(firstNonEmptyString([
      safePayload.address,
      safePayload.email,
      safePayload.to_email,
      safePayload.toEmail,
    ]));
    const domain = normalizeTemporamDomain(firstNonEmptyString([
      safePayload.domain,
      address.includes('@') ? address.split('@')[1] : '',
    ]));
    return {
      address,
      domain,
      createdAt: firstNonEmptyString([safePayload.createdAt, safePayload.created_at]) || null,
      raw: safePayload,
    };
  }

  function normalizeTemporamCurrentInbox(value = null) {
    if (!value || typeof value !== 'object') return null;
    const inbox = normalizeTemporamInbox(value);
    return inbox.address ? inbox : null;
  }

  function getTemporamRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const candidates = [
      payload.data,
      payload.messages,
      payload.items,
      payload.list,
      payload.records,
      payload.emails,
      payload.data?.messages,
      payload.data?.items,
      payload.data?.list,
      payload.data?.records,
      payload.data?.emails,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
    return [];
  }

  function stripHtmlTags(value = '') {
    return String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeTemporamCreatedAt(value = '') {
    const source = firstNonEmptyString([value]);
    if (!source) return '';
    const parsed = Date.parse(source);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : source;
  }

  function normalizeTemporamMessage(row = {}) {
    if (!row || typeof row !== 'object') return null;

    const fromAddress = firstNonEmptyString([
      row.from_email,
      row.fromEmail,
      row.from?.email,
      row.from?.address,
      typeof row.from === 'string' ? row.from : '',
    ]);
    const fromName = firstNonEmptyString([
      row.from_name,
      row.fromName,
      row.from?.name,
    ]);
    const toAddress = normalizeTemporamAddress(firstNonEmptyString([
      row.to_email,
      row.toEmail,
      row.address,
      row.mailbox,
      Array.isArray(row.to) ? row.to[0]?.address || row.to[0]?.email || row.to[0] : '',
      typeof row.to === 'string' ? row.to : '',
    ]));
    const htmlValue = Array.isArray(row.html)
      ? row.html.join('\n')
      : firstNonEmptyString([row.content, row.html, row.bodyHtml, row.body_html]);
    const textValue = firstNonEmptyString([
      row.text,
      row.bodyText,
      row.body_text,
      row.bodyPreview,
      row.preview,
      row.summary,
    ]);
    const bodyPreview = (textValue || stripHtmlTags(htmlValue))
      .replace(/\s+/g, ' ')
      .trim();

    return {
      id: firstNonEmptyString([row.id, row.uuid, row.message_id, row.messageId]),
      uuid: firstNonEmptyString([row.uuid]),
      address: toAddress,
      subject: firstNonEmptyString([row.subject, row.title]),
      from: {
        name: fromName,
        emailAddress: {
          address: fromAddress,
        },
      },
      to: toAddress ? [{ name: '', address: toAddress }] : [],
      bodyPreview,
      raw: htmlValue || textValue || '',
      text: textValue,
      html: htmlValue,
      summary: firstNonEmptyString([row.summary]),
      receivedDateTime: normalizeTemporamCreatedAt(firstNonEmptyString([
        row.created_at,
        row.createdAt,
        row.receivedDateTime,
        row.date,
      ])),
    };
  }

  function normalizeTemporamMessages(payload) {
    return getTemporamRows(payload)
      .map((row) => normalizeTemporamMessage(row))
      .filter(Boolean);
  }

  function extractTemporamVerificationCode(text) {
    const source = String(text || '');
    const matchCn = source.match(/(?:代码为|验证码[^0-9]*?)[\s：:]*(\d{6})/i);
    if (matchCn) return matchCn[1];

    const matchOpenAiLogin = source.match(/(?:chatgpt\s+log-?in\s+code|enter\s+this\s+code)[^0-9]{0,24}(\d{6})/i);
    if (matchOpenAiLogin) return matchOpenAiLogin[1];

    const matchChatGPT = source.match(/your\s+chatgpt\s+code\s+is\s+(\d{6})/i);
    if (matchChatGPT) return matchChatGPT[1];

    const matchEn = source.match(/code(?:\s+is|[\s:])+(\d{6})/i);
    if (matchEn) return matchEn[1];

    const matchStandalone = source.match(/\b(\d{6})\b/);
    return matchStandalone ? matchStandalone[1] : null;
  }

  function normalizeTemporamMessageDetail(payload = {}) {
    const source = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload;
    const message = normalizeTemporamMessage(source);
    if (!message) return null;
    const combined = [
      message.subject,
      message.from?.emailAddress?.address,
      message.bodyPreview,
      message.text,
      message.html,
      message.raw,
      message.summary,
    ].filter(Boolean).join(' ');
    return {
      ...message,
      bodyPreview: message.bodyPreview || stripHtmlTags(combined),
      verification_code: extractTemporamVerificationCode(combined) || '',
    };
  }

  function normalizeTemporamDomains(payload) {
    const rows = getTemporamRows(payload);
    const domains = [];
    const seen = new Set();
    for (const row of rows) {
      const domain = normalizeTemporamDomain(
        typeof row === 'string'
          ? row
          : firstNonEmptyString([row?.domain, row?.name, row?.value])
      );
      if (!domain || seen.has(domain)) continue;
      seen.add(domain);
      domains.push(domain);
    }
    return domains;
  }

  return {
    DEFAULT_TEMPORAM_BASE_URL,
    TEMPORAM_PROVIDER,
    buildTemporamHeaders,
    extractTemporamVerificationCode,
    firstNonEmptyString,
    joinTemporamUrl,
    normalizeTemporamAddress,
    normalizeTemporamApiKey,
    normalizeTemporamBaseUrl,
    normalizeTemporamCurrentInbox,
    normalizeTemporamDomain,
    normalizeTemporamDomains,
    normalizeTemporamInbox,
    normalizeTemporamMessage,
    normalizeTemporamMessageDetail,
    normalizeTemporamMessages,
    stripHtmlTags,
  };
});
