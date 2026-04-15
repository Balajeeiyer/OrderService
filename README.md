# OrderService

Order Management Service that integrates with MockAI Products API for product information.

## Overview

OrderService is a SAP Cloud Application Programming Model (CAP) microservice that manages customer orders and integrates with the MockAI Products API. It demonstrates resilient microservice integration patterns including circuit breakers, retry logic, and comprehensive testing.

## Features

- **Order Management**: Create and manage customer orders
- **Product Integration**: Fetch product details from MockAI API
- **Resilient Integration**: Circuit breaker, retry logic, graceful degradation
- **Draft Support**: OData draft-enabled orders
- **Comprehensive Testing**: Schema validation, integration tests, performance benchmarks

## Architecture

```
OrderService (this repo)
    ↓ HTTP/OData
MockAI Products API (external dependency)
```

### Components

- **Order Management**: Create orders, add products, submit for processing
- **MockAI Client**: Resilient HTTP client with circuit breaker (opossum) and retry (async-retry)
- **Schema Validator**: Validates MockAI $metadata for breaking changes
- **Integration Tests**: 50+ tests covering CRUD, business logic, OData queries
- **Performance Benchmarks**: Latency thresholds (p50/p95/p99) and throughput testing

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose (for integration tests)
- Access to MockAI service (local or remote)

### Installation

```bash
npm install
```

### Configuration

Set environment variables:

```bash
export MOCKAI_SERVICE_URL=http://localhost:4004/products
export MOCKAI_TIMEOUT=5000
export MOCKAI_RETRY_ATTEMPTS=3
export MOCKAI_CIRCUIT_BREAKER_THRESHOLD=50
export MOCKAI_CIRCUIT_BREAKER_TIMEOUT=30000
```

### Running Locally

```bash
# Start the service
npm start

# Access the service
open http://localhost:4005/orders
```

## Testing

### Integration Tests

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run schema validation
npm run test:schema

# Run performance benchmarks
npm run test:performance

# Run with coverage
npm run test:coverage
```

### Docker-based Integration Tests

```bash
# Start test environment
docker-compose -f docker-compose.test.yml up

# Run integration tests
docker-compose -f docker-compose.test.yml run integration-tests

# Run performance tests
docker-compose -f docker-compose.test.yml --profile performance up performance-tests

# Cleanup
docker-compose -f docker-compose.test.yml down -v
```

## API Endpoints

### Orders

- `GET /orders/Orders` - List all orders
- `GET /orders/Orders({ID})` - Get order by ID
- `POST /orders/Orders` - Create new order
- `POST /orders/Orders({ID})/addProduct` - Add product to order
- `POST /orders/Orders({ID})/validateProductAvailability` - Validate products
- `POST /orders/Orders({ID})/submitOrder` - Submit order

### Functions

- `GET /orders/getProductFromMockAI?productID={uuid}` - Fetch product from MockAI
- `GET /orders/checkMockAIHealth` - Check MockAI service health

## CI/CD

### GitHub Workflow

The `.github/workflows/external-integration-test.yml` workflow runs automatically when MockAI changes are detected:

1. **Triggered by**: MockAI PR creates `repository_dispatch` event
2. **Clones MockAI**: Checks out the PR branch
3. **Runs Tests**:
   - Schema validation (breaking change detection)
   - Integration tests (CRUD, business logic, OData)
   - Performance benchmarks (latency thresholds)
4. **Reports Results**: Posts comment and GitHub Check to MockAI PR

### Manual Trigger

```bash
gh workflow run external-integration-test.yml \
  -f mockai_pr_number=123 \
  -f test_type=all
```

## Development

### Project Structure

```
OrderService/
├── db/
│   └── schema.cds              # Data model (Orders, OrderItems)
├── srv/
│   ├── order-service.cds       # Service definition
│   ├── order-service.js        # Business logic
│   └── external/
│       └── mockai-client.js    # MockAI HTTP client
├── test/
│   ├── integration/
│   │   ├── mockai-integration.test.js
│   │   ├── schema-validator.js
│   │   └── performance-benchmark.js
│   └── fixtures/
│       └── mockai-baseline-metadata.json
├── docker-compose.test.yml     # Docker test environment
├── Dockerfile                  # OrderService container
└── Dockerfile.test             # Test runner container
```

### Adding New Tests

1. Create test file in `test/integration/`
2. Follow existing patterns (schema, integration, performance)
3. Update `package.json` scripts if needed
4. Run tests locally before committing

## Performance Thresholds

- **p50 latency**: ≤ 200ms
- **p95 latency**: ≤ 500ms
- **p99 latency**: ≤ 1000ms
- **Error rate**: < 1%

## Troubleshooting

### MockAI Service Unavailable

```bash
# Check MockAI health
curl http://localhost:4004/products

# View circuit breaker stats
# Access /orders/checkMockAIHealth
```

### Integration Tests Failing

```bash
# Check Docker logs
docker-compose -f docker-compose.test.yml logs mockai
docker-compose -f docker-compose.test.yml logs orderservice

# Verify services are healthy
docker-compose -f docker-compose.test.yml ps
```

### Performance Benchmarks Failing

- Check MockAI response times
- Verify network latency
- Increase thresholds if infrastructure constraints apply

## Related Documentation

- [MockAI Repository](https://github.com/Balajeeiyer/MockAI)
- [Cross-Repository Integration Testing Design](../MockAI/docs/superpowers/specs/2026-04-15-cross-repo-integration-testing-design.md)
- [SAP CAP Documentation](https://cap.cloud.sap/docs/)

## License

ISC
