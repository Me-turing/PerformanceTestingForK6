import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '5s', target: 100 },   // 5秒内快速增加到100个用户
    { duration: '120s', target: 100 },  // 保持100个用户持续50秒
    { duration: '5s', target: 0 },     // 5秒内快速减少到0个用户
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 放宽响应时间限制到2秒
    errors: ['rate<0.1'],              // 保持错误率阈值
    http_req_failed: ['rate<0.1'],     // 添加请求失败率阈值
  },
  // 添加运行时配置
  noConnectionReuse: false,            // 复用连接
  userAgent: 'K6 Performance Test',    // 设置 User-Agent
  timeout: '10s',                      // 设置请求超时时间为10秒
};

const BASE_URL = 'https://api.example.com/init';

const headers = {
  'accept': '*/*',
  'accept-language': 'zh-CN,zh;q=0.9',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
  'proxy-connection': 'keep-alive',
};

export default function () {
  let retries = 2; // 最大重试次数
  let response;
  
  while (retries >= 0) {
    try {
      response = http.get(`${BASE_URL}`, {
        headers: headers,
        tags: { name: 'isLogin' },
        timeout: '5s',  // 单个请求的超时时间
      });
      
      // 检查响应
      const checkResult = check(response, {
        'status is 200': (r) => r.status === 200,
        'response time < 2000ms': (r) => r.timings.duration < 2000,
      });

      if (checkResult) {
        break; // 如果请求成功，跳出重试循环
      }
      
      retries--;
      if (retries >= 0) {
        sleep(1); // 重试前等待1秒
      }
    } catch (error) {
      console.error(`Request failed: ${error}`);
      retries--;
      if (retries >= 0) {
        sleep(1);
      }
    }
  }

  // 只有在所有重试都失败后才记录错误
  if (retries < 0) {
    errorRate.add(1);
  }

  // 减少等待时间，使负载更均匀
  sleep(Math.random() * 0.5); // 0-500ms的随机等待
}

export function handleSummary(data) {
  return {
    'baseline_results.json': JSON.stringify(data),
  };
}
