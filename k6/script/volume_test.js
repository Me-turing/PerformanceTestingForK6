import http from 'k6/http'; // 导入 K6 的 HTTP 模块，用于发送 HTTP 请求
import { check, sleep } from 'k6'; // 导入检查和睡眠功能
import { Counter, Rate, Trend } from 'k6/metrics'; // 导入自定义指标模块
import { randomString } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js'; // 导入随机字符串生成函数

// 自定义指标
const dataProcessingTime = new Trend('data_processing_time'); // 数据处理时间趋势指标,用于跟踪数据处理操作的耗时
const batchProcessingSuccess = new Rate('batch_processing_success'); // 批处理成功率指标,记录批量处理操作的成功比率
const totalDataVolume = new Counter('total_data_volume'); // 总数据量计数器,统计处理的数据总量
const storageUtilization = new Trend('storage_utilization'); // 存储利用率趋势指标,监控存储空间使用情况

// 大数据批量处理测试配置
export const options = {
  scenarios: {
    // 大数据批量处理场景
    bulk_data_processing: {
      executor: 'per-vu-iterations', // 每个虚拟用户执行固定次数的迭代
      vus: 10, // 10个并发虚拟用户
      iterations: 100, // 每个虚拟用户执行100次迭代
      maxDuration: '2h' // 最长运行2小时
    },
    // 大文件上传场景
    large_file_uploads: {
      executor: 'constant-vus', // 保持固定数量的虚拟用户
      vus: 5, // 5个并发虚拟用户
      duration: '1h' // 持续运行1小时
    }
  },
  thresholds: {
    'data_processing_time': ['p(95)<10000'], // 性能阈值:95%的数据处理时间应小于10秒
    'batch_processing_success': ['rate>0.95'], // 质量阈值:批处理成功率应大于95%
    'http_req_failed': ['rate<0.01'] // 可靠性阈值:请求失败率应小于1%
  }
};

// 生成大量测试数据
function generateBulkData(size) {
  const data = [];
  for (let i = 0; i < size; i++) {
    data.push({
      id: `RECORD_${i}`, // 唯一记录标识符
      timestamp: new Date().toISOString(), // 记录创建时间戳
      data: randomString(1000), // 生成1KB的随机数据内容
      metadata: {
        type: 'test', // 数据类型标识
        version: '1.0', // 数据版本号
        checksum: randomString(32) // 32位校验和,用于数据完整性验证
      }
    });
  }
  return data;
}

// 生成大文件数据
function generateLargeFile(sizeMB) {
  return randomString(sizeMB * 1024 * 1024); // 生成指定MB大小的随机文件数据
}

export default function () {
  // 1. 批量数据处理测试
  group('批量数据处理', function () {
    const batchSize = 1000; // 设定每批处理1000条记录
    const bulkData = generateBulkData(batchSize);
    
    const startTime = new Date();
    const bulkResponse = http.post(
      'https://api.example.com/bulk-process',
      JSON.stringify(bulkData),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Batch-ID': `BATCH_${Date.now()}` // 生成唯一的批次ID
        },
        tags: { name: 'bulk_process' }, // 请求标签,用于监控和分析
        timeout: '60s' // 设置60秒超时时间
      }
    );

    const processingTime = new Date() - startTime;
    dataProcessingTime.add(processingTime); // 记录处理耗时
    
    if (check(bulkResponse, {
      'bulk processing successful': (r) => r.status === 200, // 检查HTTP状态码
      'all records processed': (r) => r.json('processed_count') === batchSize // 验证所有记录是否处理完成
    })) {
      batchProcessingSuccess.add(1); // 记录成功处理
      totalDataVolume.add(batchSize); // 更新处理数据总量
    }

    // 检查处理结果
    const verifyResponse = http.get(
      `https://api.example.com/batch-status/${bulkResponse.json('batch_id')}`
    );
    
    check(verifyResponse, {
      'batch verification successful': (r) => r.status === 200, // 验证批次状态查询是否成功
      'no processing errors': (r) => r.json('error_count') === 0 // 确认没有处理错误
    });
  });

  // 2. 大文件上传测试
  group('大文件上传', function () {
    const fileSize = 100; // 设置测试文件大小为100MB
    const fileData = generateLargeFile(fileSize);
    
    const uploadResponse = http.post(
      'https://api.example.com/file-upload',
      fileData,
      {
        headers: {
          'Content-Type': 'application/octet-stream', // 二进制流数据
          'X-File-Name': `test_file_${Date.now()}.dat` // 生成唯一文件名
        },
        tags: { name: 'file_upload' }, // 上传请求标签
        timeout: '120s' // 较长的超时时间以适应大文件上传
      }
    );

    check(uploadResponse, {
      'file upload successful': (r) => r.status === 200, // 验证上传是否成功
      'file size matches': (r) => r.json('size') === fileSize * 1024 * 1024 // 验证服务器接收的文件大小是否正确
    });

    totalDataVolume.add(fileSize); // 更新已上传的数据总量
  });

  // 3. 存储容量监控
  group('存储监控', function () {
    const storageResponse = http.get(
      'https://api.example.com/storage/metrics',
      {
        tags: { name: 'storage_check' } // 存储监控请求标签
      }
    );

    if (storageResponse.status === 200) {
      const metrics = storageResponse.json();
      storageUtilization.add(metrics.storage_used_percentage); // 记录存储使用率

      // 检查存储告警阈值
      check(metrics, {
        'storage within limits': (m) => m.storage_used_percentage < 80 // 确保存储使用率低于80%
      });
    }
  });

  // 4. 数据清理测试
  group('数据清理', function () {
    const cleanupResponse = http.post(
      'https://api.example.com/cleanup',
      JSON.stringify({
        older_than: '1h', // 清理1小时前的数据
        batch_size: 1000 // 每次清理1000条记录
      }),
      {
        headers: {
          'Content-Type': 'application/json'
        },
        tags: { name: 'data_cleanup' } // 清理操作标签
      }
    );

    check(cleanupResponse, {
      'cleanup successful': (r) => r.status === 200, // 验证清理操作是否成功
      'cleanup completed': (r) => r.json('cleanup_status') === 'completed' // 确认清理操作已完成
    });
  });

  sleep(1); // 每次迭代后暂停1秒
}

// 测试生命周期钩子
export function setup() {
  // 初始化测试环境
  const setupResponse = http.post(
    'https://api.example.com/test-setup',
    JSON.stringify({
      mode: 'volume_test', // 设置测试模式
      cleanup_policy: 'after_test' // 测试后清理策略
    })
  );

  return {
    setupId: setupResponse.json('setup_id') // 返回设置ID用于后续清理
  };
}

export function teardown(data) {
  // 清理测试数据
  http.post(
    'https://api.example.com/test-cleanup',
    JSON.stringify({
      setup_id: data.setupId // 使用setup阶段获取的ID进行清理
    })
  );
}

// 自定义报告生成
export function handleSummary(data) {
  return {
    'volume_test_summary.json': JSON.stringify(data), // 生成完整的测试摘要
    'volume_metrics.json': JSON.stringify({
      processingTimes: data.metrics.data_processing_time.values, // 处理时间指标数据
      batchSuccess: data.metrics.batch_processing_success.values, // 批处理成功率数据
      totalVolume: data.metrics.total_data_volume.values, // 总数据量统计
      storageUsage: data.metrics.storage_utilization.values // 存储使用情况数据
    })
  };
} 