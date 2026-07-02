console.log('Running wallet service tests...\n');

// Run Jest directly
const { execSync } = require('child_process');

try {
  execSync('npx jest', {
    stdio: 'inherit',
    cwd: __dirname + '/..'
  });
  console.log('\nAll tests passed!');
} catch (error) {
  console.error('\nTests failed');
  process.exit(1);
}
