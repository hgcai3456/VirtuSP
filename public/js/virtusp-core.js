(function (root) {
  const normalizeText = (raw = '') => String(raw || '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function tokenList(text) {
    return normalizeText(text).split(/\s+/).filter(Boolean);
  }

  function matchesKeyword(text, keyword) {
    const query = normalizeText(text);
    const term = normalizeText(keyword);
    if (!term || !query) {
      return false;
    }

    const queryTokens = tokenList(query);
    const termTokens = tokenList(term);

    if (!queryTokens.length || !termTokens.length) {
      return false;
    }

    if (termTokens.length > 1) {
      return queryTokens.some((_, index) => {
        const slice = queryTokens.slice(index, index + termTokens.length);
        if (slice.length !== termTokens.length) {
          return false;
        }
        return slice.every((token, tokenIndex) => {
          const target = termTokens[tokenIndex];
          return token === target || (target.length > 3 && token.startsWith(target));
        });
      });
    }

    const target = termTokens[0];
    return queryTokens.some((token) => token === target || (target.length > 3 && token.startsWith(target)));
  }

  function questionKeys(text) {
    return tokenList(text).filter((token) => token.length > 2 || token === 'ct');
  }

  function isGreetingQuestion(text) {
    const query = normalizeText(text || '');
    if (!query) {
      return false;
    }

    return /^(hi|hello|hey|good morning|good afternoon|good evening)/.test(query)
      || /^(hi|hello|hey)\s+(denise|marcus|[a-z]+)/.test(query);
  }

  function isConfirmationQuestion(text) {
    const query = normalizeText(text || '');
    return /\b(correct|right|accurate)\b/.test(query);
  }

  function conversationReply(text) {
    const query = normalizeText(text);
    if (/^(hello|hi|hey)( [a-z]+)?$/.test(query)) return 'Hello.';
    if (/^(thank you|thanks)( for sharing that)?$/.test(query)) return 'Thank you for listening.';
    if (query === 'can you hear me') return 'Yes, I can hear you.';
    return null;
  }

  function isUnsafeQuestion(text) {
    const query = normalizeText(text);
    return /\b(ignore|invent|pretend|override)\b/.test(query)
      || (!/^(hello|hi|hey|what|how|why|when|where|who|do|does|did|is|are|have|has|can|could|would|tell|so|i am sorry|i m sorry|that sounds|some people|thank)\b/.test(query));
  }

  function canonicalQuestion(text) {
    return normalizeText(text).replace(/\s+/g, ' ').trim();
  }

  const api = {
    normalizeText,
    tokenList,
    matchesKeyword,
    questionKeys,
    isGreetingQuestion,
    isConfirmationQuestion,
    canonicalQuestion,
    conversationReply,
    isUnsafeQuestion
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.VirtuSPCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
