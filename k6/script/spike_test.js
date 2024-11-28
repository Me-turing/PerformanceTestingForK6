import http from 'k6/http'; // 导入 K6 的 HTTP 模块，用于发送 HTTP 请求
import { check, sleep } from 'k6'; // 导入检查和睡眠功能
import { Rate, Trend } from 'k6/metrics'; // 导入自定义指标模块

// 自定义指标
const successRate = new Rate('success_rate'); // 成功率指标，记录成功请求的比例
const responseTimeTrend = new Trend('response_time_trend'); // 响应时间趋势，记录请求的响应时间
const errorRate = new Rate('error_rate'); // 错误率指标，记录请求失败的比例

// 突发测试配置
export const options = {
  stages: [
    { duration: '10s', target: 10 },   // 逐步增加到10个用户，持续10s
    { duration: '20s', target: 100 },  // 突然增加到100个用户，持续20s
    { duration: '10s', target: 10 },   // 突然减少到10个用户，持续10s
    { duration: '10s', target: 0 },    // 最终减少到0个用户，持续30s
  ],
  // thresholds: {
  //   success_rate: ['rate>0.95'],      // 成功率大于95%
  //   error_rate: ['rate<0.05'],        // 错误率小于5%
  //   http_req_duration: ['p(95)<2000'], // 95%的请求响应时间小于2秒
  // }
};


// 请求配置
const BASE_URL = 'https://api.example.com/init'; // 基础 URL

const headers = {
  'accept': '*/*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'proxy-connection': 'keep-alive',
};

export default function () {
  // // 1. 用户登录
  // const loginPayload = JSON.stringify({ // 构建登录请求的负载
  //   username: `user_${__VU}@example.com`, // 使用虚拟用户 ID 生成用户名
  //   password: 'password123' // 固定密码
  // });

  // const loginResponse = http.post(`${BASE_URL}/login`, loginPayload, { // 发送登录请求
  //   headers: headers, // 使用预定义的请求头
  //   tags: { name: 'user_login' } // 添加标签以便于后续分析
  // });

  // check(loginResponse, { // 检查登录响应
  //   'login successful': (r) => r.status === 200, // 验证登录是否成功
  // }) ? successRate.add(1) : errorRate.add(1); // 根据响应结果更新成功率或错误率

  // 2. 查询数据
  const dataResponse = http.get(`${BASE_URL}`, { // 发送 GET 请求查询数据
    headers: headers, // 使用预定义的请求头
    tags: { name: 'data_query' } // 添加标签
  });

  check(dataResponse, { // 检查数据查询响应
    'data query successful': (r) => r.status === 200, // 验证数据查询是否成功
    'data integrity': (r) => r.json('data') !== undefined, // 验证返回的数据是否存在
  }) ? successRate.add(1) : errorRate.add(1); // 根据响应结果更新成功率或错误率

  // // 3. 创建订单
  // const orderPayload = JSON.stringify({ // 构建创建订单请求的负载
  //   productId: 'prod_123', // 产品 ID
  //   quantity: Math.floor(Math.random() * 10) + 1, // 随机生成购买数量
  //   address: '测试地址' // 固定地址
  // });

  // const orderResponse = http.post(`${BASE_URL}/orders`, orderPayload, { // 发送创建订单请求
  //   headers: headers, // 使用预定义的请求头
  //   tags: { name: 'create_order' } // 添加标签
  // });

  // check(orderResponse, { // 检查订单创建响应
  //   'order created': (r) => r.status === 201, // 验证订单是否成功创建
  //   'order id exists': (r) => r.json('orderId') !== undefined, // 验证返回的订单 ID 是否存在
  // }) ? successRate.add(1) : errorRate.add(1); // 根据响应结果更新成功率或错误率

  // // 记录响应时间
  // responseTimeTrend.add(orderResponse.timings.duration); // 将订单创建的响应时间添加到趋势指标中

  // // 4. 查询订单状态
  // const orderId = orderResponse.json('orderId'); // 获取刚创建的订单 ID
  // const orderStatusResponse = http.get(`${BASE_URL}/orders/${orderId}`, { // 发送 GET 请求查询订单状态
  //   headers: headers, // 使用预定义的请求头
  //   tags: { name: 'check_order' } // 添加标签
  // });

  // check(orderStatusResponse, { // 检查订单状态查询响应
  //   'order status check successful': (r) => r.status === 200, // 验证查询是否成功
  //   'order status is processing': (r) => r.json('status') === 'processing', // 验证订单状态是否为“处理中”
  // }) ? successRate.add(1) : errorRate.add(1); // 根据响应结果更新成功率或错误率

  // 随机休眠时间，模拟真实用户行为
  sleep(Math.random() * 2); // 随机休眠0到2秒，模拟用户在操作之间的行为
}

// 测试生命周期钩子
export function setup() {
  // 初始化测试环境
  console.log('Starting spike test...'); // 输出测试开始信息
}

export function teardown(data) {
  // 清理测试数据
  console.log('Spike test completed.'); // 输出测试完成信息
}

// 自定义报告生成
export function handleSummary(data) {
  return {
    'spike_test_summary.json': JSON.stringify(data), // 生成测试摘要报告
    // 'spike_metrics.json': JSON.stringify({ // 生成性能指标报告
    //   successRate: data.metrics.success_rate.values, // 成功率数据
    //   errorRate: data.metrics.error_rate.values, // 错误率数据
    //   responseTimes: data.metrics.response_time_trend.values // 响应时间数据
    // })
  };
}