const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const testsDir = path.join(__dirname, 'tests');
// Read directory order is kept, except the real-browser end-to-end suite, which runs last.
const testFiles = fs
    .readdirSync(testsDir)
    .filter((f) => f.endsWith('.test.js'))
    .sort((a, b) => Number(/e2e/i.test(a)) - Number(/e2e/i.test(b)));

let allPassed = true;

console.log(`Found ${testFiles.length} test files to run in ./tests/\n`);

for (const file of testFiles) {
    console.log(`========================================================`);
    console.log(`▶️  RUNNING SUITE: ${file}`);
    console.log(`========================================================`);

    // Use spawnSync so we can capture both stdout and stderr
    const result = spawnSync('node', [path.join(testsDir, file)], {
        encoding: 'utf8',
        timeout: Number(process.env.TEST_TIMEOUT_MS) || 180000, // a hanging suite must not block CI forever
    });
    const output = (result.stdout || '') + (result.stderr || '');
    process.stdout.write(output);

    // Detect any FAILED lines in output regardless of exit code
    const hasFailed =
        result.status !== 0 ||
        /❌.*FAILED/.test(output) ||
        /FAILED:\s*[1-9]/.test(output) ||
        // a rejected promise or a printed TypeError/ReferenceError (line-start only, so a test merely
        // named "throws TypeError" passes) is a hidden failure
        /UNHANDLED/.test(output) ||
        /^\s*(Uncaught\s+)?(TypeError|ReferenceError)\b/m.test(output);
    const timedOut = result.error && result.error.code === 'ETIMEDOUT';
    if (result.error) {
        process.stdout.write(
            `\n❌ [FAILED] ${file} ${timedOut ? 'timed out' : 'could not run'}: ${result.error.message}\n`
        );
    }
    if (hasFailed || result.error) {
        allPassed = false;
        if (result.status !== 0 && !result.error)
            process.stdout.write(`\n❌ [FAILED] ${file} exited with code ${result.status}\n`);
    }
    console.log('\n'); // Spacing between suites
}

console.log(`========================================================`);
if (allPassed) {
    console.log('🎉 ALL TEST SUITES PASSED SUCCESSFULLY!');
    process.exit(0);
} else {
    console.log('💥 SOME TEST SUITES FAILED. Check the output logs above.');
    process.exit(1);
}
