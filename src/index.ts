#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { runTests } from './runner/test-runner.js';
import { discoverTests } from './utils/test-discovery.js';

async function promptForApiKey(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      'ANTHROPIC_API_KEY not found. Please enter your API key: ',
      (answer) => {
        rl.close();
        resolve(answer.trim());
      },
    );
  });
}

function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

program
  .name('nori-tests')
  .description(
    'CLI tool for running integration tests with claude-code in isolated Docker containers',
  )
  .version('1.0.0')
  .argument('<folder>', 'Path to folder containing test markdown files')
  .option('-o, --output <file>', 'Output JSON report to file')
  .option('--keep-containers', 'Keep containers after tests for debugging')
  .option('--dry-run', 'Discover tests without running them')
  .option(
    '--privileged',
    'Run containers in privileged mode (required for docker-in-docker)',
  )
  .action(
    async (
      folder: string,
      options: {
        output?: string;
        keepContainers?: boolean;
        dryRun?: boolean;
        privileged?: boolean;
      },
    ) => {
      try {
        // Validate folder exists
        const folderPath = path.resolve(folder);
        if (!fs.existsSync(folderPath)) {
          console.error(`Error: Folder does not exist: ${folderPath}`);
          process.exit(1);
        }

        // Get API key
        let apiKey = getApiKey();

        if (!apiKey && !options.dryRun) {
          // Try to prompt for API key
          if (process.stdin.isTTY) {
            apiKey = await promptForApiKey();
            if (!apiKey) {
              console.error('Error: ANTHROPIC_API_KEY is required');
              process.exit(1);
            }
          } else {
            console.error(
              'Error: ANTHROPIC_API_KEY environment variable is not set',
            );
            process.exit(1);
          }
        }

        // Discover tests
        const testFiles = discoverTests(folderPath);

        console.log(`\nnori-tests v1.0.0`);
        console.log(`================`);
        console.log(`Test folder: ${folderPath}`);
        console.log(`Tests found: ${testFiles.length}`);

        if (testFiles.length === 0) {
          console.log('\nNo test files found.');
          if (options.output) {
            const report = {
              totalTests: 0,
              passed: 0,
              failed: 0,
              results: [],
              durationMs: 0,
            };
            fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
          }
          process.exit(0);
        }

        if (options.dryRun) {
          console.log('\n[DRY RUN] Would run the following tests:');
          testFiles.forEach((f, i) => {
            console.log(`  ${i + 1}. ${path.basename(f)}`);
          });
        }

        // Run tests
        const report = await runTests(folderPath, {
          apiKey: apiKey || '',
          outputFile: options.output,
          keepContainers: options.keepContainers,
          dryRun: options.dryRun,
          privileged: options.privileged,
        });

        // Print summary
        console.log('\n================');
        console.log('Summary');
        console.log('================');
        console.log(`Total:  ${report.totalTests}`);
        console.log(`Passed: ${report.passed}`);
        console.log(`Failed: ${report.failed}`);
        console.log(`Time:   ${report.durationMs}ms`);

        // Write JSON report if requested
        if (options.output) {
          const outputPath = path.resolve(options.output);
          fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
          console.log(`\nReport written to: ${outputPath}`);
        }

        // Exit with appropriate code
        process.exit(report.failed > 0 ? 1 : 0);
      } catch (error) {
        console.error(
          'Error:',
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    },
  );

program.parse();
