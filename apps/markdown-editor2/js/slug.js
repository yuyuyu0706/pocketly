(function (global) {
  'use strict';

  function normalizeValue(value) {
    if (typeof value !== 'string') {
      return '';
    }
    try {
      return value.normalize('NFKD');
    } catch (error) {
      return value;
    }
  }

  function stripCombiningMarks(value) {
    return value.replace(/\p{M}+/gu, '');
  }

  function baseSlug(value) {
    const normalized = stripCombiningMarks(normalizeValue(value));
    const lower = normalized.toLowerCase();
    const cleaned = lower
      .trim()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || 'section';
  }

  function createGenerator() {
    const seen = Object.create(null);
    return function generateUniqueSlug(value) {
      const base = baseSlug(value);
      const count = seen[base] || 0;
      seen[base] = count + 1;
      return count ? `${base}-${count}` : base;
    };
  }

  global.Slug = Object.freeze({
    slugify: baseSlug,
    createGenerator
  });
})(window);
