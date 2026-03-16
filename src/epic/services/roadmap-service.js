/**
 * @fileoverview Roadmap Service - Planning and progress tracking
 * @module epic/services/roadmap-service
 */

import { ValidationError, BusinessRuleError } from '../utils/errors.js';
import { ROADMAP_GRANULARITY, isValidGranularity, EPIC_STATUS } from '../models/validators.js';

/**
 * Generates period label based on granularity
 * @private
 * @param {Date} date - Date to generate label for
 * @param {string} granularity - 'weekly', 'monthly', or 'quarterly'
 * @returns {string} Period label (e.g., "2026-W12", "2026-03", "2026-Q1")
 */
function getPeriodLabel(date, granularity) {
  const year = date.getFullYear();

  switch (granularity) {
    case ROADMAP_GRANULARITY.WEEKLY: {
      // ISO week number calculation
      const firstDayOfYear = new Date(year, 0, 1);
      const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
      const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    }
    case ROADMAP_GRANULARITY.MONTHLY: {
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      return `${year}-${month}`;
    }
    case ROADMAP_GRANULARITY.QUARTERLY: {
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      return `${year}-Q${quarter}`;
    }
    default:
      return `${year}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}

/**
 * Parses a period string into start and end dates
 * @private
 * @param {string} period - Period string (e.g., "2026-Q1", "2026-03", "2026-W12")
 * @returns {{start: Date, end: Date}} Period date range
 */
function parsePeriod(period) {
  // Quarterly: 2026-Q1
  const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const year = parseInt(quarterMatch[1], 10);
    const quarter = parseInt(quarterMatch[2], 10);
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // Monthly: 2026-03
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10) - 1;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // Weekly: 2026-W12
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1], 10);
    const week = parseInt(weekMatch[2], 10);
    // Calculate first day of ISO week
    const jan4 = new Date(year, 0, 4);
    const start = new Date(jan4);
    start.setDate(jan4.getDate() - jan4.getDay() + 1 + (week - 1) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  throw new ValidationError(`Invalid period format: ${period}`);
}

/**
 * Generates a range of periods between two dates
 * @private
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} granularity - Granularity
 * @returns {string[]} Array of period labels
 */
function generatePeriodRange(startDate, endDate, granularity) {
  const periods = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const label = getPeriodLabel(current, granularity);
    if (!periods.includes(label)) {
      periods.push(label);
    }

    // Advance to next period
    switch (granularity) {
      case ROADMAP_GRANULARITY.WEEKLY:
        current.setDate(current.getDate() + 7);
        break;
      case ROADMAP_GRANULARITY.MONTHLY:
        current.setMonth(current.getMonth() + 1);
        break;
      case ROADMAP_GRANULARITY.QUARTERLY:
        current.setMonth(current.getMonth() + 3);
        break;
    }
  }

  return periods;
}

/**
 * Service for roadmap planning and visualization
 */
export class RoadmapService {
  /**
   * @param {import('../providers/file-storage-provider.js').FileStorageProvider} storage
   * @param {import('./epic-service.js').EpicService} epicService
   */
  constructor(storage, epicService) {
    this.storage = storage;
    this.epicService = epicService;
  }

  /**
   * Gets roadmap data with Epics grouped by time period
   * @param {Object} [options] - Options
   * @param {string} [options.granularity='quarterly'] - Time granularity
   * @param {number} [options.periodsAhead=4] - Number of future periods to include
   * @param {boolean} [options.includeCompleted=false] - Include completed epics
   * @returns {Promise<Object>} Roadmap data
   */
  async getRoadmap(options = {}) {
    const {
      granularity = ROADMAP_GRANULARITY.QUARTERLY,
      periodsAhead = 4,
      includeCompleted = false,
    } = options;

    if (!isValidGranularity(granularity)) {
      throw new ValidationError(
        `Invalid granularity: ${granularity}. Must be one of: ${Object.values(ROADMAP_GRANULARITY).join(', ')}`
      );
    }

    // Get all epics
    const epics = await this.epicService.list({ includeArchived: false });

    // Filter completed if needed, and exclude General epic (system epic)
    const filteredEpics = epics.filter((e) => {
      // Exclude General epic from roadmap
      if (e.isGeneral) return false;
      // Exclude completed if option is false
      if (!includeCompleted && e.status === EPIC_STATUS.DONE) return false;
      return true;
    });

    // Generate period range
    const now = new Date();
    const endDate = new Date(now);

    switch (granularity) {
      case ROADMAP_GRANULARITY.WEEKLY:
        endDate.setDate(endDate.getDate() + periodsAhead * 7);
        break;
      case ROADMAP_GRANULARITY.MONTHLY:
        endDate.setMonth(endDate.getMonth() + periodsAhead);
        break;
      case ROADMAP_GRANULARITY.QUARTERLY:
        endDate.setMonth(endDate.getMonth() + periodsAhead * 3);
        break;
    }

    const periods = generatePeriodRange(now, endDate, granularity);
    const currentPeriod = getPeriodLabel(now, granularity);

    // Group epics by planned period
    const roadmapData = {
      granularity,
      currentPeriod,
      generatedAt: new Date().toISOString(),
      periods: {},
      unplanned: [],
    };

    // Initialize periods
    for (const period of periods) {
      roadmapData.periods[period] = [];
    }

    // Assign epics to periods
    for (const epic of filteredEpics) {
      const epicData = {
        id: epic.id,
        name: epic.name,
        status: epic.status,
        progress: epic.progress || 0,
        storyCount: (epic.stories || []).length,
        isGeneral: epic.isGeneral || false,
        plannedPeriod: epic.plannedPeriod || null,
      };

      if (epic.plannedPeriod && roadmapData.periods[epic.plannedPeriod] !== undefined) {
        // Epic has a period that's in the visible range
        roadmapData.periods[epic.plannedPeriod].push(epicData);
      } else {
        // Epic has no period OR period is outside visible range -> goes to backlog
        roadmapData.unplanned.push(epicData);
      }
    }

    return roadmapData;
  }

  /**
   * Assigns an Epic to a time period
   * @param {string} epicId - Epic ID
   * @param {string} period - Period string (e.g., "2026-Q1")
   * @returns {Promise<import('../models/epic.js').Epic>} Updated Epic
   */
  async assignPeriod(epicId, period) {
    // Validate period format
    try {
      parsePeriod(period);
    } catch (e) {
      throw new ValidationError(`Invalid period format: ${period}. Use format like 2026-Q1, 2026-03, or 2026-W12`);
    }

    return this.epicService.update(epicId, { plannedPeriod: period });
  }

  /**
   * Removes period assignment from an Epic
   * @param {string} epicId - Epic ID
   * @returns {Promise<import('../models/epic.js').Epic>} Updated Epic
   */
  async unassignPeriod(epicId) {
    return this.epicService.update(epicId, { plannedPeriod: null });
  }

  /**
   * Gets epics for a specific period
   * @param {string} period - Period string
   * @returns {Promise<Array<Object>>} Epics in the period
   */
  async getEpicsForPeriod(period) {
    // Validate period
    try {
      parsePeriod(period);
    } catch (e) {
      throw new ValidationError(`Invalid period format: ${period}`);
    }

    const epics = await this.epicService.list({ includeArchived: false });
    return epics
      .filter((e) => e.plannedPeriod === period)
      .map((epic) => ({
        id: epic.id,
        name: epic.name,
        status: epic.status,
        progress: epic.progress || 0,
        storyCount: (epic.stories || []).length,
        isGeneral: epic.isGeneral || false,
      }));
  }

  /**
   * Gets the current period label
   * @param {string} [granularity='quarterly'] - Time granularity
   * @returns {string} Current period label
   */
  getCurrentPeriod(granularity = ROADMAP_GRANULARITY.QUARTERLY) {
    if (!isValidGranularity(granularity)) {
      throw new ValidationError(`Invalid granularity: ${granularity}`);
    }
    return getPeriodLabel(new Date(), granularity);
  }

  /**
   * Gets next N periods from current date
   * @param {number} count - Number of periods
   * @param {string} [granularity='quarterly'] - Time granularity
   * @returns {string[]} Array of period labels
   */
  getUpcomingPeriods(count, granularity = ROADMAP_GRANULARITY.QUARTERLY) {
    if (!isValidGranularity(granularity)) {
      throw new ValidationError(`Invalid granularity: ${granularity}`);
    }

    const now = new Date();
    const endDate = new Date(now);

    switch (granularity) {
      case ROADMAP_GRANULARITY.WEEKLY:
        endDate.setDate(endDate.getDate() + count * 7);
        break;
      case ROADMAP_GRANULARITY.MONTHLY:
        endDate.setMonth(endDate.getMonth() + count);
        break;
      case ROADMAP_GRANULARITY.QUARTERLY:
        endDate.setMonth(endDate.getMonth() + count * 3);
        break;
    }

    return generatePeriodRange(now, endDate, granularity);
  }

  /**
   * Gets progress summary for a period
   * @param {string} period - Period string
   * @returns {Promise<Object>} Progress summary
   */
  async getPeriodProgress(period) {
    const epics = await this.getEpicsForPeriod(period);

    if (epics.length === 0) {
      return {
        period,
        epicCount: 0,
        totalStories: 0,
        averageProgress: 0,
        byStatus: {},
      };
    }

    const byStatus = {};
    let totalProgress = 0;
    let totalStories = 0;

    for (const epic of epics) {
      byStatus[epic.status] = (byStatus[epic.status] || 0) + 1;
      totalProgress += epic.progress;
      totalStories += epic.storyCount;
    }

    return {
      period,
      epicCount: epics.length,
      totalStories,
      averageProgress: Math.round(totalProgress / epics.length),
      byStatus,
    };
  }

  /**
   * Gets overall roadmap statistics
   * @returns {Promise<Object>} Roadmap statistics
   */
  async getStats() {
    const epics = await this.epicService.list({ includeArchived: false });

    // Exclude General epic from stats
    const filteredEpics = epics.filter((e) => !e.isGeneral);

    const stats = {
      totalEpics: filteredEpics.length,
      planned: 0,
      unplanned: 0,
      byPeriod: {},
      byStatus: {},
    };

    for (const epic of filteredEpics) {
      if (epic.plannedPeriod) {
        stats.planned++;
        stats.byPeriod[epic.plannedPeriod] = (stats.byPeriod[epic.plannedPeriod] || 0) + 1;
      } else {
        stats.unplanned++;
      }

      stats.byStatus[epic.status] = (stats.byStatus[epic.status] || 0) + 1;
    }

    return stats;
  }

  /**
   * Validates a period string format
   * @param {string} period - Period string to validate
   * @returns {boolean} True if valid
   */
  isValidPeriod(period) {
    try {
      parsePeriod(period);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parses period string and returns date range
   * @param {string} period - Period string
   * @returns {{start: Date, end: Date}} Date range
   */
  parsePeriodDates(period) {
    return parsePeriod(period);
  }
}
