#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { runTests } from './runner/test-runner.js';
import { discoverTests } from './utils/test-discovery.js';
import { StreamFormatter } from './utils/stream-formatter.js';
import { getAuthMethod } from './utils/auth.js';

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
  .option('--stream', 'Stream model output to terminal in real-time')
  .option(
    '--prefer-session',
    'Use Claude session instead of API key when both are available',
  )
  .action(
    async (
      folder: string,
      options: {
        output?: string;
        keepContainers?: boolean;
        dryRun?: boolean;
        stream?: boolean;
        preferSession?: boolean;
      },
    ) => {
      try {
        // Validate folder exists
        const folderPath = path.resolve(folder);
        if (!fs.existsSync(folderPath)) {
          console.error(`Error: Folder does not exist: ${folderPath}`);
          process.exit(1);
        }

        // Get authentication method
        let authMethod = getAuthMethod(options.preferSession);

        // Handle no authentication in non-dry-run mode
        if (authMethod.type === 'none' && !options.dryRun) {
          // Try to prompt for API key
          if (process.stdin.isTTY) {
            const apiKey = await promptForApiKey();
            if (!apiKey) {
              console.error(
                'Error: No authentication method available. Either set ANTHROPIC_API_KEY or login with: npx @anthropic-ai/claude-code login',
              );
              process.exit(1);
            }
            // Create auth method from prompted key
            authMethod = { type: 'api-key', apiKey };
          } else {
            console.error(
              'Error: No authentication method available. Either set ANTHROPIC_API_KEY or login with: npx @anthropic-ai/claude-code login',
            );
            process.exit(1);
          }
        }

        // Warn when both auth methods exist and using API key
        if (
          authMethod.type === 'api-key' &&
          authMethod.hasBoth &&
          !options.preferSession
        ) {
          console.warn(
            '\n⚠️  Warning: Both ANTHROPIC_API_KEY and Claude session found.',
          );
          console.warn('   Using API key (may incur charges).');
          console.warn(
            '   Use --prefer-session to use your subscription instead.\n',
          );
        }

        // Discover tests
        const testFiles = discoverTests(folderPath);

        console.log(`\nnori-tests v1.0.0`);
        console.log(`================`);
        console.log(
          `Authentication: ${
            authMethod.type === 'api-key'
              ? 'API Key'
              : authMethod.type === 'session'
                ? 'Claude Session'
                : 'None (dry-run)'
          }`,
        );
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
        const formatter = options.stream ? new StreamFormatter() : null;

        const report = await runTests(folderPath, {
          authMethod,
          outputFile: options.output,
          keepContainers: options.keepContainers,
          dryRun: options.dryRun,
          stream: options.stream,
          onOutput: options.stream
            ? (chunk) => {
                if (chunk.type === 'stderr') {
                  process.stderr.write(`\x1b[31m${chunk.data}\x1b[0m`);
                } else {
                  // Parse and format the stream-json output
                  const formatted = formatter!.processChunk(chunk.data);
                  for (const line of formatted) {
                    console.log(line);
                  }
                }
              }
            : undefined,
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
