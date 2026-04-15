const axios = require('axios');
const SchemaValidator = require('./schema-validator');
const MockAIClient = require('../../srv/external/mockai-client');

/**
 * MockAI Integration Test Suite
 * Tests OrderService integration with MockAI Products API
 */
describe('MockAI Integration Tests', () => {
  const MOCKAI_URL = process.env.MOCKAI_SERVICE_URL || 'http://localhost:4004/products';
  const ORDERSERVICE_URL = process.env.ORDERSERVICE_URL || 'http://localhost:4005/orders';

  let mockAIClient;
  let schemaValidator;
  let testProductID;

  beforeAll(async () => {
    mockAIClient = new MockAIClient({ baseURL: MOCKAI_URL });
    schemaValidator = new SchemaValidator(MOCKAI_URL);

    // Wait for services to be ready
    await waitForService(MOCKAI_URL, 30000);
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  /**
   * Helper: Wait for service to be available
   */
  async function waitForService(url, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        await axios.get(url, { timeout: 2000 });
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Service ${url} not available after ${timeout}ms`);
  }

  /**
   * Schema Validation Tests
   */
  describe('Schema Validation', () => {
    test('should fetch MockAI $metadata successfully', async () => {
      const metadata = await schemaValidator.fetchMetadata();

      expect(metadata).toBeDefined();
      expect(metadata['edmx:Edmx']).toBeDefined();
      expect(metadata['edmx:Edmx']['edmx:DataServices']).toBeDefined();
    });

    test('should find Products entity in metadata', async () => {
      const metadata = await schemaValidator.fetchMetadata();
      const products = schemaValidator.extractEntityType(metadata, 'Products');

      expect(products).toBeDefined();
      expect(products.$.Name).toBe('Products');
    });

    test('should validate Products entity has required properties', async () => {
      const metadata = await schemaValidator.fetchMetadata();
      const products = schemaValidator.extractEntityType(metadata, 'Products');

      const properties = Array.isArray(products.Property) ? products.Property : [products.Property];
      const propertyNames = properties.map(p => p.$.Name);

      expect(propertyNames).toContain('ID');
      expect(propertyNames).toContain('name');
      expect(propertyNames).toContain('price');
      expect(propertyNames).toContain('stock');
      expect(propertyNames).toContain('isActive');
    });

    test('should detect breaking changes if properties removed', async () => {
      const metadata = await schemaValidator.fetchMetadata();
      const current = schemaValidator.extractEntityType(metadata, 'Products');

      // Simulate baseline with additional property
      const baseline = JSON.parse(JSON.stringify(current));
      baseline.Property.push({
        $: { Name: 'deletedField', Type: 'Edm.String', Nullable: 'true' }
      });

      const validation = schemaValidator.validateEntityStructure(current, baseline);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.changes.removedProperties).toContain('deletedField');
    });

    test('should detect breaking changes if property types modified', async () => {
      const metadata = await schemaValidator.fetchMetadata();
      const current = schemaValidator.extractEntityType(metadata, 'Products');

      // Simulate baseline with different type
      const baseline = JSON.parse(JSON.stringify(current));
      const priceProperty = baseline.Property.find(p => p.$.Name === 'price');
      if (priceProperty) {
        priceProperty.$.Type = 'Edm.Int32'; // Changed from Decimal
      }

      const validation = schemaValidator.validateEntityStructure(current, baseline);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('price'))).toBe(true);
    });
  });

  /**
   * CRUD Operation Tests
   */
  describe('CRUD Operations', () => {
    test('should retrieve all products', async () => {
      const products = await mockAIClient.getProducts({ $top: 10 });

      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBeGreaterThan(0);

      // Store a product ID for later tests
      if (products.length > 0) {
        testProductID = products[0].ID;
      }
    });

    test('should retrieve single product by ID', async () => {
      if (!testProductID) {
        const products = await mockAIClient.getProducts({ $top: 1 });
        testProductID = products[0].ID;
      }

      const product = await mockAIClient.getProduct(testProductID);

      expect(product).toBeDefined();
      expect(product.ID).toBe(testProductID);
      expect(product.name).toBeDefined();
      expect(product.price).toBeDefined();
      expect(product.stock).toBeDefined();
    });

    test('should return 404 for non-existent product', async () => {
      const fakeID = '00000000-0000-0000-0000-000000000000';

      await expect(mockAIClient.getProduct(fakeID)).rejects.toThrow();
    });

    test('should check product stock', async () => {
      if (!testProductID) {
        const products = await mockAIClient.getProducts({ $top: 1 });
        testProductID = products[0].ID;
      }

      const stock = await mockAIClient.checkStock(testProductID);

      expect(typeof stock).toBe('number');
      expect(stock).toBeGreaterThanOrEqual(0);
    });

    test('should filter products by active status', async () => {
      const activeProducts = await mockAIClient.getProducts({
        $filter: 'isActive eq true',
        $top: 5
      });

      expect(Array.isArray(activeProducts)).toBe(true);
      activeProducts.forEach(product => {
        expect(product.isActive).toBe(true);
      });
    });
  });

  /**
   * Business Logic Tests
   */
  describe('Business Logic', () => {
    test('should validate multiple products', async () => {
      const products = await mockAIClient.getProducts({ $top: 3 });
      const productIDs = products.map(p => p.ID);

      const validation = await mockAIClient.validateProducts(productIDs);

      expect(validation).toBeDefined();
      expect(validation.valid).toBeDefined();
      expect(Array.isArray(validation.products)).toBe(true);
      expect(Array.isArray(validation.issues)).toBe(true);
    });

    test('should detect invalid products in validation', async () => {
      const fakeID = '00000000-0000-0000-0000-000000000000';

      const validation = await mockAIClient.validateProducts([fakeID]);

      expect(validation.valid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
    });

    test('should get low stock products', async () => {
      const threshold = 50;
      const lowStockProducts = await mockAIClient.getLowStockProducts(threshold);

      expect(Array.isArray(lowStockProducts)).toBe(true);

      if (lowStockProducts.length > 0) {
        lowStockProducts.forEach(product => {
          expect(product.stock).toBeLessThan(threshold);
        });
      }
    });
  });

  /**
   * Resilience Tests
   */
  describe('Resilience', () => {
    test('should perform health check', async () => {
      const health = await mockAIClient.healthCheck();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['UP', 'DOWN']).toContain(health.status);
      expect(typeof health.latency).toBe('number');
      expect(health.timestamp).toBeDefined();
    });

    test('should handle circuit breaker stats', () => {
      const stats = mockAIClient.getStats();

      expect(stats).toBeDefined();
      expect(stats.fires).toBeDefined();
      expect(stats.successes).toBeDefined();
      expect(stats.failures).toBeDefined();
    });

    test('should timeout on slow requests', async () => {
      const slowClient = new MockAIClient({
        baseURL: MOCKAI_URL,
        timeout: 100 // Very short timeout
      });

      // This might fail or succeed depending on network speed
      // Just verify it doesn't hang indefinitely
      const startTime = Date.now();
      try {
        await slowClient.getProducts({ $top: 1 });
      } catch (error) {
        // Timeout error expected
      }
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // Should not take more than 5s
    }, 10000);
  });

  /**
   * OData Query Tests
   */
  describe('OData Queries', () => {
    test('should support $top query parameter', async () => {
      const products = await mockAIClient.getProducts({ $top: 5 });

      expect(products.length).toBeLessThanOrEqual(5);
    });

    test('should support $skip query parameter', async () => {
      const firstPage = await mockAIClient.getProducts({ $top: 2, $skip: 0 });
      const secondPage = await mockAIClient.getProducts({ $top: 2, $skip: 2 });

      expect(Array.isArray(firstPage)).toBe(true);
      expect(Array.isArray(secondPage)).toBe(true);

      if (firstPage.length > 0 && secondPage.length > 0) {
        expect(firstPage[0].ID).not.toBe(secondPage[0].ID);
      }
    });

    test('should support $orderby query parameter', async () => {
      const products = await mockAIClient.getProducts({
        $orderby: 'price asc',
        $top: 10
      });

      expect(Array.isArray(products)).toBe(true);

      // Verify ordering
      for (let i = 1; i < products.length; i++) {
        expect(products[i].price).toBeGreaterThanOrEqual(products[i - 1].price);
      }
    });

    test('should support $filter with comparison operators', async () => {
      const products = await mockAIClient.getProducts({
        $filter: 'price gt 100',
        $top: 10
      });

      expect(Array.isArray(products)).toBe(true);

      products.forEach(product => {
        expect(product.price).toBeGreaterThan(100);
      });
    });
  });

  /**
   * Error Handling Tests
   */
  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      const invalidClient = new MockAIClient({
        baseURL: 'http://localhost:9999/invalid',
        timeout: 2000,
        retryAttempts: 1
      });

      await expect(invalidClient.getProducts()).rejects.toThrow();
    });

    test('should handle malformed product IDs', async () => {
      await expect(mockAIClient.getProduct('invalid-id')).rejects.toThrow();
    });
  });
});
