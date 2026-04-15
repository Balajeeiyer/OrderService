const axios = require('axios');
const CircuitBreaker = require('opossum');
const retry = require('async-retry');

/**
 * MockAI Products API Client
 * Provides resilient integration with circuit breaker and retry logic
 */
class MockAIClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || process.env.MOCKAI_SERVICE_URL || 'http://localhost:4004/products';
    this.timeout = config.timeout || parseInt(process.env.MOCKAI_TIMEOUT) || 5000;
    this.retryAttempts = config.retryAttempts || parseInt(process.env.MOCKAI_RETRY_ATTEMPTS) || 3;

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Circuit breaker options
    const breakerOptions = {
      timeout: this.timeout,
      errorThresholdPercentage: parseInt(process.env.MOCKAI_CIRCUIT_BREAKER_THRESHOLD) || 50,
      resetTimeout: parseInt(process.env.MOCKAI_CIRCUIT_BREAKER_TIMEOUT) || 30000
    };

    // Wrap axios requests in circuit breaker
    this.breaker = new CircuitBreaker(this._makeRequest.bind(this), breakerOptions);

    // Circuit breaker events
    this.breaker.on('open', () => console.warn('Circuit breaker opened - MockAI service unavailable'));
    this.breaker.on('halfOpen', () => console.info('Circuit breaker half-open - testing MockAI service'));
    this.breaker.on('close', () => console.info('Circuit breaker closed - MockAI service restored'));

    // Request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`MockAI Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('MockAI Request Error:', error.message);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        console.log(`MockAI Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error(`MockAI Response Error: ${error.response?.status || 'N/A'} ${error.config?.url}`);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Internal method to make HTTP requests
   * @private
   */
  async _makeRequest(method, url, data = null) {
    const config = { method, url };
    if (data) config.data = data;

    const response = await this.client.request(config);
    return response.data;
  }

  /**
   * Make request with retry logic and circuit breaker
   * @private
   */
  async _requestWithRetry(method, url, data = null) {
    return retry(
      async (bail) => {
        try {
          return await this.breaker.fire(method, url, data);
        } catch (error) {
          // Don't retry on 4xx errors (client errors)
          if (error.response && error.response.status >= 400 && error.response.status < 500) {
            bail(error);
            return;
          }
          throw error;
        }
      },
      {
        retries: this.retryAttempts,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000,
        onRetry: (error, attempt) => {
          console.warn(`MockAI request retry attempt ${attempt}: ${error.message}`);
        }
      }
    );
  }

  /**
   * Get product by ID
   * @param {string} productID - UUID of the product
   * @returns {Promise<Object>} Product details
   */
  async getProduct(productID) {
    return this._requestWithRetry('GET', `/Products(${productID})`);
  }

  /**
   * Get all products with optional filter
   * @param {Object} filter - OData filter options
   * @returns {Promise<Array>} List of products
   */
  async getProducts(filter = {}) {
    const params = new URLSearchParams();

    if (filter.$filter) params.append('$filter', filter.$filter);
    if (filter.$top) params.append('$top', filter.$top);
    if (filter.$skip) params.append('$skip', filter.$skip);
    if (filter.$orderby) params.append('$orderby', filter.$orderby);

    const queryString = params.toString();
    const url = `/Products${queryString ? '?' + queryString : ''}`;

    const response = await this._requestWithRetry('GET', url);
    return response.value || response;
  }

  /**
   * Check stock for a product
   * @param {string} productID - UUID of the product
   * @returns {Promise<number>} Stock level
   */
  async checkStock(productID) {
    const product = await this.getProduct(productID);
    return product.stock;
  }

  /**
   * Update product stock (custom action)
   * @param {string} productID - UUID of the product
   * @param {number} quantity - Quantity to add/subtract
   * @returns {Promise<Object>} Updated product
   */
  async updateStock(productID, quantity) {
    return this._requestWithRetry('POST', `/Products(${productID})/updateStock`, { quantity });
  }

  /**
   * Get low stock products (custom function)
   * @param {number} threshold - Stock threshold
   * @returns {Promise<Array>} Products below threshold
   */
  async getLowStockProducts(threshold = 10) {
    return this._requestWithRetry('GET', `/getLowStockProducts?threshold=${threshold}`);
  }

  /**
   * Validate multiple products exist and are active
   * @param {Array<string>} productIDs - Array of product UUIDs
   * @returns {Promise<Object>} Validation result
   */
  async validateProducts(productIDs) {
    const results = {
      valid: true,
      products: [],
      issues: []
    };

    for (const productID of productIDs) {
      try {
        const product = await this.getProduct(productID);

        if (!product.isActive) {
          results.valid = false;
          results.issues.push(`Product ${productID} is inactive`);
        }

        if (product.stock === 0) {
          results.valid = false;
          results.issues.push(`Product ${productID} is out of stock`);
        }

        results.products.push(product);
      } catch (error) {
        results.valid = false;
        results.issues.push(`Product ${productID} not found: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Health check - verify MockAI service is reachable
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const startTime = Date.now();

    try {
      await this._requestWithRetry('GET', '/Products?$top=1');
      const latency = Date.now() - startTime;

      return {
        status: 'UP',
        latency,
        timestamp: new Date().toISOString(),
        circuitBreakerState: this.breaker.opened ? 'OPEN' : this.breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED'
      };
    } catch (error) {
      return {
        status: 'DOWN',
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: error.message,
        circuitBreakerState: this.breaker.opened ? 'OPEN' : this.breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED'
      };
    }
  }

  /**
   * Get circuit breaker statistics
   * @returns {Object} Circuit breaker stats
   */
  getStats() {
    return this.breaker.stats;
  }
}

module.exports = MockAIClient;
