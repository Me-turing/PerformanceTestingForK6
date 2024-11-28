#!/bin/bash

# 首先定义所有函数
calculate_disk_io() {
    # 使用bc进行浮点数计算，提高精度
    if [ "$SECTORS_READ_2" -lt "$SECTORS_READ_1" ]; then
        DISK_READ=$(echo "scale=2; ($SECTORS_READ_2 + 4294967295 - $SECTORS_READ_1) * 512 / $INTERVAL" | bc)
    else
        DISK_READ=$(echo "scale=2; ($SECTORS_READ_2 - $SECTORS_READ_1) * 512 / $INTERVAL" | bc)
    fi
    DISK_READ=$(echo "scale=2; $DISK_READ" | bc | awk '{printf "%.2f", $0}')
}

collect_metrics() {
    TIMESTAMP=$(date +%s%3N)
    
    # 验证必要的文件是否存在
    for file in /proc/stat /proc/loadavg /proc/meminfo /proc/diskstats; do
        if [ ! -f "$file" ]; then
            echo "错误: 找不到必要的系统文件 $file" >&2
            exit 1
        fi
    done
    
    # 获取系统负载
    LOAD_1MIN=$(cut -d ' ' -f1 /proc/loadavg)
    LOAD_5MIN=$(cut -d ' ' -f2 /proc/loadavg)
    LOAD_15MIN=$(cut -d ' ' -f3 /proc/loadavg)

    # 确保负载值格式正确
    LOAD_1MIN=$(echo "scale=2; $LOAD_1MIN" | bc | awk '{printf "%.2f", $0}')
    LOAD_5MIN=$(echo "scale=2; $LOAD_5MIN" | bc | awk '{printf "%.2f", $0}')
    LOAD_15MIN=$(echo "scale=2; $LOAD_15MIN" | bc | awk '{printf "%.2f", $0}')

    # CPU使用率计算优化
    CPU_STATS_1=$(grep '^cpu ' /proc/stat)
    DISK_STATS_1=$(cat /proc/diskstats | grep -w "sda\|vda" | head -n 1)
    NETWORK_STATS_1=$(cat /proc/net/dev | grep -w "eth0\|ens3" | head -n 1)
    
    sleep $INTERVAL
    
    CPU_STATS_2=$(grep '^cpu ' /proc/stat)
    DISK_STATS_2=$(cat /proc/diskstats | grep -w "sda\|vda" | head -n 1)
    NETWORK_STATS_2=$(cat /proc/net/dev | grep -w "eth0\|ens3" | head -n 1)
    
    # CPU使用率精确计算
    CPU_USER_1=$(echo "$CPU_STATS_1" | awk '{print $2}')
    CPU_NICE_1=$(echo "$CPU_STATS_1" | awk '{print $3}')
    CPU_SYSTEM_1=$(echo "$CPU_STATS_1" | awk '{print $4}')
    CPU_IDLE_1=$(echo "$CPU_STATS_1" | awk '{print $5}')
    CPU_IOWAIT_1=$(echo "$CPU_STATS_1" | awk '{print $6}')
    CPU_IRQ_1=$(echo "$CPU_STATS_1" | awk '{print $7}')
    CPU_SOFTIRQ_1=$(echo "$CPU_STATS_1" | awk '{print $8}')
    CPU_STEAL_1=$(echo "$CPU_STATS_1" | awk '{print $9}')
    
    CPU_USER_2=$(echo "$CPU_STATS_2" | awk '{print $2}')
    CPU_NICE_2=$(echo "$CPU_STATS_2" | awk '{print $3}')
    CPU_SYSTEM_2=$(echo "$CPU_STATS_2" | awk '{print $4}')
    CPU_IDLE_2=$(echo "$CPU_STATS_2" | awk '{print $5}')
    CPU_IOWAIT_2=$(echo "$CPU_STATS_2" | awk '{print $6}')
    CPU_IRQ_2=$(echo "$CPU_STATS_2" | awk '{print $7}')
    CPU_SOFTIRQ_2=$(echo "$CPU_STATS_2" | awk '{print $8}')
    CPU_STEAL_2=$(echo "$CPU_STATS_2" | awk '{print $9}')
    
    # 计算总差值
    TOTAL_1=$((CPU_USER_1 + CPU_NICE_1 + CPU_SYSTEM_1 + CPU_IDLE_1 + CPU_IOWAIT_1))
    TOTAL_2=$((CPU_USER_2 + CPU_NICE_2 + CPU_SYSTEM_2 + CPU_IDLE_2 + CPU_IOWAIT_2))
    
    TOTAL_DIFF=$((TOTAL_2 - TOTAL_1))
    IDLE_DIFF=$((CPU_IDLE_2 - CPU_IDLE_1))
    IOWAIT_DIFF=$((CPU_IOWAIT_2 - CPU_IOWAIT_1))
    
    # 使用bc计算精确的CPU使用率
    CPU_USAGE=$(echo "scale=2; 100 * (1 - ($IDLE_DIFF + $IOWAIT_DIFF) / $TOTAL_DIFF)" | bc)
    IO_WAIT=$(echo "scale=2; 100 * ($IOWAIT_DIFF / $TOTAL_DIFF)" | bc)
    
    # 内存使用率精确计算
    TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    FREE_MEM=$(grep MemFree /proc/meminfo | awk '{print $2}')
    BUFFERS=$(grep Buffers /proc/meminfo | awk '{print $2}')
    CACHED=$(grep "^Cached:" /proc/meminfo | awk '{print $2}')
    SRECLAIMABLE=$(grep SReclaimable /proc/meminfo | awk '{print $2}')
    
    # 计算实际使用的内存
    USED_MEM=$((TOTAL_MEM - FREE_MEM - BUFFERS - CACHED - SRECLAIMABLE))
    MEM_USAGE=$(echo "scale=2; 100 * $USED_MEM / $TOTAL_MEM" | bc)
    
    # 确保变量初始化
    SECTORS_READ_1=0
    SECTORS_READ_2=0
    SECTORS_WRITE_1=0
    SECTORS_WRITE_2=0
    READ_IO_1=0
    READ_IO_2=0
    WRITE_IO_1=0
    WRITE_IO_2=0

    # 添加调试信息
    # echo "DEBUG: DISK_STATS_1=$DISK_STATS_1"
    # echo "DEBUG: DISK_STATS_2=$DISK_STATS_2"

    # 磁盘IO计算优化
    if [ -n "$DISK_STATS_1" ] && [ -n "$DISK_STATS_2" ]; then
        # 扇区读写数
        SECTORS_READ_1=$(echo "$DISK_STATS_1" | awk '{print $6}')
        SECTORS_READ_2=$(echo "$DISK_STATS_2" | awk '{print $6}')
        SECTORS_WRITE_1=$(echo "$DISK_STATS_1" | awk '{print $10}')
        SECTORS_WRITE_2=$(echo "$DISK_STATS_2" | awk '{print $10}')
        
        # 计算读写速率（bytes/s）
        DISK_READ=$(echo "scale=2; ($SECTORS_READ_2 - $SECTORS_READ_1) * 512 / $INTERVAL" | bc)
        DISK_WRITE=$(echo "scale=2; ($SECTORS_WRITE_2 - $SECTORS_WRITE_1) * 512 / $INTERVAL" | bc)
        
        # 确保格式化
        DISK_READ=$(echo "scale=2; $DISK_READ" | bc | awk '{printf "%.2f", $0}')
        DISK_WRITE=$(echo "scale=2; $DISK_WRITE" | bc | awk '{printf "%.2f", $0}')
        
        # 计算IOPS
        READ_IO_1=$(echo "$DISK_STATS_1" | awk '{print $4}')
        READ_IO_2=$(echo "$DISK_STATS_2" | awk '{print $4}')
        WRITE_IO_1=$(echo "$DISK_STATS_1" | awk '{print $8}')
        WRITE_IO_2=$(echo "$DISK_STATS_2" | awk '{print $8}')
        
        READ_IOPS=$(( (READ_IO_2 - READ_IO_1) / INTERVAL ))
        WRITE_IOPS=$(( (WRITE_IO_2 - WRITE_IO_1) / INTERVAL ))
        
        # IO使用率
        TICKS_1=$(echo "$DISK_STATS_1" | awk '{print $13}')
        TICKS_2=$(echo "$DISK_STATS_2" | awk '{print $13}')
        IO_TICKS_DIFF=$((TICKS_2 - TICKS_1))
        IO_UTIL=$(echo "scale=2; 100 * $IO_TICKS_DIFF / ($INTERVAL * 1000)" | bc)
        
        # 平均队列长度
        AVG_QUEUE_SIZE=$(echo "scale=2; $(echo "$DISK_STATS_2" | awk '{print $14}')/1000" | bc)
        
        # 平均请求大小
        if [ "$READ_IO_2" -gt "$READ_IO_1" ] || [ "$WRITE_IO_2" -gt "$WRITE_IO_1" ]; then
            AVG_REQUEST_SIZE=$(echo "scale=2; (($SECTORS_READ_2 - $SECTORS_READ_1) + ($SECTORS_WRITE_2 - $SECTORS_WRITE_1)) * 512 / (($READ_IO_2 - $READ_IO_1) + ($WRITE_IO_2 - $WRITE_IO_1))" | bc)
        else
            AVG_REQUEST_SIZE="0.00"
        fi
    fi
    
    # 网络流量计算优化
    if [ -n "$NETWORK_STATS_1" ] && [ -n "$NETWORK_STATS_2" ]; then
        BYTES_IN_1=$(echo "$NETWORK_STATS_1" | awk '{print $2}')
        BYTES_IN_2=$(echo "$NETWORK_STATS_2" | awk '{print $2}')
        BYTES_OUT_1=$(echo "$NETWORK_STATS_1" | awk '{print $10}')
        BYTES_OUT_2=$(echo "$NETWORK_STATS_2" | awk '{print $10}')
        
        if [ "$BYTES_IN_2" -lt "$BYTES_IN_1" ]; then
            NET_IN=$(echo "($BYTES_IN_2 + 4294967295 - $BYTES_IN_1) / $INTERVAL" | bc)
        else
            NET_IN=$(( (BYTES_IN_2 - BYTES_IN_1) / INTERVAL ))
        fi
        
        if [ "$BYTES_OUT_2" -lt "$BYTES_OUT_1" ]; then
            NET_OUT=$(echo "($BYTES_OUT_2 + 4294967295 - $BYTES_OUT_1) / $INTERVAL" | bc)
        else
            NET_OUT=$(( (BYTES_OUT_2 - BYTES_OUT_1) / INTERVAL ))
        fi
    fi
    
    # TCP连接状态优化
    TCP_STATS=$(netstat -n | awk '/^tcp/ {++state[$NF]} END {for(key in state) print key,"\t",state[key]}')
    TCP_ESTAB=$(echo "$TCP_STATS" | awk '/ESTABLISHED/ {print $2}')
    TCP_TIME_WAIT=$(echo "$TCP_STATS" | awk '/TIME_WAIT/ {print $2}')
    TCP_TOTAL=$(echo "$TCP_STATS" | awk '{total += $2} END {print total}')
    
    # 设置默认值
    : ${TCP_ESTAB:=0}
    : ${TCP_TIME_WAIT:=0}
    : ${TCP_TOTAL:=0}
    
    # 确保所有浮点数格式正确
    IO_UTIL=$(echo "scale=2; $IO_UTIL" | bc | awk '{printf "%.2f", $0}')
    DISK_READ=$(echo "scale=2; $DISK_READ" | bc | awk '{printf "%.2f", $0}')
    DISK_WRITE=$(echo "scale=2; $DISK_WRITE" | bc | awk '{printf "%.2f", $0}')
    CPU_USAGE=$(echo "scale=2; $CPU_USAGE" | bc | awk '{printf "%.2f", $0}')
    IO_WAIT=$(echo "scale=2; $IO_WAIT" | bc | awk '{printf "%.2f", $0}')
    MEM_USAGE=$(echo "scale=2; $MEM_USAGE" | bc | awk '{printf "%.2f", $0}')
    AVG_QUEUE_SIZE=$(echo "scale=2; $AVG_QUEUE_SIZE" | bc | awk '{printf "%.2f", $0}')
    AVG_REQUEST_SIZE=$(echo "scale=2; $AVG_REQUEST_SIZE" | bc | awk '{printf "%.2f", $0}')

    # 输出JSON格式数据
    echo "    {
        \"timestamp\": $TIMESTAMP,
        \"cpu\": {
            \"cores\": $CPU_CORES,
            \"usage\": ${CPU_USAGE:-0.00},
            \"io_wait\": ${IO_WAIT:-0.00}
        },
        \"memory\": {
            \"usage\": ${MEM_USAGE:-0.00},
            \"total_mb\": $((TOTAL_MEM/1024)),
            \"used_mb\": $((USED_MEM/1024))
        },
        \"load\": {
            \"1min\": ${LOAD_1MIN:-0.00},
            \"5min\": ${LOAD_5MIN:-0.00},
            \"15min\": ${LOAD_15MIN:-0.00},
            \"cores\": $CPU_CORES
        },
        \"network\": {
            \"in_bytes\": ${NET_IN:-0},
            \"out_bytes\": ${NET_OUT:-0}
        },
        \"disk\": {
            \"usage_percent\": ${DISK_USAGE:-0},
            \"read_bytes\": ${DISK_READ:-0.00},
            \"write_bytes\": ${DISK_WRITE:-0.00},
            \"io_util\": ${IO_UTIL:-0.00},
            \"read_iops\": ${READ_IOPS:-0},
            \"write_iops\": ${WRITE_IOPS:-0},
            \"avg_queue_size\": ${AVG_QUEUE_SIZE:-0.00},
            \"avg_request_size\": ${AVG_REQUEST_SIZE:-0.00}
        },
        \"tcp\": {
            \"total\": ${TCP_TOTAL:-0},
            \"established\": ${TCP_ESTAB:-0},
            \"time_wait\": ${TCP_TIME_WAIT:-0}
        }
    }," >> $OUTPUT_FILE
}

# 主程序开始
SERVER_ID=$1
DURATION=$2
INTERVAL=1
OUTPUT_FILE="metrics_${SERVER_ID}.json"

# 获取CPU核心数
CPU_CORES=$(nproc)

# 设置开始和结束时间
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))

# 初始化JSON文件
echo '{
    "server_id": "'$SERVER_ID'",
    "metrics":[' > $OUTPUT_FILE

# 主循环
while [ $(date +%s) -lt $END_TIME ]; do
    collect_metrics
done

# 修复JSON文件结尾
sed -i '$ s/,$//' $OUTPUT_FILE
echo ']}' >> $OUTPUT_FILE 