import http from 'k6/http'; // 导入 K6 的 HTTP 模块，用于发送 HTTP 请求
import { check, sleep } from 'k6'; // 导入检查和睡眠功能
import { Rate, Gauge, Trend } from 'k6/metrics'; // 导入自定义指标模块
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js'; // 导入随机数生成工具

// 自定义指标
const errorRate = new Rate('error_rate'); // 错误率指标，记录请求失败的比例
const memoryUsage = new Gauge('memory_usage'); // 内存使用量指标，记录系统内存使用情况
const responseTimeTrend = new Trend('response_time_trend'); // 响应时间趋势，记录请求的响应时间
const successfulTransactions = new Rate('successful_transactions'); // 成功事务率，记录成功事务的比例

// 稳定性测试配置
export const options = {
  // 稳定性测试配置 - 通常运行24小时或更长
  scenarios: {
    constant_load: {
      executor: 'constant-vus', // 使用固定数量的虚拟用户
      vus: 50,              // 保持稳定的用户数
      duration: '24h',      // 持续24小时
      gracefulStop: '5m',   // 优雅停止时间
    },
  },
  thresholds: {
    error_rate: ['rate<0.01'],              // 错误率低于1%
    http_req_duration: ['p(95)<2000'],      // 95%请求在2秒内完成
    successful_transactions: ['rate>0.95'],  // 事务成功率高于95%
    'response_time_trend': ['avg<1000'],    // 平均响应时间小于1秒
  }
};

// 全局变量和计数器
let iterationCounter = 0; // 迭代计数器
const MEMORY_CHECK_INTERVAL = 100; // 每100次迭代检查一次内存

// 请求配置
const BASE_URL = 'https://api.example.com'; // API基础URL
const headers = {
  'Content-Type': 'application/json', // 设置请求头为JSON
  'Authorization': 'Bearer your-token-here' // 设置授权头
};

export default function () {
  // 增加迭代计数
  iterationCounter++; 
  const startTime = new Date(); // 记录开始时间
  
  try {
    // 1. 用户会话管理
    const sessionResponse = http.post(`${BASE_URL}/session`, {
      headers: headers,
      tags: { name: 'session_check' } // 添加标签以便于分析
    });

    check(sessionResponse, {
      'session valid': (r) => r.status === 200, // 验证会话是否有效
    });

    // 2. 数据查询操作
    const queryResponse = http.get(`${BASE_URL}/data`, {
      headers: headers,
      tags: { name: 'data_query' } // 添加标签以便于分析
    });

    check(queryResponse, {
      'query successful': (r) => r.status === 200, // 验证查询是否成功
      'data integrity': (r) => r.json('data') !== undefined, // 验证数据完整性
    });

    // 3. 数据写入操作
    const writePayload = JSON.stringify({
      timestamp: new Date().toISOString(), // 当前时间戳
      data: `test_data_${iterationCounter}`, // 测试数据
      metadata: {
        iteration: iterationCounter,
        type: 'stability_test' // 指定数据类型
      }
    });

    const writeResponse = http.post(
      `${BASE_URL}/data`,
      writePayload,
      {
        headers: headers,
        tags: { name: 'data_write' } // 添加标签以便于分析
      }
    );

    check(writeResponse, {
      'write successful': (r) => r.status === 201, // 验证写入是否成功
    });

    // 4. 缓存操作测试
    const cacheResponse = http.get(`${BASE_URL}/cached-data`, {
      headers: {
        ...headers,
        'Cache-Control': 'no-cache' // 禁用缓存
      },
      tags: { name: 'cache_operation' } // 添加标签以便于分析
    });

    check(cacheResponse, {
      'cache operation successful': (r) => r.status === 200, // 验证缓存操作是否成功
    });

    // 记录事务成功
    successfulTransactions.add(1); // 增加成功事务计数

    // 记录响应时间
    const endTime = new Date();
    responseTimeTrend.add(endTime - startTime); // 添加响应时间到趋势指标

    // 定期检查内存使用情况
    if (iterationCounter % MEMORY_CHECK_INTERVAL === 0) {
      const memCheckResponse = http.get(`${BASE_URL}/system/metrics`, {
        headers: headers,
        tags: { name: 'memory_check' } // 添加标签以便于分析
      });
      
      if (memCheckResponse.status === 200) {
        const metrics = memCheckResponse.json();
        memoryUsage.add(metrics.memoryUsage); // 记录内存使用量
      }
    }

  } catch (e) {
    console.error(`Error in iteration ${iterationCounter}: ${e.message}`); // 记录错误信息
    errorRate.add(1); // 增加错误计数
  }

  // 动态休眠时间，模拟真实用户行为
  sleep(randomIntBetween(1, 5)); // 随机休眠1-5秒
}

// 测试生命周期钩子
export function setup() {
  // 初始化测试环境和数据
  console.log('Starting stability test...'); // 输出测试开始信息
  return {
    startTime: new Date(), // 记录测试开始时间
    testData: generateTestData() // 生成测试数据
  };
}

export function teardown(data) {
  // 清理测试数据和记录测试时长
  const duration = new Date() - data.startTime;
  console.log(`Stability test completed. Total duration: ${duration}ms`); // 输出测试完成信息
}

// 监控检查函数
export function checkMemoryLeak() {
  const memoryMetrics = memoryUsage.values;
  const threshold = 1000000000; // 1GB内存阈值
  
  if (memoryMetrics.avg > threshold) {
    console.warn('Potential memory leak detected!'); // 检测到潜在内存泄漏时发出警告
  }
}

// 测试数据生成
function generateTestData() {
  const testData = [];
  for (let i = 0; i < 1000; i++) {
    testData.push({
      id: `test_${i}`, // 生成测试ID
      value: Math.random().toString(36) // 生成随机值
    });
  }
  return testData;
}

// 自定义报告生成
export function handleSummary(data) {
  return {
    'stability_test_summary.json': JSON.stringify(data), // 生成测试摘要报告
    'stability_metrics.json': JSON.stringify({
      errorRate: data.metrics.error_rate.values, // 错误率数据
      memoryUsage: data.metrics.memory_usage.values, // 内存使用数据
      responseTimeTrend: data.metrics.response_time_trend.values, // 响应时间数据
      successRate: data.metrics.successful_transactions.values // 成功率数据
    }),
    'stability_test_report.html': generateHtmlReport(data) // 生成HTML格式报告
  };
} 