/**
 * @fileoverview API routes for test-quick feature
 * Provides REST endpoints for managing test-quick items
 */

import { json, error } from '../router.js';
import {
  loadItems,
  createItem,
  getItem,
  listItems,
  updateItem,
  deleteItem,
  updateStatus,
  clearCompleted,
} from '../../services/test-quick.js';
import { TEST_QUICK_STATUS, isValidTestQuickName } from '../../types/test-quick.js';

/**
 * Registers test-quick API routes
 * @param {Object} router - Router instance
 */
export function registerTestQuickRoutes(router) {
  /**
   * GET /api/test-quick/statuses
   * Get available status values
   * Note: Must be registered before :name route to avoid conflict
   */
  router.get('/api/test-quick/statuses', async (req, res) => {
    json(res, { statuses: Object.values(TEST_QUICK_STATUS) });
  });

  /**
   * GET /api/test-quick
   * List all test-quick items with optional status filter
   */
  router.get('/api/test-quick', async (req, res, { root, query }) => {
    try {
      const options = {};
      if (query?.status) {
        options.status = query.status;
      }

      const result = await listItems(options, root);
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * GET /api/test-quick/:name
   * Get a single test-quick item by name
   */
  router.get('/api/test-quick/:name', async (req, res, { params, root }) => {
    try {
      const result = await getItem(params.name, root);

      if (!result.success) {
        return error(res, result.error, 404);
      }

      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/test-quick
   * Create a new test-quick item
   */
  router.post('/api/test-quick', async (req, res, { root, parseBody }) => {
    try {
      const body = await parseBody();

      if (!body.name) {
        return error(res, 'Name is required', 400);
      }

      if (!isValidTestQuickName(body.name)) {
        return error(
          res,
          'Invalid name. Use lowercase alphanumeric with hyphens (e.g., my-item)',
          400
        );
      }

      const result = await createItem(
        {
          name: body.name,
          description: body.description,
        },
        root
      );

      if (!result.success) {
        return error(res, result.error, 400);
      }

      json(res, result, 201);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * PUT /api/test-quick/:name
   * Update a test-quick item
   */
  router.put('/api/test-quick/:name', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();
      const updates = {};

      if (body.description !== undefined) {
        updates.description = body.description;
      }

      if (body.status !== undefined) {
        const validStatuses = Object.values(TEST_QUICK_STATUS);
        if (!validStatuses.includes(body.status)) {
          return error(res, `Invalid status. Valid values: ${validStatuses.join(', ')}`, 400);
        }
        updates.status = body.status;
      }

      if (body.metadata !== undefined) {
        updates.metadata = body.metadata;
      }

      if (Object.keys(updates).length === 0) {
        return error(res, 'No valid updates provided', 400);
      }

      const result = await updateItem(params.name, updates, root);

      if (!result.success) {
        return error(res, result.error, 404);
      }

      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * PATCH /api/test-quick/:name/status
   * Update only the status of a test-quick item
   */
  router.patch('/api/test-quick/:name/status', async (req, res, { params, root, parseBody }) => {
    try {
      const body = await parseBody();

      if (!body.status) {
        return error(res, 'Status is required', 400);
      }

      const validStatuses = Object.values(TEST_QUICK_STATUS);
      if (!validStatuses.includes(body.status)) {
        return error(res, `Invalid status. Valid values: ${validStatuses.join(', ')}`, 400);
      }

      const result = await updateStatus(params.name, body.status, root);

      if (!result.success) {
        return error(res, result.error, 404);
      }

      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * DELETE /api/test-quick/:name
   * Delete a test-quick item
   */
  router.delete('/api/test-quick/:name', async (req, res, { params, root }) => {
    try {
      const result = await deleteItem(params.name, root);

      if (!result.success) {
        return error(res, result.error, 404);
      }

      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });

  /**
   * POST /api/test-quick/clear-completed
   * Clear all completed items
   */
  router.post('/api/test-quick/clear-completed', async (req, res, { root }) => {
    try {
      const result = await clearCompleted(root);
      json(res, result);
    } catch (err) {
      error(res, err.message, 500);
    }
  });
}
