(function temporamProviderModule(root, factory) {
  root.MultiPageBackgroundTemporamProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createTemporamProviderModule() {
  function createTemporamProvider(deps = {}) {
    const {
      addLog = async () => {},
      buildTemporamHeaders,
      DEFAULT_TEMPORAM_BASE_URL = 'https://api.temporam.com/v1',
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      getState = async () => ({}),
      joinTemporamUrl,
      normalizeTemporamAddress,
      normalizeTemporamApiKey,
      normalizeTemporamBaseUrl,
      normalizeTemporamCurrentInbox,
      normalizeTemporamDomain,
      normalizeTemporamDomains,
      normalizeTemporamInbox,
      normalizeTemporamMessageDetail,
      normalizeTemporamMessages,
      persistRegistrationEmailState = null,
      pickVerificationMessageWithTimeFallback,
      setEmailState = async () => {},
      setState = async () => {},
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
      TEMPORAM_PROVIDER = 'temporam',
    } = deps;

    async function persistResolvedEmailState(state = null, email, options = {}) {
      if (typeof persistRegistrationEmailState === 'function') {
        await persistRegistrationEmailState(state, email, options);
        return;
      }
      await setEmailState(email, options);
    }

    function getTemporamConfig(state = {}) {
      return {
        apiKey: normalizeTemporamApiKey(state.temporamApiKey),
        baseUrl: normalizeTemporamBaseUrl(state.temporamBaseUrl || DEFAULT_TEMPORAM_BASE_URL),
        domain: normalizeTemporamDomain(state.temporamDomain),
        currentInbox: normalizeTemporamCurrentInbox(state.currentTemporamInbox),
      };
    }

    function ensureTemporamConfig(state = {}, options = {}) {
      const { requireApiKey = false, requireInbox = false } = options;
      const config = getTemporamConfig(state);
      if (!config.baseUrl) {
        throw new Error('Temporam API 地址为空或格式无效。');
      }
      if (requireApiKey && !config.apiKey) {
        throw new Error('Temporam API Key 为空，请先在侧边栏填写。');
      }
      if (requireInbox && !config.currentInbox?.address) {
        throw new Error('Temporam 当前没有可用邮箱，请先获取邮箱。');
      }
      return config;
    }

    async function requestTemporamJson(config, path, options = {}) {
      if (!fetchImpl) {
        throw new Error('Temporam 当前运行环境不支持 fetch。');
      }
      const {
        method = 'GET',
        payload,
        params,
        timeoutMs = 20000,
      } = options;
      const url = joinTemporamUrl(config.baseUrl, path, params);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: buildTemporamHeaders(config, {
            apiKey: config.apiKey,
            json: payload !== undefined,
          }),
          body: payload !== undefined ? JSON.stringify(payload || {}) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        const errorMessage = err?.name === 'AbortError'
          ? `Temporam 请求超时（>${Math.round(timeoutMs / 1000)} 秒）`
          : `Temporam 请求失败：${err.message}`;
        throw new Error(errorMessage);
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      let parsed = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        const payloadError = parsed && typeof parsed === 'object'
          ? (parsed.message || parsed.error || parsed.msg || parsed.errorCode)
          : '';
        throw new Error(`Temporam 请求失败：${payloadError || text || `HTTP ${response.status}`}`);
      }

      if (parsed && typeof parsed === 'object' && parsed.error === true) {
        throw new Error(`Temporam 业务错误：${parsed.message || parsed.errorCode || 'unknown_error'}`);
      }

      if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'data')) {
        return parsed.data;
      }
      return parsed;
    }

    function generateTemporamLocalPart() {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      const digits = '0123456789';
      const chars = [];
      for (let i = 0; i < 8; i += 1) chars.push(letters[Math.floor(Math.random() * letters.length)]);
      for (let i = 0; i < 4; i += 1) chars.push(digits[Math.floor(Math.random() * digits.length)]);
      for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      return chars.join('');
    }

    async function listTemporamDomains(state) {
      const latestState = state || await getState();
      const config = ensureTemporamConfig(latestState, { requireApiKey: true });
      const data = await requestTemporamJson(config, '/domains', { method: 'GET' });
      return normalizeTemporamDomains(data);
    }

    async function resolveTemporamDomain(state, options = {}) {
      const config = getTemporamConfig(state);
      const preferred = normalizeTemporamDomain(options.domain || config.domain);
      if (preferred) return preferred;

      const domains = await listTemporamDomains(state);
      if (!domains.length) {
        throw new Error('Temporam 未返回可用域名，请检查订阅或稍后重试。');
      }
      return domains[0];
    }

    async function fetchTemporamAddress(state, options = {}) {
      throwIfStopped();
      const latestState = state || await getState();
      ensureTemporamConfig(latestState, { requireApiKey: true });

      const existing = normalizeTemporamCurrentInbox(latestState.currentTemporamInbox);
      if (!options.generateNew && existing?.address) {
        await persistResolvedEmailState(latestState, existing.address, {
          source: `generated:${TEMPORAM_PROVIDER}`,
          preserveAccountIdentity: Boolean(options?.preserveAccountIdentity),
        });
        return existing.address;
      }

      const localPart = String(options.localPart || options.name || '').trim().toLowerCase()
        || generateTemporamLocalPart();
      if (!/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/i.test(localPart) && !/^[a-z0-9]$/i.test(localPart)) {
        throw new Error('Temporam 邮箱本地部分格式无效。');
      }
      const domain = await resolveTemporamDomain(latestState, options);
      const address = normalizeTemporamAddress(`${localPart}@${domain}`);
      const inbox = normalizeTemporamInbox({
        address,
        domain,
        createdAt: new Date().toISOString(),
      });
      if (!inbox.address) {
        throw new Error('Temporam 生成邮箱失败。');
      }

      await setState({
        currentTemporamInbox: inbox,
        temporamDomain: domain,
      });
      await persistResolvedEmailState(latestState, inbox.address, {
        source: `generated:${TEMPORAM_PROVIDER}`,
        preserveAccountIdentity: Boolean(options?.preserveAccountIdentity),
      });
      await addLog(`Temporam：已生成邮箱 ${inbox.address}`, 'ok');
      return inbox.address;
    }

    function resolveTemporamInbox(state = {}) {
      const config = getTemporamConfig(state);
      if (config.currentInbox?.address) {
        return config.currentInbox;
      }
      const email = normalizeTemporamAddress(state.email);
      if (email) {
        return normalizeTemporamInbox({ address: email });
      }
      return null;
    }

    function resolveTemporamPollTargetEmail(state = {}, pollPayload = {}) {
      return normalizeTemporamAddress(pollPayload.targetEmail)
        || resolveTemporamInbox(state)?.address
        || normalizeTemporamAddress(state.email);
    }

    async function listTemporamMessages(state, options = {}) {
      const latestState = state || await getState();
      const config = ensureTemporamConfig(latestState, { requireApiKey: true });
      const address = normalizeTemporamAddress(options.address)
        || resolveTemporamPollTargetEmail(latestState, options);
      if (!address) {
        throw new Error('Temporam 查询邮件前缺少目标邮箱地址。');
      }
      const payload = await requestTemporamJson(config, '/emails', {
        method: 'GET',
        params: {
          email: address,
          page: Number(options.page) || 1,
          limit: Number(options.limit) || 20,
        },
      });
      return {
        config,
        messages: normalizeTemporamMessages(payload),
      };
    }

    async function getTemporamMessageDetail(state, messageId, options = {}) {
      const latestState = state || await getState();
      const config = ensureTemporamConfig(latestState, { requireApiKey: true });
      if (!messageId) {
        throw new Error('Temporam 邮件 ID 为空。');
      }
      const payload = await requestTemporamJson(config, `/emails/${encodeURIComponent(messageId)}`, {
        method: 'GET',
      });
      return normalizeTemporamMessageDetail(payload);
    }

    async function getTemporamLatestMessage(state, options = {}) {
      const latestState = state || await getState();
      const config = ensureTemporamConfig(latestState, { requireApiKey: true });
      const address = normalizeTemporamAddress(options.address)
        || resolveTemporamPollTargetEmail(latestState, options);
      if (!address) {
        throw new Error('Temporam 查询最近邮件前缺少目标邮箱地址。');
      }
      const payload = await requestTemporamJson(config, '/emails/latest', {
        method: 'GET',
        params: { email: address },
      });
      return normalizeTemporamMessageDetail(payload);
    }

    function summarizeTemporamMessagesForLog(messages) {
      return (messages || [])
        .slice()
        .sort((left, right) => {
          const leftTime = Date.parse(left.receivedDateTime || '') || 0;
          const rightTime = Date.parse(right.receivedDateTime || '') || 0;
          return rightTime - leftTime;
        })
        .slice(0, 3)
        .map((message) => {
          const receivedAt = message?.receivedDateTime || '未知时间';
          const sender = message?.from?.emailAddress?.address || '未知发件人';
          const subject = message?.subject || '（无主题）';
          const preview = String(message?.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return `${receivedAt} | ${sender} | ${subject} | ${preview}`;
        })
        .join(' || ');
    }

    async function hydrateTemporamMessageDetails(state, messages) {
      const details = [];
      for (const message of (messages || []).slice(0, 8)) {
        throwIfStopped();
        if (!message?.id) {
          details.push(message);
          continue;
        }
        // List rows already have summary; only fetch detail when content is missing.
        if (message.html || message.text || message.verification_code) {
          details.push(message);
          continue;
        }
        try {
          details.push(await getTemporamMessageDetail(state, message.id));
        } catch (err) {
          await addLog(`Temporam：读取邮件详情 ${message.id} 失败：${err.message}`, 'warn');
          details.push(message);
        }
      }
      return details.filter(Boolean);
    }

    async function pollTemporamVerificationCode(step, state, pollPayload = {}) {
      const latestState = state || await getState();
      const targetEmail = resolveTemporamPollTargetEmail(latestState, pollPayload);
      if (!targetEmail) {
        throw new Error('Temporam 轮询前缺少目标邮箱地址，请先获取邮箱。');
      }

      await addLog(`步骤 ${step}：正在轮询 Temporam 邮件（${targetEmail}）...`, 'info');
      const maxAttempts = Number(pollPayload.maxAttempts) || 5;
      const intervalMs = Number(pollPayload.intervalMs) || 3000;
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        throwIfStopped();
        try {
          let detailedMessages = [];
          try {
            const latest = await getTemporamLatestMessage(latestState, { address: targetEmail });
            if (latest) {
              detailedMessages = [latest];
            }
          } catch (latestErr) {
            // latest 可能在无邮件时返回 404，回退到列表查询
            const message = String(latestErr?.message || '');
            if (!/404|not found|Email not found/i.test(message)) {
              await addLog(`步骤 ${step}：Temporam latest 查询失败，改用列表：${message}`, 'info');
            }
          }

          if (!detailedMessages.length) {
            const { messages } = await listTemporamMessages(latestState, {
              address: targetEmail,
              limit: pollPayload.limit || 20,
            });
            detailedMessages = await hydrateTemporamMessageDetails(latestState, messages);
          }

          const matchResult = pickVerificationMessageWithTimeFallback(detailedMessages, {
            afterTimestamp: pollPayload.filterAfterTimestamp || 0,
            senderFilters: pollPayload.senderFilters || [],
            subjectFilters: pollPayload.subjectFilters || [],
            requiredKeywords: pollPayload.requiredKeywords || [],
            codePatterns: pollPayload.codePatterns || [],
            excludeCodes: pollPayload.excludeCodes || [],
          });
          const match = matchResult.match;
          if (match?.code) {
            if (matchResult.usedRelaxedFilters) {
              const fallbackLabel = matchResult.usedTimeFallback ? '宽松匹配 + 时间回退' : '宽松匹配';
              await addLog(`步骤 ${step}：严格规则未命中，已改用 ${fallbackLabel} 并命中 Temporam 验证码。`, 'warn');
            }
            return {
              ok: true,
              code: match.code,
              emailTimestamp: match.receivedAt || Date.now(),
              mailId: match.message?.id || '',
            };
          }

          lastError = new Error(`步骤 ${step}：暂未在 Temporam 中找到匹配验证码（${attempt}/${maxAttempts}）。`);
          await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
          const sample = summarizeTemporamMessagesForLog(detailedMessages);
          if (sample) {
            await addLog(`步骤 ${step}：最近邮件样本：${sample}`, 'info');
          }
        } catch (err) {
          lastError = err;
          await addLog(`步骤 ${step}：Temporam 轮询失败：${err.message}`, 'warn');
        }
        if (attempt < maxAttempts) {
          await sleepWithStop(intervalMs);
        }
      }

      throw lastError || new Error(`步骤 ${step}：未在 Temporam 中找到新的匹配验证码。`);
    }

    async function clearTemporamRuntimeState(options = {}) {
      await setState({
        currentTemporamInbox: null,
        ...(options.clearEmail ? { email: null } : {}),
      });
    }

    return {
      clearTemporamRuntimeState,
      ensureTemporamConfig,
      fetchTemporamAddress,
      getTemporamConfig,
      getTemporamLatestMessage,
      getTemporamMessageDetail,
      listTemporamDomains,
      listTemporamMessages,
      pollTemporamVerificationCode,
      requestTemporamJson,
      resolveTemporamPollTargetEmail,
    };
  }

  return {
    createTemporamProvider,
  };
});
