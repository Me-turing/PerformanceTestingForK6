import http from 'k6/http'; // 导入 K6 的 HTTP 模块，用于发送 HTTP 请求
import { check, sleep } from 'k6'; // 导入检查和睡眠功能
import { Rate, Counter, Trend, Gauge } from 'k6/metrics'; // 导入自定义指标模块
import exec from 'k6/execution'; // 导入执行环境模块

// 自定义指标
const errorRate = new Rate('error_rate'); // 错误率指标，记录请求失败的比例
const successfulRequests = new Counter('successful_requests'); // 成功请求数指标，记录成功的请求数量
const failedRequests = new Counter('failed_requests'); // 失败请求数指标，记录失败的请求数量
const responseTime = new Trend('response_time'); // 响应时间趋势指标，记录请求的响应时间
const memoryUsage = new Gauge('memory_usage'); // 内存使用量指标，记录系统内存使用情况

// 压力测试配置
export const options = {
  // 压力测试阶段配置
  stages: [
    { duration: '2m', target: 100 },    // 预热阶段，目标用户数为100，持续2分钟
    { duration: '5m', target: 500 },    // 快速增加负载阶段，目标用户数为500，持续5分钟
    { duration: '5m', target: 1000 },   // 持续增加到极限阶段，目标用户数为1000，持续5分钟
    { duration: '5m', target: 2000 },   // 超出系统承受能力阶段，目标用户数为2000，持续5分钟
    { duration: '3m', target: 100 },    // 恢复正常阶段，目标用户数为100，持续3分钟
    { duration: '2m', target: 0 },      // 缓慢降低到零阶段，目标用户数为0，持续2分钟
  ],
  thresholds: {
    error_rate: ['rate<0.1'],           // 错误率阈值，要求错误率小于10%
    http_req_duration: ['p(95)<5000'],  // 响应时间阈值，要求95%的请求响应时间小于5000毫秒
    'successful_requests': ['count>1000'], // 成功请求数阈值，要求成功请求数大于1000
  }
};

// 请求配置
const BASE_URL = 'https://api.example.com'; // API基础URL
const headers = {
  'Content-Type': 'application/json', // 设置请求头为JSON
  'Authorization': 'Bearer your-token-here' // 设置授权头
};

export default function () {
  try {
    // 1. 高负载数据处理请求
    const heavyPayload = generateLargePayload(); // 生成大量数据
    const processResponse = http.post(
      `${BASE_URL}/process-data`, 
      JSON.stringify(heavyPayload), // 将数据转换为JSON字符串
      {
        headers: headers, // 使用预定义的请求头
        timeout: '10s', // 较长的超时时间
        tags: { name: 'heavy_process' } // 添加标签以便于分析
      }
    );

    // 记录响应时间
    responseTime.add(processResponse.timings.duration); // 记录请求的响应时间

    check(processResponse, {
      'heavy process successful': (r) => r.status === 200, // 检查请求是否成功
    }) ? successfulRequests.add(1) : failedRequests.add(1); // 根据请求结果更新成功或失败计数

    // 2. 并发数据库操作
    const dbOperations = []; // 存储数据库操作请求
    for (let i = 0; i < 5; i++) {
      dbOperations.push(
        http.post(
          `${BASE_URL}/db-operation`, // 数据库操作的API端点
          JSON.stringify({ operation: `batch_${i}` }), // 生成批量操作数据
          { headers: headers, tags: { name: 'db_operation' } } // 添加标签以便于分析
        )
      );
    }

    // 批量发送请求
    const responses = http.batch(dbOperations); // 批量发送数据库操作请求
    responses.forEach(response => {
      check(response, {
        'db operation successful': (r) => r.status === 200, // 检查每个数据库操作请求是否成功
      }) ? successfulRequests.add(1) : failedRequests.add(1); // 更新成功或失败计数
    });

    // 3. 资源密集型计算
    const computeResponse = http.post(
      `${BASE_URL}/compute`, // 计算操作的API端点
      JSON.stringify({ complexity: 'high' }), // 发送高复杂度计算请求
      { headers: headers, tags: { name: 'compute_intensive' } } // 添加标签以便于分析
    );

    check(computeResponse, {
      'compute operation successful': (r) => r.status === 200, // 检查计算操作请求是否成功
    }) ? successfulRequests.add(1) : failedRequests.add(1); // 更新成功或失败计数

    // 4. 模拟文件上传
    const fileData = generateLargeFile(); // 生成大文件数据
    const uploadResponse = http.post(
      `${BASE_URL}/upload`, // 文件上传的API端点
      fileData, // 发送文件数据
      {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data' // 设置请求头为多部分表单数据
        },
        tags: { name: 'file_upload' } // 添加标签以便于分析
      }
    );

    check(uploadResponse, {
      'file upload successful': (r) => r.status === 200, // 检查文件上传请求是否成功
    }) ? successfulRequests.add(1) : failedRequests.add(1); // 更新成功或失败计数

  } catch (e) {
    console.error(`Error in iteration: ${e.message}`); // 记录错误信息
    errorRate.add(1); // 增加错误计数
    failedRequests.add(1); // 增加失败请求计数
  }

  // 动态调整休眠时间，随着VU数增加减少休眠时间
  const sleepTime = Math.max(0.1, 1 - (exec.vu.idInTest / 1000)); // 计算休眠时间
  sleep(sleepTime); // 休眠指定时间
}

// 辅助函数：生成大量测试数据
function generateLargePayload() {
  const payload = {
    data: [], // 存储数据的数组
    timestamp: Date.now(), // 当前时间戳
    requestId: Math.random().toString(36) // 生成唯一请求ID
  };

  for (let i = 0; i < 100; i++) {
    payload.data.push({
      id: i, // 数据项ID
      value: Math.random().toString(36).substring(7), // 随机生成数据值
      nested: {
        field1: Math.random(), // 嵌套字段1
        field2: new Array(50).fill(Math.random()) // 嵌套字段2，生成随机数组
      }
    });
  }

  return payload; // 返回生成的数据
}

// 测试生命周期钩子
export function setup() {
  // 初始化测试数据和环境
  console.log('Stress test starting - preparing test environment'); // 输出测试开始信息
  return { startTime: new Date() }; // 返回开始时间
}

export function teardown(data) {
  // 清理测试数据和环境
  console.log(`Stress test completed. Duration: ${new Date() - data.startTime}ms`); // 输出测试完成信息和持续时间
}

// 自定义报告生成
export function handleSummary(data) {
  return {
    'stress_test_summary.json': JSON.stringify(data), // 生成测试摘要报告
    'stress_test_metrics.json': JSON.stringify({
      errorRate: data.metrics.error_rate.values, // 错误率数据
      successfulRequests: data.metrics.successful_requests.values, // 成功请求数数据
      failedRequests: data.metrics.failed_requests.values, // 失败请求数数据
      responseTimeTrend: data.metrics.response_time.values // 响应时间趋势数据
    })
  };
} 