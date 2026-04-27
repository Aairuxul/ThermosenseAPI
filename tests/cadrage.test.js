const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const results = [];
let baseUrl = process.env.BASE_URL || null;
let serverProcess = null;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });

        server.on('error', reject);
    });
}

async function waitForServer(url, timeoutMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`${url}/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // Server not ready yet.
        }

        await delay(250);
    }

    throw new Error(`API not reachable on ${url} after ${timeoutMs}ms`);
}

async function startServerForTests() {
    if (baseUrl) {
        return;
    }

    const port = await getFreePort();
    const serverLogs = [];

    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, ['src/index.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (chunk) => {
        serverLogs.push(chunk.toString());
    });

    serverProcess.stderr.on('data', (chunk) => {
        serverLogs.push(chunk.toString());
    });

    try {
        await waitForServer(baseUrl);
    } catch (error) {
        const details = serverLogs.join('').trim();
        throw new Error(`${error.message}${details ? `\nServer logs:\n${details}` : ''}`);
    }
}

async function stopServerForTests() {
    if (!serverProcess) {
        return;
    }

    const processToStop = serverProcess;
    serverProcess = null;

    if (processToStop.exitCode !== null) {
        return;
    }

    processToStop.kill();

    await Promise.race([new Promise((resolve) => processToStop.once('exit', resolve)), delay(3000)]);
}

async function request(method, routePath, { headers = {}, body } = {}) {
    const requestHeaders = { 'Content-Type': 'application/json', ...headers };
    const opts = {
        method,
        headers: requestHeaders,
    };

    if (body !== undefined) {
        opts.body = JSON.stringify(body);
    }

    const url = `${baseUrl}${routePath}`;
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => null);

    return {
        status: res.status,
        body: data,
        request: {
            method,
            url,
            headers: requestHeaders,
            ...(body !== undefined ? { body } : {}),
        },
    };
}

async function loginAs(email, password = 'root') {
    const res = await request('POST', '/auth/login', {
        body: { email, password },
    });

    if (res.status !== 200 || !res.body?.token) {
        throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }

    return res.body;
}

function report(name, expected, actual, analysis, requestDetails) {
    const pass = expected === actual;
    results.push({ name, pass });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`## ${name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Expected: ${expected}`);
    console.log(`Actual  : ${actual}`);
    console.log(`Status  : ${pass ? 'PASS' : 'FAIL'}`);
    console.log(`Request : ${requestDetails.method} ${requestDetails.url}`);
    console.log(`Headers : ${JSON.stringify(requestDetails.headers)}`);
    if (requestDetails.body !== undefined) {
        console.log(`Body    : ${JSON.stringify(requestDetails.body)}`);
    }
    console.log('Analysis:');
    console.log(analysis);
}

async function run() {
    console.log('Running cadrage tests...\n');
    await startServerForTests();

    try {
        const admin = await loginAs('root');
        const operatorA = await loginAs('operator.a@thermosense.com');
        const operatorB = await loginAs('operator.b@thermosense.com');
        const deviceSensor = await loginAs('device.sensor@thermosense.com');
        const deviceActuator = await loginAs('device.actuator@thermosense.com');

        // Q1: Un operateur de la zone A peut-il lire les mesures d'un capteur de la zone B ?
        {
            const res = await request('GET', '/sensors/sensor-5/measures', {
                headers: { Authorization: `Bearer ${operatorA.token}` },
            });

            report(
                'Q1 - operator zone A lit mesures capteur zone B',
                404,
                res.status,
                'Expected deny by BOLA (not found masking) when crossing zone boundary.',
                res.request,
            );
        }

        // Q2: Un device IoT peut-il lire sa propre configuration (GET /sensors/:id) ?
        {
            const res = await request('GET', '/sensors/sensor-1', {
                headers: { Authorization: `Bearer ${deviceSensor.token}` },
            });

            report(
                'Q2 - device lit sa config via GET /sensors/:id',
                200,
                res.status,
                "L'endpoint GET /sensors/:id existe et le device peut y acceder.",
                res.request,
            );
        }

        // Q3: Qui peut creer un nouveau capteur (POST /sensors) ?
        {
            const payload = {
                type: 'temperature',
                status: 'active',
                areaId: 'area-1',
            };

            const attempts = [
                { name: 'admin', token: admin.token, expected: 201, analysis: 'Admin peut creer un capteur.' },
                {
                    name: 'operator-a',
                    token: operatorA.token,
                    expected: 201,
                    analysis: 'Operator peut creer un capteur dans sa propre zone.',
                },
                {
                    name: 'operator-b',
                    token: operatorB.token,
                    expected: 404,
                    analysis: 'Operator ne peut pas creer un capteur dans une autre zone.',
                },
                {
                    name: 'device-sensor',
                    token: deviceSensor.token,
                    expected: 403,
                    analysis: 'Device ne peut pas creer un capteur.',
                },
            ];

            for (const attempt of attempts) {
                const res = await request('POST', '/sensors', {
                    headers: { Authorization: `Bearer ${attempt.token}` },
                    body: payload,
                });

                report(
                    `Q3 - creation capteur via POST /sensors (${attempt.name})`,
                    attempt.expected,
                    res.status,
                    attempt.analysis,
                    res.request,
                );
            }
        }

        // Q4: Quel role peut creer/piloter un actionneur via POST /areas/:areaId/actuators ?
        {
            const payload = { type: 'heater', state: 'auto' };
            const attempts = [
                {
                    name: 'admin',
                    token: admin.token,
                    expected: 201,
                    analysis: 'Admin peut creer un actionneur dans la zone cible.',
                },
                {
                    name: 'operator-a',
                    token: operatorA.token,
                    expected: 201,
                    analysis: 'Operator peut creer un actionneur dans sa propre zone.',
                },
                {
                    name: 'operator-b',
                    token: operatorB.token,
                    expected: 404,
                    analysis: 'Operator ne peut pas creer un actionneur dans une autre zone.',
                },
                {
                    name: 'device-actuator',
                    token: deviceActuator.token,
                    expected: 403,
                    analysis: 'Device ne peut pas creer un actionneur.',
                },
            ];

            for (const attempt of attempts) {
                const res = await request('POST', '/areas/area-1/actuators', {
                    headers: { Authorization: `Bearer ${attempt.token}` },
                    body: payload,
                });

                report(
                    `Q4 - creation actionneur via POST /areas/:areaId/actuators (${attempt.name})`,
                    attempt.expected,
                    res.status,
                    attempt.analysis,
                    res.request,
                );
            }
        }
    } finally {
        await stopServerForTests();
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter((result) => result.pass).length;
    for (const result of results) {
        console.log(`  ${result.pass ? 'PASS' : 'FAIL'}  ${result.name}`);
    }
    console.log(`\n${passed}/${results.length} tests passed`);

    process.exit(passed === results.length ? 0 : 1);
}

run().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
