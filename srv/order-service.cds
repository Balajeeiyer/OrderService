using { com.sap.orders as db } from '../db/schema';

/**
 * OrderService - Order Management Service
 * Integrates with MockAI Products API for product information
 */
service OrderService @(path: '/orders') {

  /**
   * Orders entity with draft support
   * Supports custom actions for order processing
   */
  @odata.draft.enabled
  entity Orders as projection on db.Orders actions {
    /**
     * Add product to order
     * Validates product exists in MockAI and is in stock
     */
    action addProduct(
      productID : UUID,
      quantity : Integer
    ) returns Orders;

    /**
     * Validate all products in order are still available
     * Checks MockAI API for product availability and stock
     */
    action validateProductAvailability() returns {
      valid : Boolean;
      issues : array of String;
    };

    /**
     * Submit order for processing
     * Finalizes order and transitions to CONFIRMED status
     */
    action submitOrder() returns Orders;
  };

  /**
   * Order Items projection
   * Read-only access to order line items
   */
  @readonly
  entity OrderItems as projection on db.OrderItems;

  /**
   * Get product details from MockAI API
   * Used for product lookup and validation
   */
  function getProductFromMockAI(productID : UUID) returns {
    ID : UUID;
    name : String;
    price : Decimal(10,2);
    stock : Integer;
    isActive : Boolean;
  };

  /**
   * Check MockAI service health
   * Returns connectivity status
   */
  function checkMockAIHealth() returns {
    status : String;
    latency : Integer;
    timestamp : DateTime;
  };
}
