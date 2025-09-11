#!/usr/bin/env node

/**
 * Simple deployment check script
 * Ensures code is ready for Vercel deployment
 */

const { execSync } = require('child_process');

console.log('🚀 Running deployment checks...\n');

const checks = [
  {
    name: 'TypeScript Check',
    command: 'npm run type-check',
    critical: true
  },
  {
    name: 'ESLint Check',
    command: 'npm run lint',
    critical: true
  },
  {
    name: 'Build Test',
    command: 'npm run build',
    critical: true
  },
  {
    name: 'Simple Tests',
    command: 'npm test',
    critical: false
  }
];

let allPassed = true;

for (const check of checks) {
  try {
    console.log(`⏳ Running ${check.name}...`);
    execSync(check.command, { stdio: 'pipe' });
    console.log(`✅ ${check.name} passed\n`);
  } catch (error) {
    console.log(`❌ ${check.name} failed\n`);
    if (check.critical) {
      allPassed = false;
    }
  }
}

if (allPassed) {
  console.log('🎉 All critical checks passed! Ready for deployment.');
  process.exit(0);
} else {
  console.log('💥 Critical checks failed. Fix issues before deploying.');
  process.exit(1);
}
