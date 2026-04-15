const autocannon = require('autocannon');
const axios = require('axios');

/**
 * Performance Benchmarks for MockAI Integration
 * Tests response time thresholds and throughput
 */
class PerformanceBenchmark {
  constructor(baseURL) {
    this.baseURL = baseURL || process.env.MOCKAI_SERVICE_URL || 'http://localhost:4004/products';
    this.thresholds = {
      p50: 200,   // 50th percentile: 200ms
      p95: 500,   // 95th percentile: 500ms
      p99: 1000,  // 99th percentile: 1000ms
      errors: 1   // Max 1% error rate
    };
  }

  /**
   * Wait for service to be ready
   */
  async waitForService(timeout = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        await axios.get(this.baseURL, { timeout: 2000 });
        console.log('✓ MockAI service is ready');
        return true;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Service not available after ${timeout}ms`);
  }

  /**
   * Run benchmark test
   */
  async runBenchmark(options) {
    const defaults = {
      url: this.baseURL,
      connections: 10,
      duration: 10,
      pipelining: 1
    };

    const config = { ...defaults, ...options };

    return new Promise((resolve, reject) => {
      const instance = autocannon(config, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });

      autocannon.track(instance, { renderProgressBar: false });
    });
  }

  /**
   * Benchmark: GET all products
   */
  async benchmarkGetProducts() {
    console.log('\n🔍 Benchmarking GET /Products...');

    const result = await this.runBenchmark({
      url: `${this.baseURL}/Products?$top=50`,
      method: 'GET'
    });

    return this.analyzeResults('GET /Products', result);
  }

  /**
   * Benchmark: GET single product
   */
  async benchmarkGetSingleProduct() {
    console.log('\n🔍 Benchmarking GET /Products({id})...');

    // First, get a valid product ID
    const response = await axios.get(`${this.baseURL}/Products?$top=1`);
    const products = response.data.value || response.data;
    const productID = products[0].ID;

    const result = await this.runBenchmark({
      url: `${this.baseURL}/Products(${productID})`,
      method: 'GET'
    });

    return this.analyzeResults('GET /Products({id})', result);
  }

  /**
   * Benchmark: Complex OData query
   */
  async benchmarkComplexQuery() {
    console.log('\n🔍 Benchmarking complex OData query...');

    const result = await this.runBenchmark({
      url: `${this.baseURL}/Products?$filter=isActive eq true&$orderby=price desc&$top=20`,
      method: 'GET'
    });

    return this.analyzeResults('Complex Query', result);
  }

  /**
   * Benchmark: Custom function (getLowStockProducts)
   */
  async benchmarkCustomFunction() {
    console.log('\n🔍 Benchmarking custom function getLowStockProducts...');

    const result = await this.runBenchmark({
      url: `${this.baseURL}/getLowStockProducts?threshold=50`,
      method: 'GET'
    });

    return this.analyzeResults('getLowStockProducts', result);
  }

  /**
   * Benchmark: Under load (stress test)
   */
  async benchmarkUnderLoad() {
    console.log('\n🔍 Benchmarking under load (50 connections)...');

    const result = await this.runBenchmark({
      url: `${this.baseURL}/Products?$top=10`,
      method: 'GET',
      connections: 50,
      duration: 15
    });

    return this.analyzeResults('Under Load', result);
  }

  /**
   * Analyze benchmark results against thresholds
   */
  analyzeResults(testName, result) {
    const analysis = {
      test: testName,
      passed: true,
      results: {
        throughput: result.requests.average,
        latency: {
          p50: result.latency.p50,
          p95: result.latency.p95,
          p99: result.latency.p99,
          mean: result.latency.mean,
          max: result.latency.max
        },
        requests: {
          total: result.requests.total,
          average: result.requests.average,
          sent: result.requests.sent
        },
        errors: result.errors,
        timeouts: result.timeouts,
        duration: result.duration
      },
      thresholds: {
        p50: this.thresholds.p50,
        p95: this.thresholds.p95,
        p99: this.thresholds.p99,
        errorRate: this.thresholds.errors
      },
      violations: []
    };

    // Check p50 threshold
    if (result.latency.p50 > this.thresholds.p50) {
      analysis.passed = false;
      analysis.violations.push(
        `p50 latency ${result.latency.p50}ms exceeds threshold ${this.thresholds.p50}ms`
      );
    }

    // Check p95 threshold
    if (result.latency.p95 > this.thresholds.p95) {
      analysis.passed = false;
      analysis.violations.push(
        `p95 latency ${result.latency.p95}ms exceeds threshold ${this.thresholds.p95}ms`
      );
    }

    // Check p99 threshold
    if (result.latency.p99 > this.thresholds.p99) {
      analysis.passed = false;
      analysis.violations.push(
        `p99 latency ${result.latency.p99}ms exceeds threshold ${this.thresholds.p99}ms`
      );
    }

    // Check error rate
    const errorRate = (result.errors / result.requests.total) * 100;
    if (errorRate > this.thresholds.errors) {
      analysis.passed = false;
      analysis.violations.push(
        `Error rate ${errorRate.toFixed(2)}% exceeds threshold ${this.thresholds.errors}%`
      );
    }

    // Print summary
    this.printSummary(analysis);

    return analysis;
  }

  /**
   * Print benchmark summary
   */
  printSummary(analysis) {
    console.log(`\n📊 ${analysis.test} Results:`);
    console.log(`   Throughput: ${analysis.results.throughput.toFixed(2)} req/sec`);
    console.log(`   Latency (p50): ${analysis.results.latency.p50}ms`);
    console.log(`   Latency (p95): ${analysis.results.latency.p95}ms`);
    console.log(`   Latency (p99): ${analysis.results.latency.p99}ms`);
    console.log(`   Total Requests: ${analysis.results.requests.total}`);
    console.log(`   Errors: ${analysis.results.errors}`);
    console.log(`   Timeouts: ${analysis.results.timeouts}`);

    if (analysis.passed) {
      console.log(`   ✅ PASSED - All thresholds met`);
    } else {
      console.log(`   ❌ FAILED - Threshold violations:`);
      analysis.violations.forEach(v => console.log(`      - ${v}`));
    }
  }

  /**
   * Run all benchmarks
   */
  async runAll() {
    console.log('🚀 Starting MockAI Performance Benchmarks...');
    console.log(`   Target: ${this.baseURL}`);
    console.log(`   Thresholds: p50=${this.thresholds.p50}ms, p95=${this.thresholds.p95}ms, p99=${this.thresholds.p99}ms`);

    await this.waitForService();

    const results = [];

    try {
      results.push(await this.benchmarkGetProducts());
      results.push(await this.benchmarkGetSingleProduct());
      results.push(await this.benchmarkComplexQuery());
      results.push(await this.benchmarkCustomFunction());
      results.push(await this.benchmarkUnderLoad());
    } catch (error) {
      console.error('❌ Benchmark failed:', error.message);
      throw error;
    }

    // Overall summary
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;

    console.log('\n' + '='.repeat(60));
    console.log('📈 PERFORMANCE BENCHMARK SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests}`);
    console.log(`   Failed: ${failedTests}`);
    console.log('='.repeat(60));

    if (failedTests > 0) {
      console.log('\n❌ Some benchmarks failed threshold requirements');
      process.exit(1);
    } else {
      console.log('\n✅ All benchmarks passed!');
    }

    return results;
  }
}

// Run benchmarks if executed directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  benchmark.runAll().catch(error => {
    console.error('Benchmark suite failed:', error);
    process.exit(1);
  });
}

module.exports = PerformanceBenchmark;
