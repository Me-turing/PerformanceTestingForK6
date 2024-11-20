# PerformanceTestingForK6
快速生成测试的K6脚本,并对执行结果进行可视化展示

## 生成脚本

简单的配置脚本测试方式

![image-20241120142205669](./assets/image-20241120142205669.png)

点击生成脚本后 会生成对应的脚本

![image-20241120142300515](./assets/image-20241120142300515.png)

将脚本移动到K6文件下

![image-20241120142346441](./assets/image-20241120142346441.png)

执行命令 `k6.exe run 脚本名称.js --out json=output.json --console-output=response.log`

![image-20241120142458467](./assets/image-20241120142458467.png)

测试完成后生成两个文件

![image-20241120142622825](./assets/image-20241120142622825.png)

`output.json`  存储的是测试结果

`response.log`  存储的是请求响应数据

## 分析结果

![image-20241120142735188](./assets/image-20241120142735188.png)

选择刚刚输出的数据

![image-20241120142721294](./assets/image-20241120142721294.png)

点击分析结果

![image-20241120142915260](./assets/image-20241120142915260.png)
