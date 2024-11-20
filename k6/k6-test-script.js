import http from 'k6/http';
import { check } from 'k6';

export let options = {
    vus: 10,
    duration: '100s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01']
    }
};

export default function () {
    const url = 'https://www.baidu.com';
    const payload = null;
    const params = {
        headers: {"Content-Type":"application/json"}
    };

    const response = http.get(url, null, params);

    check(response, {
        'is status 200': (r) => r.status === 200,
        'transaction time < 500ms': (r) => r.timings.duration < 500
    });

    if (__VU == 1) {
        console.info(JSON.stringify({
            status: response.status,
            body: response.body,
            headers: response.headers,
            timings: response.timings
        }, null, 2));
    }
}