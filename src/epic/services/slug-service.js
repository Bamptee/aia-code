/**
 * @fileoverview Slug generation service for URL-safe identifiers
 * @module epic/services/slug-service
 */

/**
 * Generates a URL-safe slug from a title
 * Handles collisions by appending numeric suffixes
 * @param {string} title - The title to generate slug from
 * @param {string[]} existingSlugs - Array of existing slugs to check for collisions
 * @returns {string} URL-safe slug
 */
export function generateSlug(title, existingSlugs = []) {
  if (!title || typeof title !== 'string') {
    throw new Error('Title is required for slug generation');
  }

  // Normalize: lowercase, remove diacritics, remove special chars, replace spaces with hyphens
  let baseSlug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '')      // Remove special chars
    .replace(/\s+/g, '-')              // Spaces to hyphens
    .replace(/-+/g, '-')               // Multiple hyphens to single
    .replace(/^-|-$/g, '')             // Trim hyphens
    .substring(0, 50);                  // Max length

  // If empty after processing, use a default
  if (!baseSlug) {
    baseSlug = 'story';
  }

  // Check if slug already exists
  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }

  // Handle collision with numeric suffix
  let counter = 1;
  let slug = `${baseSlug}-${counter}`;
  while (existingSlugs.includes(slug)) {
    counter++;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
}

/**
 * Validates slug format
 * @param {string} slug - Slug to validate
 * @returns {boolean} True if valid slug format
 */
export function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return false;
  }
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length >= 2 && slug.length <= 100;
}

/**
 * Sanitizes input for slug generation to prevent XSS and injection
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeForSlug(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/<[^>]*>/g, '')           // Strip HTML
    .replace(/[<>"'&]/g, '')           // Remove dangerous chars
    .substring(0, 255);                // Length limit
}

/**
 * SlugService class for managing slug generation with async operations
 */
export class SlugService {
  /**
   * Generates a unique slug by checking against existing slugs
   * @param {string} title - Title to generate slug from
   * @param {Function} getExistingSlugs - Async function that returns existing slugs
   * @returns {Promise<string>} Unique slug
   */
  async generateUniqueSlug(title, getExistingSlugs) {
    const existingSlugs = await getExistingSlugs();
    return generateSlug(title, existingSlugs);
  }

  /**
   * Validates slug format
   * @param {string} slug - Slug to validate
   * @returns {boolean} True if valid
   */
  validateSlug(slug) {
    return validateSlug(slug);
  }
}
