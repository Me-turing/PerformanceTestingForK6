import http from 'k6/http'; // 导入 K6 的 HTTP 模块，用于发送 HTTP 请求
import { check, sleep, group } from 'k6'; // 导入检查、睡眠和分组功能
import { Counter, Rate, Trend } from 'k6/metrics'; // 导入自定义指标
import exec from 'k6/execution'; // 导入执行模块，用于获取执行上下文
import { uuidv4 } from '../static/uuid.js'; // 导入 UUID 生成器

// 自定义指标
const activeUsers = new Counter('active_users'); // 记录活跃用户数
const responseTime = new Trend('response_time'); // 记录响应时间
const requestsPerSecond = new Rate('requests_per_second'); // 记录每秒请求数
const errorRate = new Rate('error_rate'); // 记录错误率

// 负载测试配置
export const options = {
  scenarios: {
    // 持续负载场景
    constant_load: {
      executor: 'constant-vus',
      vus: 50, // 保持50个并发用户
      duration: '30m', // 持续30分钟
    },
    // 阶梯式负载场景
    ramping_load: {
      executor: 'ramping-arrival-rate',
      startRate: 10, // 每秒10个请求
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      stages: [
        { duration: '5m', target: 20 }, // 逐步增加到每秒20个请求
        { duration: '10m', target: 20 }, // 维持每秒20个请求
        { duration: '5m', target: 40 }, // 增加到每秒40个请求
        { duration: '10m', target: 40 }, // 维持每秒40个请求
        { duration: '5m', target: 0 }, // 逐步减少到0
      ],
    }
  },
  thresholds: {
    'response_time': ['p(95)<2000'], // 95%的响应时间小于2秒
    'error_rate': ['rate<0.01'], // 错误率小于1%
    'requests_per_second': ['rate>=10'], // 每秒至少处理10个请求
  }
};

export default function () {
  group('用户操作流程', function () {
    // 记录活跃用户
    activeUsers.add(1);
    
    // 1. 首页访问
    const homeResponse = http.get(`${BASE_URL}/home`, {
      tags: { name: 'home_page' }
    });
    
    // 2. 商品列表
    const productsResponse = http.get(`${BASE_URL}/products`, {
      tags: { name: 'product_list' }
    });
    
    // 3. 商品详情
    const productId = 'test_product_1';
    const productResponse = http.get(`${BASE_URL}/products/${productId}`, {
      tags: { name: 'product_detail' }
    });

    // 记录响应时间
    responseTime.add(productResponse.timings.duration);
    requestsPerSecond.add(1);

    // 检查响应
    const success = check(productResponse, {
      'status is 200': (r) => r.status === 200,
    });
    if (!success) errorRate.add(1);

    // 模拟用户思考时间
    sleep(Math.random() * 3 + 2); // 2-5秒随机思考时间
  });
}

// 测试生命周期钩子
export function setup() {
  // 初始化测试数据和环境
  return {
    startTime: new Date(), // 记录开始时间
    initialData: initializeTestData() // 初始化测试数据
  };
}

export function teardown(data) {
  // 清理测试数据并验证最终状态
  validateFinalState(); // 验证系统的最终状态
}

// 辅助函数
function initializeTestData() {
  // 初始化测试数据
  const initResponse = http.post( // 发送 POST 请求初始化数据
    'https://api.example.com/init',
    JSON.stringify({ timestamp: new Date().toISOString() }), // 发送当前时间戳
    {
      headers: { 'Content-Type': 'application/json' } // 设置请求头为 JSON
    }
  );
  return initResponse.json(); // 返回初始化响应的数据
}

function validateFinalState() {
  // 验证系统最终状态
  const finalStateResponse = http.get('https://api.example.com/system/state'); // 发送 GET 请求获取系统状态
  return check(finalStateResponse, {
    'system in consistent state': (r) => r.status === 200, // 检查系统状态是否一致
    'no pending transactions': (r) => r.json('pendingTransactions') === 0 // 检查是否没有待处理事务
  });
}

// 测试报告生成
export function handleSummary(data) {
  return {
    'concurrency_test_summary.json': JSON.stringify(data), // 生成测试摘要报告
    'concurrency_metrics.json': JSON.stringify({ // 生成性能指标报告
      consistencyErrors: data.metrics.data_consistency_errors.values, // 数据一致性错误
      deadlocks: data.metrics.deadlock_errors.values, // 死锁错误
      transactionTimes: data.metrics.transaction_times.values, // 事务响应时间
      concurrentTransactions: data.metrics.concurrent_transactions.values // 并发事务数量
    })
  };
}