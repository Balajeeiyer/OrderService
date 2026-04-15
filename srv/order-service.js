const cds = require('@sap/cds');
const MockAIClient = require('./external/mockai-client');

/**
 * OrderService Implementation
 * Business logic for order management with MockAI integration
 */
module.exports = cds.service.impl(async function () {
  const { Orders, OrderItems } = this.entities;
  const mockAIClient = new MockAIClient();
  const LOG = cds.log('order-service');

  /**
   * Before CREATE handler for Orders
   * Initialize order with generated order number
   */
  this.before('CREATE', Orders, async (req) => {
    const { customerName, customerEmail } = req.data;

    // Validate customer information
    if (!customerName || customerName.trim().length === 0) {
      req.error(400, 'Customer name is required', 'customerName');
    }

    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      req.error(400, 'Invalid email format', 'customerEmail');
    }

    // Generate order number
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    req.data.orderNumber = `ORD-${timestamp}-${random}`;

    // Set initial status
    req.data.status = 'PENDING';
    req.data.totalAmount = 0;

    LOG.info('Creating order', {
      orderNumber: req.data.orderNumber,
      customer: customerName,
      email: customerEmail
    });
  });

  /**
   * After CREATE handler for Orders
   * Calculate initial total amount
   */
  this.after('CREATE', Orders, async (order) => {
    if (order.items && order.items.length > 0) {
      await this._calculateOrderTotal(order.ID);
    }
  });

  /**
   * Action: Add product to order
   * Fetches product details from MockAI and adds to order items
   */
  this.on('addProduct', Orders, async (req) => {
    const { ID } = req.params[0];
    const { productID, quantity } = req.data;

    try {
      // Validate order exists and is editable
      const order = await SELECT.one.from(Orders).where({ ID });

      if (!order) {
        return req.error(404, `Order ${ID} not found`);
      }

      if (order.status !== 'PENDING') {
        return req.error(400, `Cannot modify order in ${order.status} status`);
      }

      // Validate quantity
      if (!quantity || quantity < 1 || quantity > 999) {
        return req.error(400, 'Quantity must be between 1 and 999', 'quantity');
      }

      // Fetch product from MockAI
      LOG.info('Fetching product from MockAI', { productID, quantity });
      const product = await mockAIClient.getProduct(productID);

      // Validate product
      if (!product.isActive) {
        return req.error(400, `Product ${product.name} is inactive`);
      }

      if (product.stock < quantity) {
        return req.error(400, `Insufficient stock for ${product.name}. Available: ${product.stock}`);
      }

      // Create order item
      const unitPrice = product.price;
      const totalPrice = unitPrice * quantity;

      await INSERT.into(OrderItems).entries({
        order_ID: ID,
        productID: product.ID,
        productName: product.name,
        quantity,
        unitPrice,
        totalPrice,
        productSnapshot: JSON.stringify({
          ID: product.ID,
          name: product.name,
          description: product.description,
          price: product.price,
          currency: product.currency,
          stock: product.stock,
          isActive: product.isActive,
          snapshotDate: new Date().toISOString()
        })
      });

      // Recalculate order total
      await this._calculateOrderTotal(ID);

      LOG.info('Product added to order', {
        orderID: ID,
        productID,
        productName: product.name,
        quantity,
        totalPrice
      });

      return await SELECT.one.from(Orders).where({ ID });
    } catch (error) {
      LOG.error('Failed to add product to order', { orderID: ID, productID, error: error.message });

      if (error.response?.status === 404) {
        return req.error(404, `Product ${productID} not found in MockAI`);
      }

      return req.error(500, `Failed to add product: ${error.message}`);
    }
  });

  /**
   * Action: Validate product availability
   * Checks all order items against MockAI for availability
   */
  this.on('validateProductAvailability', Orders, async (req) => {
    const { ID } = req.params[0];

    try {
      const items = await SELECT.from(OrderItems).where({ order_ID: ID });

      if (items.length === 0) {
        return {
          valid: true,
          issues: []
        };
      }

      const productIDs = items.map(item => item.productID);
      const validation = await mockAIClient.validateProducts(productIDs);

      LOG.info('Product availability validated', {
        orderID: ID,
        valid: validation.valid,
        issueCount: validation.issues.length
      });

      return {
        valid: validation.valid,
        issues: validation.issues
      };
    } catch (error) {
      LOG.error('Failed to validate product availability', { orderID: ID, error: error.message });
      return req.error(500, `Failed to validate products: ${error.message}`);
    }
  });

  /**
   * Action: Submit order
   * Validates products and transitions order to CONFIRMED
   */
  this.on('submitOrder', Orders, async (req) => {
    const { ID } = req.params[0];

    try {
      const order = await SELECT.one.from(Orders).where({ ID });

      if (!order) {
        return req.error(404, `Order ${ID} not found`);
      }

      if (order.status !== 'PENDING') {
        return req.error(400, `Order is already ${order.status}`);
      }

      const items = await SELECT.from(OrderItems).where({ order_ID: ID });

      if (items.length === 0) {
        return req.error(400, 'Cannot submit empty order');
      }

      // Validate product availability
      const validation = await mockAIClient.validateProducts(items.map(i => i.productID));

      if (!validation.valid) {
        return req.error(400, `Cannot submit order: ${validation.issues.join(', ')}`);
      }

      // Update order status
      await UPDATE(Orders).set({ status: 'CONFIRMED' }).where({ ID });

      LOG.info('Order submitted', {
        orderID: ID,
        orderNumber: order.orderNumber,
        itemCount: items.length,
        totalAmount: order.totalAmount
      });

      return await SELECT.one.from(Orders).where({ ID });
    } catch (error) {
      LOG.error('Failed to submit order', { orderID: ID, error: error.message });
      return req.error(500, `Failed to submit order: ${error.message}`);
    }
  });

  /**
   * Function: Get product from MockAI
   * Exposes MockAI product lookup as OData function
   */
  this.on('getProductFromMockAI', async (req) => {
    const { productID } = req.data;

    try {
      const product = await mockAIClient.getProduct(productID);

      LOG.info('Product fetched from MockAI', { productID, name: product.name });

      return {
        ID: product.ID,
        name: product.name,
        price: product.price,
        stock: product.stock,
        isActive: product.isActive
      };
    } catch (error) {
      LOG.error('Failed to fetch product from MockAI', { productID, error: error.message });

      if (error.response?.status === 404) {
        return req.error(404, `Product ${productID} not found`);
      }

      return req.error(500, `Failed to fetch product: ${error.message}`);
    }
  });

  /**
   * Function: Check MockAI health
   * Returns MockAI service health status
   */
  this.on('checkMockAIHealth', async (req) => {
    try {
      const health = await mockAIClient.healthCheck();

      LOG.info('MockAI health check', health);

      return {
        status: health.status,
        latency: health.latency,
        timestamp: health.timestamp
      };
    } catch (error) {
      LOG.error('MockAI health check failed', { error: error.message });
      return {
        status: 'ERROR',
        latency: 0,
        timestamp: new Date().toISOString()
      };
    }
  });

  /**
   * Helper: Calculate order total amount
   * @private
   */
  this._calculateOrderTotal = async function (orderID) {
    const items = await SELECT.from(OrderItems).where({ order_ID: orderID });

    const total = items.reduce((sum, item) => sum + parseFloat(item.totalPrice || 0), 0);

    await UPDATE(Orders).set({ totalAmount: total }).where({ ID: orderID });

    LOG.info('Order total calculated', { orderID, total, itemCount: items.length });
  };
});
