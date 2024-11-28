import http from 'k6/http'; // 导入 K6 的 HTTP 模块，用于发送 HTTP 请求
import { check, sleep, group } from 'k6'; // 导入检查、睡眠和分组功能
import { Counter, Rate, Trend } from 'k6/metrics'; // 导入自定义指标
import exec from 'k6/execution'; // 导入执行模块
import { uuidv4 } from '../static/uuid.js'; // 导入 UUID 生成器

// 自定义指标
const concurrentTransactions = new Counter('concurrent_transactions'); // 计数器，记录并发事务数量
const dataConsistencyErrors = new Rate('data_consistency_errors'); // 比率，记录数据一致性错误发生率
const transactionTimes = new Trend('transaction_times'); // 趋势，记录事务响应时间
const deadlockErrors = new Counter('deadlock_errors'); // 计数器，记录死锁错误数量
const resourceContentions = new Counter('resource_contentions'); // 新增：资源争用计数器

// 并发测试配置
export const options = {
  scenarios: {
    // 数据竞争场景
    data_race: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 }, // 快速增加到100用户
        { duration: '1m', target: 50 }, // 维持高并发
        { duration: '30s', target: 0 }, // 快速减少
      ],
    },
    // // 资源锁竞争场景
    // resource_lock: {
    //   executor: 'constant-vus',
    //   vus: 50,
    //   duration: '2m',
    // }
  },
  // thresholds: {
  //   'data_consistency_errors': ['rate<0.01'], // 数据一致性错误率小于1%
  //   'deadlock_errors': ['count<5'], // 死锁错误少于5次
  //   'resource_contentions': ['count<50'], // 资源争用次数少于50次
  // }
};

// 共享资源状态模拟
const sharedResource = {
  lastAccess: new Date(), // 记录最后访问时间
  accessCount: 0 // 记录访问次数
};

// 默认导出函数，执行主要的测试逻辑
export default function () {
  const sessionId = uuidv4(); // 生成唯一的会话 ID
  
  group('并发数据操作', function () {
    // 1. 并发读写测试
    try {
      // 读取数据
      const readResponse = http.get(`${BASE_URL}/data/${sessionId}`);
      if (readResponse.status === 200) {
        const data = readResponse.json();
        
        // 模拟数据处理
        data.value = Math.random();
        
        // 并发写入
        const writeResponse = http.put(
          `${BASE_URL}/data/${sessionId}`,
          JSON.stringify(data),
          { headers: { 'Content-Type': 'application/json' } }
        );
        
        // 验证写入
        const verifyResponse = http.get(`${BASE_URL}/data/${sessionId}`);
        if (verifyResponse.json('value') !== data.value) {
          dataConsistencyErrors.add(1);
        }
      }
    } catch (err) {
      deadlockErrors.add(1);
    }

    // 2. 资源锁测试
    try {
      const lockResponse = http.post(`${BASE_URL}/lock`, {
        headers: { 'X-Session-ID': sessionId }
      });
      
      if (lockResponse.status === 409) { // 资源已被锁定
        resourceContentions.add(1);
      }
      
      sleep(0.1); // 持有锁0.1秒
      
      http.delete(`${BASE_URL}/lock`, {
        headers: { 'X-Session-ID': sessionId }
      });
    } catch (err) {
      console.error(`Lock error: ${err.message}`);
    }
  });

  // 较短的随机休眠，保持高并发压力
  sleep(Math.random() * 0.3);
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
      concurrentTransactions: data.metrics.concurrent_transactions.values, // 并发事务数量
      resourceContentions: data.metrics.resource_contentions.values // 资源争用次数
    })
  };
}