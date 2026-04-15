using { cuid, managed } from '@sap/cds/common';

namespace com.sap.orders;

/**
 * Orders entity - references MockAI Products
 */
entity Orders : cuid, managed {
  orderNumber   : String(20) @mandatory;
  orderDate     : DateTime @cds.on.insert: $now;
  customerName  : String(100) @mandatory;
  customerEmail : String(100);
  status        : String(20) @assert.range enum {
    PENDING;
    CONFIRMED;
    SHIPPED;
    DELIVERED;
    CANCELLED;
  } default 'PENDING';
  totalAmount   : Decimal(10,2) @readonly;
  currency      : String(3) default 'USD';
  items         : Composition of many OrderItems on items.order = $self;

  // External reference to MockAI Product API
  // Stored as string to avoid tight coupling
  externalProductsAPI : String default 'http://mockai:4004/products';
}

/**
 * Order Items - links to MockAI Products via external ID
 */
entity OrderItems : cuid, managed {
  order         : Association to Orders;

  // External MockAI Product reference
  productID     : UUID @mandatory;
  productName   : String(100);  // Cached from MockAI

  quantity      : Integer @assert.range: [1, 999];
  unitPrice     : Decimal(10,2) @mandatory;
  totalPrice    : Decimal(10,2) @readonly;

  // Cache product details at order time
  productSnapshot : String(2000); // JSON snapshot of product data
}
